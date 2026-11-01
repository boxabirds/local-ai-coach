"""The stub coach (Ceetrix story 2): walker cases, progress rule, request boundary.

TC numbers follow the story 2 design's test strategy tables.
"""

from __future__ import annotations

import importlib.util
import json
import os
import socket
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from src.coach import curriculum, stub

REPO = Path(__file__).resolve().parents[3]
LESSON = curriculum.lesson("machine")
STEP_IDS = [step["id"] for step in LESSON["steps"]]
LAST_STEP = STEP_IDS[-1]
SAMPLE_BYTES = "17179869184"


# ------------------------------------------------------------------ helpers


def ai_call(name: str, args: dict, call_id: str = "call-1") -> AIMessage:
    return AIMessage(content="", tool_calls=[{"id": call_id, "name": name, "args": args, "type": "tool_call"}])


def result(content: str, call_id: str = "call-1") -> ToolMessage:
    return ToolMessage(content=content, tool_call_id=call_id)


def step_args(step_id: str) -> dict:
    return {"station_id": "machine", "step_id": step_id}


def thread_for(name: str, args: dict, answer: str) -> list:
    return [HumanMessage(content="start"), ai_call(name, args), result(answer)]


# ------------------------------------------------------------------ walker (unit)


def test_tc01_empty_thread_names_starters():
    turn = stub.decide([], LESSON)
    assert turn.tool is None and turn.text == stub.HELP and turn.record == ()


def test_tc02_story_starter():
    turn = stub.decide([HumanMessage(content="Read Priya's story")], LESSON)
    assert turn.tool == "story"
    assert turn.args["story_id"] == "legal-letter"
    assert len(turn.args["options"]) == 3


def test_tc03_number_starter_opens_first_step():
    turn = stub.decide([HumanMessage(content="Find my number")], LESSON)
    assert turn.tool == "step_card"
    assert turn.args["step_id"] == "machine.1"
    assert turn.args["has_do_it"] is True
    assert turn.args["text"] == LESSON["steps"][0]["text"]
    assert turn.args["hint"] == LESSON["steps"][0]["hint"]


def test_tc04_map_starter():
    turn = stub.decide([HumanMessage(content="Where am I on the map?")], LESSON)
    assert turn.tool == "show_map" and turn.record == ()


def test_tc05_other_text_gets_help_and_no_tool():
    turn = stub.decide([HumanMessage(content="what's the weather?")], LESSON)
    assert turn.tool is None and turn.text == stub.HELP and turn.record == ()


def test_tc06_story_answer_records_read():
    turn = stub.decide(thread_for("story", {"story_id": "legal-letter"}, json.dumps({"read": True, "answer": stub.STORY_OPTIONS[0]})), LESSON)
    assert turn.tool is None and turn.text == stub.STORY_DONE
    assert turn.record == (("station", "d_legal", "read"),)


def test_tc07_claim_on_step_one_opens_number_card():
    turn = stub.decide(thread_for("step_card", step_args("machine.1"), '{"action":"claim"}'), LESSON)
    assert turn.tool == "number_card"
    assert turn.args["step_id"] == "machine.2" and turn.args["unit"] == "GB"
    assert turn.record == ()


def test_tc08_skip_on_step_one_records_skipped_and_moves_on():
    turn = stub.decide(thread_for("step_card", step_args("machine.1"), '{"action":"skip"}'), LESSON)
    assert turn.tool == "number_card"
    assert turn.record == (("step", "machine.1", "skipped"),)


def test_tc09_do_it_explains_then_repeats_the_card():
    turn = stub.decide(thread_for("step_card", step_args("machine.1"), '{"action":"do_it"}'), LESSON)
    assert turn.text == LESSON["steps"][0]["doIt"]["explain"]
    assert turn.tool == "step_card" and turn.args["step_id"] == "machine.1"
    assert turn.record == ()


