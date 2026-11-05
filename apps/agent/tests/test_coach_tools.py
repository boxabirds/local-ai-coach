"""The coach's tools (Ceetrix story 10, TC-06 to TC-18).

Tools are called as the agent calls them, with a ToolRuntime whose state holds
a realistic thread: the card calls the model made and the learner's answers.
"""

from __future__ import annotations

import json

import pytest
from langchain.tools import ToolRuntime
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.types import Command

from src.coach import consent, progress, tools

AT = "2026-11-05T12:00:00+00:00"


def runtime(messages=(), call_id="call-x"):
    return ToolRuntime(state={"messages": list(messages)}, context=None, config={}, stream_writer=lambda _: None, tool_call_id=call_id, store=None)


def card(name, args, answer, call_id):
    return [AIMessage(content="", tool_calls=[{"id": call_id, "name": name, "args": args, "type": "tool_call"}]), ToolMessage(content=answer, tool_call_id=call_id)]


def number(value, step="machine.2"):
    return card("number_card", {"station_id": "machine", "step_id": step, "prompt": "Type it", "unit": "GB"}, json.dumps({"value": value}), "n1")


def check_result(verdict, step="machine.2", call_id="rc1"):
    return card("run_check", {"station_id": "machine", "step_id": step}, json.dumps({"station_id": "machine", "step_id": step, **verdict}), call_id)


class Machine:
    def __init__(self, gb=16):
        self.gb, self.calls = gb, []

    def __call__(self, name, params=None, **kw):
        self.calls.append(name)
        return {"probe": name, "cmd": "sysctl -n hw.memsize", "matched": [str(self.gb * 1024**3)], "value": self.gb}


@pytest.fixture
def machine(monkeypatch):
    m = Machine()
    monkeypatch.setattr(tools, "RUN", m)
    return m


def allow():
    consent.save(progress.home(), probes=True, history=False, at=AT)


PASSED = {"passed": True, "checked": True, "note": "ok", "evidence": [{"probe": "memory", "cmd": "sysctl -n hw.memsize", "matched": ["17179869184"]}], "measured": 16}


def test_tc08_run_check_reads_the_typed_number_from_the_thread(machine):
    allow()
    out = json.loads(tools.run_check.func("machine", "machine.2", runtime=runtime(number(16))))
    assert out["passed"] is True and out["measured"] == 16 and out["step_id"] == "machine.2"
    assert out["evidence"][0]["matched"] == [str(16 * 1024**3)]
    assert machine.calls == ["memory"]


def test_tc08_the_newest_answer_counts(machine):
    allow()
    thread = [*number(512), *card("number_card", {"station_id": "machine", "step_id": "machine.2"}, '{"value": 16}', "n2")]
    assert json.loads(tools.run_check.func("machine", "machine.2", runtime=runtime(thread)))["passed"] is True


def test_tc09_no_consent_answer_runs_nothing(machine):
    out = json.loads(tools.run_check.func("machine", "machine.2", runtime=runtime(number(16))))
    assert out["needs"] == "consent" and out["items"] == list(consent.ITEMS)
    assert machine.calls == []


def test_tc10_declined_is_not_checked_and_runs_nothing(machine):
    consent.save(progress.home(), probes=False, history=False, at=AT)
    out = json.loads(tools.run_check.func("machine", "machine.2", runtime=runtime(number(16))))
    assert out["checked"] is False and out["passed"] is False and machine.calls == []


def test_tc11_no_number_in_the_thread_runs_nothing(machine):
    allow()
    out = tools.run_check.func("machine", "machine.2", runtime=runtime([HumanMessage(content="16")]))
    assert out.startswith("There's no number from the learner for machine.2") and machine.calls == []
    other_step = tools.run_check.func("machine", "machine.2", runtime=runtime(number(16, step="machine.3")))
    assert other_step.startswith("There's no number") and machine.calls == []


def test_tc12_an_ask_check_returns_the_rubric(machine):
    out = json.loads(tools.run_check.func("localchat", "localchat.4", runtime=runtime()))
    assert out["question"] == "Which machine answered?" and "Names the machine" in out["judge"]
    assert machine.calls == []


def test_tc13_a_practice_terminal_check_waits_for_step_five(machine):
    assert tools.run_check.func("localchat", "localchat.1", runtime=runtime()) == tools.STEP_FIVE
    assert tools.run_check.func("machine", "machine.9", runtime=runtime()).startswith("No step")


def test_tc14_verified_with_a_passing_check_for_that_step():
    result = tools.set_progress.func("machine", "verified", runtime=runtime(check_result(PASSED), call_id="p1"), step_id="machine.2")
    assert isinstance(result, Command)
    record = progress.load(progress.home())
    assert record["steps"]["machine.2"]["status"] == "verified" and record["stations"]["machine"]["status"] == "verified"
    assert record["steps"]["machine.2"]["evidence"] == PASSED["evidence"]
    assert {s["id"]: s["status"] for s in result.update["progress_snapshot"]}["machine"] == "verified"


