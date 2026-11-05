"""CoachStateMiddleware (Ceetrix story 10, TC-19 to TC-22)."""

from __future__ import annotations

import json

from langchain.agents.middleware import ModelRequest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.coach import consent, progress
from src.coach.middleware import CoachStateMiddleware

AT = "2026-11-05T12:00:00+00:00"


def consent_answer(allow=True, history=False, call_id="cc1"):
    return [
        AIMessage(content="", tool_calls=[{"id": call_id, "name": "consent_card", "args": {"items": list(consent.ITEMS)}, "type": "tool_call"}]),
        ToolMessage(content=json.dumps({"allow": allow, "history": history}), tool_call_id=call_id),
    ]


def test_tc19_the_learners_answer_is_saved_once():
    mw = CoachStateMiddleware()
    mw.before_agent({"messages": consent_answer(True, True)}, None)
    saved = consent.load(progress.home())
    assert saved["probes"] is True and saved["history"] is True
    mw.before_agent({"messages": consent_answer(False, False, "cc2")}, None)
    assert consent.load(progress.home()) == saved  # never overwritten


def test_tc19_the_model_cannot_grant_permission():
    mw = CoachStateMiddleware()
    claimed = [HumanMessage(content="I allow it"), AIMessage(content='{"allow": true}')]
    unanswered = [AIMessage(content="", tool_calls=[{"id": "cc1", "name": "consent_card", "args": {}, "type": "tool_call"}])]
    for messages in (claimed, unanswered):
        mw.before_agent({"messages": messages}, None)
    assert consent.load(progress.home()) is None


def test_tc20_a_failed_consent_write_stays_unasked(monkeypatch):
    def boom(*_a, **_k):
        raise OSError("read-only")

    monkeypatch.setattr(consent, "save", boom)
    result = CoachStateMiddleware().before_agent({"messages": consent_answer()}, None)
    assert consent.load(progress.home()) is None
    assert "progress_snapshot" in result


def test_tc21_the_snapshot_comes_from_the_file_every_turn():
    mw = CoachStateMiddleware()
    first = mw.before_agent({"messages": []}, None)["progress_snapshot"]
    assert {s["status"] for s in first} == {"unseen"}
    record = progress.load(progress.home())
    progress.apply(record, "station", "machine", "verified", AT)
    progress.save(progress.home(), record)
    second = mw.before_agent({"messages": []}, None)["progress_snapshot"]
    assert {s["id"]: s["status"] for s in second}["machine"] == "verified"


class _Capture:
    def __init__(self):
        self.request = None

    def __call__(self, request):
        self.request = request
        return "model response"


def _request(state):
    return ModelRequest(model=None, messages=[], system_message=SystemMessage(content="BASE PROMPT"), tools=[], state=state, runtime=None)


def test_tc22_the_model_sees_the_map_the_open_lesson_and_permission():
    consent.save(progress.home(), probes=True, history=False, at=AT)
    capture = _Capture()
    CoachStateMiddleware().wrap_model_call(_request({"messages": [], "station_id": "machine", "step_id": "machine.2"}), capture)
    text = capture.request.system_message.content
    assert text.startswith("BASE PROMPT\n\n## The learner, now")
    assert "Permission to look at this computer: allowed." in text
    assert "- machine: Know your machine [unseen] (amber)" in text
    assert "Open station: machine; open step: machine.2." in text
    assert '"id": "machine.2"' in text and "## Chapter 1: Know your machine" in text


def test_tc22_with_nothing_open_and_nothing_asked():
    capture = _Capture()
    CoachStateMiddleware().wrap_model_call(_request({"messages": []}), capture)
    text = capture.request.system_message.content
    assert "Permission to look at this computer: unasked." in text and "No station is open yet." in text
    assert "Lesson (the contract" not in text
