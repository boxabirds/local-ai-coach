"""The agentic flow (Ceetrix story 19): the whole curriculum in context, the tools the model
uses to move through it, and answers to show_next_step counting as card answers."""

from __future__ import annotations

import json

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from src.coach import thread


def shown(step: str, answer: dict, call_id: str, station: str = "machine") -> list:
    return [AIMessage(content="", tool_calls=[{"id": call_id, "name": "show_next_step", "args": {"station": station, "step": step}, "type": "tool_call"}]),
            ToolMessage(content=json.dumps(answer), tool_call_id=call_id)]


@pytest.mark.parametrize("card, answer", [("number_card", {"value": 16}), ("step_card", {"action": "claim"}), ("choice_card", {"answers": ["Fits"]})])
def test_an_answer_to_show_next_step_is_that_steps_card_answer(card, answer):
    messages = shown("machine.2", answer, "n1")
    assert thread.last_answer(messages, card, "machine.2") == answer
    assert thread.last_answer(messages, card, "machine.3") is None


def test_the_newest_answer_wins_across_both_tools():
    old = [AIMessage(content="", tool_calls=[{"id": "o1", "name": "number_card", "args": {"step_id": "machine.2"}, "type": "tool_call"}]),
           ToolMessage(content='{"value": 512}', tool_call_id="o1")]
    messages = [*old, *shown("machine.2", {"value": 16}, "n1")]
    assert thread.last_answer(messages, "number_card", "machine.2") == {"value": 16}
    assert thread.room_for(messages) == 16


# ------------------------------------------------------------------ the context (TC-01, TC-02, TC-19)

from pathlib import Path  # noqa: E402
import shutil  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from langgraph.types import Command  # noqa: E402

from src.coach import curriculum, middleware, progress, tools  # noqa: E402


def test_tc01_the_block_holds_every_station_step_chapter_and_the_story():
    block = middleware.curriculum_block()
    stations = json.loads((curriculum.root() / "stations.json").read_text())["stations"]
    assert all(f"- {s['id']}: " in block for s in stations)
    for item in curriculum.scope()["readingOrder"]:
        if item["kind"] == "lesson":
            assert all(f'"id": "{step["id"]}"' in block for step in curriculum.lesson(item["station"])["steps"])
        else:
            assert f'story_id "{item["id"]}"' in block
    assert block == middleware.curriculum_block()


def test_tc19_a_listed_file_that_is_missing_is_named(monkeypatch, tmp_path):
    copy = tmp_path / "c"
    shutil.copytree(curriculum.root(), copy)
    missing = next(i["file"] for i in curriculum.scope()["readingOrder"] if i["kind"] == "lesson")
    (copy / missing).unlink()
    monkeypatch.setenv(curriculum.ENV, str(copy))
    with pytest.raises(FileNotFoundError, match=missing):
        middleware.curriculum_block()


# ------------------------------------------------------------------ the tools (TC-03, TC-06, TC-07, TC-09)

class Runtime:
    def __init__(self, call_id="t1"):
        self.tool_call_id = call_id
        self.state = {"messages": []}


def test_tc03_tool_names_are_unique_and_the_new_ones_say_when_to_use_them():
    names = [t.name for t in tools.COACH_TOOLS]
    assert len(names) == len(set(names))
    assert "Use when" in tools.chapter_ended.description and "Use when" in tools.user_navigated.description
    assert tools.chapter_ended.description != tools.user_navigated.description


def test_tc09_the_old_two_step_tools_are_gone():
    names = {t.name for t in tools.COACH_TOOLS}
    assert not names & {"start_step", "get_station"}
    assert {"chapter_ended", "user_navigated", "run_check", "set_progress"} <= names


def test_tc06_chapter_ended_records_and_returns_the_map():
    result = tools.chapter_ended.func("machine", "Found their memory and did the test.", runtime=Runtime("ce1"))
    assert isinstance(result, Command)
    note = json.loads(result.update["messages"][0].content)
    assert note["recorded"] is True and any(s["id"] == "machine" for s in note["map"])
    event = progress.load(progress.home())["events"][-1]
    assert event["event"] == "chapter_ended" and event["station"] == "machine"
    assert tools.chapter_ended.func("nowhere", "x", runtime=Runtime()).startswith("No station")


def test_tc06_a_failed_write_says_recorded_false(monkeypatch):
    def fail(*a, **k):
        raise OSError("disk full")
    monkeypatch.setattr(progress, "save", fail)
    result = tools.chapter_ended.func("machine", "done", runtime=Runtime())
    assert json.loads(result.update["messages"][0].content)["recorded"] is False


def test_tc07_user_navigated_records_the_detour_and_says_where_they_were():
    tools._record_event("step_shown", station="machine", step="machine.3")
    out = json.loads(tools.user_navigated.func("KV cache", "asked what a KV cache is", None))
    assert out["recorded"] is True and out["was_at"]["step"] == "machine.3"
    event = progress.load(progress.home())["events"][-1]
    assert event == {**event, "event": "user_navigated", "topic": "KV cache", "details": "asked what a KV cache is", "station": None}


def test_events_are_capped():
    for n in range(tools.MAX_EVENTS + 5):
        tools._record_event("step_shown", station="machine", step=f"s{n}")
    assert len(progress.load(progress.home())["events"]) == tools.MAX_EVENTS


# ------------------------------------------------------------------ the step route (TC-04)

def test_tc04_the_step_route_serves_a_step():
    """Story 22 changed this: the route only reads. step_shown comes from the model's own call
    (test_step_record.py), because a reload re-fetched every old card and rewrote history."""
    import main

    client = TestClient(main.app)
    step = curriculum.lesson("machine")["steps"][0]
    response = client.get(f"/curriculum/step/machine/{step['id']}")
    assert response.status_code == 200 and response.json() == {"station": "machine", "step": step}
    assert client.get("/curriculum/step/machine/machine.99").status_code == 404
    assert client.get("/curriculum/step/nowhere/x.1").status_code == 404


# ------------------------------------------------------------------ one naming, and skips that stay on the step (D-11)

def test_run_check_and_set_progress_take_station_and_step_like_the_other_tools():
    for t in (tools.run_check, tools.set_progress, tools.chapter_ended):
        assert "station" in t.args
    assert "step" in tools.run_check.args and "step" in tools.set_progress.args
    assert not {"station_id", "step_id"} & set(tools.run_check.args) | ({"station_id", "step_id"} & set(tools.set_progress.args))


def test_a_skip_without_its_step_is_refused_and_nothing_is_written():
    out = tools.set_progress.func("machine", "skipped", runtime=Runtime())
    assert out.startswith("Refused: say which step")
    assert not (progress.home() / "progress.json").exists()


def test_a_passing_check_is_found_under_either_argument_name():
    from langchain_core.messages import AIMessage, ToolMessage
    verdict = '{"passed": true, "checked": true}'
    for args in ({"station": "machine", "step": "machine.2"}, {"station_id": "machine", "step_id": "machine.2"}):
        messages = [AIMessage(content="", tool_calls=[{"id": "r", "name": "run_check", "args": args, "type": "tool_call"}]), ToolMessage(content=verdict, tool_call_id="r")]
        assert thread.passing_check(messages, "machine.2") is not None