@pytest.mark.parametrize("thread, step", [
    ([], "machine.2"),
    (check_result({**PASSED, "passed": False}), "machine.2"),
    (check_result({**PASSED, "checked": False, "passed": False}), "machine.2"),
    (check_result(PASSED, step="machine.3"), "machine.2"),
    (check_result(PASSED), None),
])
def test_tc15_verified_without_a_passing_check_for_that_step_is_refused(thread, step):
    out = tools.set_progress.func("machine", "verified", runtime=runtime(thread), step_id=step)
    assert out.startswith("Refused: verified needs a passing run_check")
    assert not (progress.home() / "progress.json").exists()


def test_tc15_a_newer_failing_check_outranks_an_older_pass():
    thread = [*check_result(PASSED, call_id="r1"), *check_result({**PASSED, "passed": False}, call_id="r2")]
    assert tools.set_progress.func("machine", "verified", runtime=runtime(thread), step_id="machine.2").startswith("Refused")


def test_tc16_downgrade_refused_skip_recorded_and_bad_input_refused():
    tools.set_progress.func("machine", "reported", runtime=runtime(), step_id="machine.1")
    before = (progress.home() / "progress.json").read_bytes()
    out = tools.set_progress.func("machine", "read", runtime=runtime(), step_id="machine.1")
    assert out.startswith("Not changed: machine is already reported")
    assert (progress.home() / "progress.json").read_bytes() == before
    assert isinstance(tools.set_progress.func("machine", "skipped", runtime=runtime(), step_id="machine.3"), Command)
    assert progress.load(progress.home())["steps"]["machine.3"]["status"] == "skipped"
    assert tools.set_progress.func("machine", "assisted", runtime=runtime()).startswith("status must be one of")
    assert tools.set_progress.func("nowhere", "reported", runtime=runtime()) == "No station 'nowhere' in V1."


def test_tc16_a_failed_write_is_reported_and_nothing_recorded(monkeypatch):
    def boom(*_a, **_k):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(progress.os, "replace", boom)
    out = tools.set_progress.func("machine", "reported", runtime=runtime(), step_id="machine.1")
    assert out == "I couldn't save progress (No space left on device). Nothing was recorded."
    assert not (progress.home() / "progress.json").exists()


def test_tc17_probe_needs_consent(machine):
    assert json.loads(tools.probe.func("memory"))["needs"] == "consent" and machine.calls == []
    allow()
    assert json.loads(tools.probe.func("memory"))["value"] == 16


def test_tc18_end_session_appends(tmp_path):
    assert tools.end_session.func("Found the number; fits test next.") == "Saved."
    assert progress.load(progress.home())["sessions"][0]["summary"] == "Found the number; fits test next."


def test_tc12b_a_claim_answers_a_check_marked_answered_by_claim(machine):
    claimed = card("step_card", {"station_id": "machine", "step_id": "machine.1"}, '{"action": "claim"}', "sc1")
    out = json.loads(tools.run_check.func("machine", "machine.1", runtime=runtime(claimed)))
    assert out == {"answered": "claim", "say": tools.CLAIM_ANSWERS}
    skipped = card("step_card", {"station_id": "machine", "step_id": "machine.1"}, '{"action": "skip"}', "sc1")
    assert "judge" in json.loads(tools.run_check.func("machine", "machine.1", runtime=runtime(skipped)))
    assert "judge" in json.loads(tools.run_check.func("machine", "machine.1", runtime=runtime()))
    # machine.3 is a choice card (story 11), so a claim never answers it.
    claimed3 = card("step_card", {"station_id": "machine", "step_id": "machine.3"}, '{"action": "claim"}', "sc3")
    assert tools.run_check.func("machine", "machine.3", runtime=runtime(claimed3)).startswith("Show the choice card for machine.3")
    assert machine.calls == []



# ------------------------------------------------------------------ choices (story 11, TC-09)

RIGHT = ["Fits", "Fits", "Doesn't fit"]


def choices(answers, call_id="ch1"):
    return card("choice_card", {"station_id": "machine", "step_id": "machine.3"}, json.dumps({"answers": answers}), call_id)


def test_s11_tc09_run_check_marks_the_fits_test_against_the_measured_number():
    thread = [*check_result(PASSED), *choices(RIGHT)]
    out = json.loads(tools.run_check.func("machine", "machine.3", runtime=runtime(thread)))
    assert out["passed"] is True and out["measured"] == 16 and out["note"] == "On your 16 GB: 2 GB fits, 5 GB fits, 20 GB doesn't fit."


def test_s11_tc09_run_check_without_answers_or_without_a_number():
    assert tools.run_check.func("machine", "machine.3", runtime=runtime(check_result(PASSED))).startswith("Show the choice card for machine.3")
    assert tools.run_check.func("machine", "machine.3", runtime=runtime(choices(RIGHT))) == "There's no memory number yet. Show the number card first."
    bad = tools.run_check.func("machine", "machine.3", runtime=runtime([*check_result(PASSED), *choices(["Fits"])]))
    assert bad.startswith("The answers didn't match the card")