def test_tc10_number_gives_sample_check_and_reported():
    turn = stub.decide(thread_for("number_card", step_args("machine.2"), '{"value":16}'), LESSON)
    assert turn.tool == "check_result"
    assert turn.args["passed"] is True
    assert turn.args["evidence"] == [{"probe": "memory", "cmd": "sysctl -n hw.memsize", "matched": [SAMPLE_BYTES]}]
    assert turn.args["note"] == "Sample result. The real probe arrives in step 3."
    assert turn.text == "You typed 16 GB. Here's what the check found."
    assert ("station", "machine", "reported") in turn.record
    assert all(status != "verified" for _, _, status in turn.record)


@pytest.mark.parametrize("bad", ['{"value":0}', '{"value":-2}', '{"value":"16"}', '{"value":true}', "{}"])
def test_tc10_number_out_of_range_is_refused(bad):
    turn = stub.decide(thread_for("number_card", step_args("machine.2"), bad), LESSON)
    assert turn.tool is None and turn.text == stub.BAD_RESULT and turn.record == ()


def test_tc11_rendered_check_result_opens_step_three():
    turn = stub.decide(thread_for("check_result", step_args("machine.2"), "rendered"), LESSON)
    assert turn.tool == "step_card" and turn.args["step_id"] == "machine.3"


def test_tc12_claim_on_last_step_shows_map():
    turn = stub.decide(thread_for("step_card", step_args(LAST_STEP), '{"action":"claim"}'), LESSON)
    assert turn.tool == "show_map" and turn.record == ()


def test_tc13_skip_on_last_step_records_and_shows_map():
    turn = stub.decide(thread_for("step_card", step_args(LAST_STEP), '{"action":"skip"}'), LESSON)
    assert turn.tool == "show_map"
    assert turn.record == (("step", LAST_STEP, "skipped"),)


def test_tc14_rendered_map_closes_with_text():
    turn = stub.decide(thread_for("show_map", {"focus": "machine"}, "rendered"), LESSON)
    assert turn.tool is None and turn.text == stub.MAP_TEXT


@pytest.mark.parametrize("content", ["not json", "[1, 2]", '{"action":"dance"}'])
def test_tc15_malformed_result_asks_again_and_records_nothing(content):
    turn = stub.decide(thread_for("step_card", step_args("machine.1"), content), LESSON)
    assert turn.tool is None and turn.text == stub.BAD_RESULT and turn.record == ()


def test_tc16_unknown_tool_gets_help():
    turn = stub.decide(thread_for("toggleTheme", {}, "{}"), LESSON)
    assert turn.tool is None and turn.text == stub.HELP and turn.record == ()


def test_tc16_result_for_no_known_call_gets_help():
    turn = stub.decide([HumanMessage(content="hi"), result('{"action":"claim"}', call_id="nobody")], LESSON)
    assert turn.tool is None and turn.text == stub.HELP


def _load_validator():
    spec = importlib.util.spec_from_file_location("curriculum_validate", REPO / "curriculum" / "validate.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_tc17_canned_prose_passes_the_style_check():
    validate = _load_validator()
    report = validate.Report()
    texts = [(f"canned[{i}]", text) for i, text in enumerate(stub.CANNED)]
    validate.check_voice([("apps/agent/src/coach/stub.py", texts)], validate.DEFAULT_STYLECHECK, report)
    assert [issue.code for issue in report.issues] == []


# ------------------------------------------------------------------ progress (integration, real files)


NOW = "2026-11-01T12:00:00+00:00"


def test_tc20_first_write_creates_the_file(tmp_path):
    record = stub.load(tmp_path)
    assert stub.apply(record, "station", "d_legal", "read", NOW)
    stub.save(tmp_path, record)
    saved = json.loads((tmp_path / "progress.stub.json").read_text())
    assert saved["stations"]["d_legal"] == {"status": "read", "at": NOW}
    assert saved["stub"] is True


@pytest.mark.parametrize(
    "prior, requested, expected, changed",
    [
        ("read", "reported", "reported", True),  # TC-21
        ("reported", "read", "reported", False),  # TC-22
        ("verified", "skipped", "verified", False),  # TC-23
        ("unseen", "skipped", "skipped", True),  # TC-24
        ("skipped", "reported", "reported", True),
        ("skipped", "unseen", "skipped", False),
        ("reported", "reported", "reported", False),
    ],
)
def test_tc21_to_tc24_transitions(tmp_path, prior, requested, expected, changed):
    record = stub.empty_record()
    record["stations"]["machine"] = {"status": prior, "at": NOW}
    stub.save(tmp_path, record)
    before = (tmp_path / "progress.stub.json").read_bytes()
    loaded = stub.load(tmp_path)
    assert stub.apply(loaded, "station", "machine", requested, NOW) is changed
    assert loaded["stations"]["machine"]["status"] == expected
    if not changed:
        assert (tmp_path / "progress.stub.json").read_bytes() == before


def test_tc25_real_progress_file_is_untouched(tmp_path, monkeypatch):
    real = tmp_path / "progress.json"
    real.write_text('{"schema": 1, "stations": {"machine": {"status": "verified"}}}')
    before = real.read_bytes()
    monkeypatch.setenv("COACH_HOME", str(tmp_path))
    client = TestClient(_main().app)
    for message in ("Read Priya's story", "Find my number"):
        client.post("/stub", json=_run_input([{"id": "m1", "role": "user", "content": message}]))
    record = stub.load(tmp_path)
    assert stub.apply(record, "station", "machine", "reported", NOW)
    stub.save(tmp_path, record)
    assert real.read_bytes() == before


def test_tc26_interrupted_write_leaves_the_old_file(tmp_path, monkeypatch):
    record = stub.empty_record()
    stub.apply(record, "station", "d_legal", "read", NOW)
    stub.save(tmp_path, record)
    before = (tmp_path / "progress.stub.json").read_bytes()

    def boom(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(stub.os, "replace", boom)
    stub.apply(record, "station", "machine", "reported", NOW)
    with pytest.raises(OSError):
        stub.save(tmp_path, record)
    assert (tmp_path / "progress.stub.json").read_bytes() == before
    assert [p.name for p in tmp_path.iterdir()] == ["progress.stub.json"]


def test_unreadable_record_is_treated_as_empty(tmp_path):
    (tmp_path / "progress.stub.json").write_text("{not json")
    assert stub.load(tmp_path) == stub.empty_record()


# ------------------------------------------------------------------ request boundary (integration)


def _main():
    sys.modules.pop("main", None)
    import main  # noqa: PLC0415

    return main


def _run_input(messages: list[dict], thread: str | None = None) -> dict:
    # A fresh thread per request: the stub graph's checkpointer outlives a test.
    return {"threadId": thread or os.urandom(8).hex(), "runId": "r1", "state": {}, "messages": messages, "tools": [], "context": [], "forwardedProps": {}}


def _events(response) -> list[dict]:
    return [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith("data:")]


def _types(events: list[dict]) -> list[str]:
    return [event["type"] for event in events]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("COACH_HOME", str(tmp_path))
    return TestClient(_main().app)


def test_tc30_starter_without_keys_streams_the_story_card(client):
    response = client.post("/stub", json=_run_input([{"id": "m1", "role": "user", "content": "Read Priya's story"}]))
    assert response.status_code == 200
    events = _events(response)
    starts = [e for e in events if e["type"] == "TOOL_CALL_START"]
    assert [e["toolCallName"] for e in starts] == ["story"]
    assert _types(events)[-1] == "RUN_FINISHED"
    assert "RUN_ERROR" not in _types(events)


def _story_answer_messages() -> list[dict]:
    return [
        {"id": "m1", "role": "user", "content": "Read Priya's story"},
        {
            "id": "a1",
            "role": "assistant",
            "content": "",
            "toolCalls": [{"id": "c1", "type": "function", "function": {"name": "story", "arguments": json.dumps({"story_id": "legal-letter"})}}],
        },
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": json.dumps({"read": True, "answer": stub.STORY_OPTIONS[0]})},
    ]


def test_tc31_story_result_replies_with_text_and_records_read(client, tmp_path):
    events = _events(client.post("/stub", json=_run_input(_story_answer_messages())))
    assert "TOOL_CALL_START" not in _types(events)
    text = "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert text == stub.STORY_DONE
    assert stub.load(tmp_path)["stations"]["d_legal"]["status"] == "read"
    snapshots = [e for e in events if e["type"] == "STATE_SNAPSHOT"]
    stations = {item["id"]: item for item in snapshots[-1]["snapshot"]["progress_snapshot"]}
    assert stations["d_legal"] == {"id": "d_legal", "name": "Private legal drafting", "status": "read"}
    assert list(stations) == ["d_legal", "machine", "localchat", "prove"]
    assert stations["machine"]["status"] == "unseen"


def test_tc32_stub_never_touches_the_network(client, monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("the stub tried the network")

    # TestClient is itself an httpx.Client running in process, so only the
    # socket layer and the async client the providers use are refused.
    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setattr(httpx.AsyncClient, "send", refuse)
    for messages in ([{"id": "m1", "role": "user", "content": "Find my number"}], _story_answer_messages()):
        events = _events(client.post("/stub", json=_run_input(messages)))
        assert _types(events)[-1] == "RUN_FINISHED"


def test_tc33_real_graph_still_needs_keys(client, monkeypatch):
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "TYPESAFE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    response = client.post("/", json=_run_input([{"id": "m1", "role": "user", "content": "hi"}]))
    assert response.status_code == 401


def test_tc34_story_endpoint_serves_the_file(client):
    response = client.get("/curriculum/story/legal-letter")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert response.text == (REPO / "curriculum" / "stories" / "legal-letter.md").read_text(encoding="utf-8")


@pytest.mark.parametrize("story_id", ["nope", "machine", "..%2Fscope", "..%2F..%2FREADME"])
def test_tc35_unknown_or_traversal_story_is_404(client, story_id):
    response = client.get(f"/curriculum/story/{story_id}")
    assert response.status_code == 404
    # An unknown id gets an empty body; an encoded slash never reaches the route
    # and gets FastAPI's generic 404. Neither may carry any curriculum text.
    assert response.text in ("", '{"detail":"Not Found"}')


def _snapshot_messages(events: list[dict]) -> list[dict]:
    return [e for e in events if e["type"] == "MESSAGES_SNAPSHOT"][-1]["messages"]


@pytest.mark.parametrize(
    "messages",
    [
        [{"id": "m1", "role": "user", "content": "Read Priya's story"}],  # tool call only
        [{"id": "m1", "role": "user", "content": "Find my number"}],  # tool call only
        _story_answer_messages(),  # text only
    ],
)
def test_tc38_streamed_ids_match_the_snapshot(client, messages):
    """A card streamed under one message id must keep it in the end-of-run snapshot,
    or the browser redraws the card and loses the learner's progress in it."""
    events = _events(client.post("/stub", json=_run_input(messages)))
    snapshot_ids = {m["id"] for m in _snapshot_messages(events)}
    for start in (e for e in events if e["type"] == "TOOL_CALL_START"):
        holder = next(m for m in _snapshot_messages(events) if any(t["id"] == start["toolCallId"] for t in m.get("toolCalls") or []))
        assert holder["id"] == start["parentMessageId"]
    for text in (e for e in events if e["type"] == "TEXT_MESSAGE_START"):
        assert text["messageId"] in snapshot_ids


def test_tc39_do_it_sends_text_and_card_as_two_messages_with_their_own_ids(client):
    messages = [
        {"id": "m1", "role": "user", "content": "Find my number"},
        {"id": "a1", "role": "assistant", "content": "", "toolCalls": [{"id": "c1", "type": "function", "function": {"name": "step_card", "arguments": json.dumps({"station_id": "machine", "step_id": "machine.1"})}}]},
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": json.dumps({"action": "do_it"})},
    ]
    events = _events(client.post("/stub", json=_run_input(messages)))
    text_id = next(e["messageId"] for e in events if e["type"] == "TEXT_MESSAGE_START")
    start = next(e for e in events if e["type"] == "TOOL_CALL_START")
    assert text_id != start["parentMessageId"]
    ids = [m["id"] for m in _snapshot_messages(events)]
    assert text_id in ids and start["parentMessageId"] in ids
