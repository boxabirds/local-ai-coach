"""A tester's feedback as one file to send the author (Ceetrix story 34, TC-01 to TC-20).
COACH_HOME is a real temp folder per test (conftest): the folder is the store under test.
Messages follow the browser's agent.messages shape, as in test_ratings.py; the error events
are the turn log's real shape. Wording is made up, never the curriculum's."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.coach import feedback, progress, ratings, restart, turn_log

WHEN = datetime(2026, 11, 8, 10, 0, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 11, 8, 11, 0, 0, tzinfo=timezone.utc)
FAKE_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123456789"


def conversation() -> list[dict]:
    return [
        {"id": "u1", "role": "user", "content": "Start me off"},
        {"id": "a1", "role": "assistant", "content": "Here is the alpha step."},
    ]


def note_body(**overrides) -> dict:
    out = {"thread_id": "thread-1", "note": "I got lost after alpha", "coach": "model", "messages": conversation()}
    out.update(overrides)
    return out


def rating_body(**overrides) -> dict:
    out = {"thread_id": "thread-1", "message_id": "a1", "rating": "down", "reason": None,
           "item": {"kind": "bubble", "text": "Here is the alpha step."}, "messages": conversation()}
    out.update(overrides)
    return out


def error_event(at: str, message: str = "never executed") -> dict:
    return {"at": at, "event": "error", "where": "tool", "thread": "thread-1", "type": "AssertionError",
            "message": message, "ms": 1, "name": "made_up_tool"}


def write_log(events: list[dict], day: str = "2026-11-08") -> None:
    folder = turn_log.log_dir()
    folder.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(e) for e in events] + [json.dumps({"at": "2026-11-08T09:00:00.000+00:00", "event": "tool_call", "thread": "t"})]
    (folder / f"coach-{day}.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")


def client() -> TestClient:
    app = FastAPI()
    app.include_router(feedback.router)
    app.include_router(ratings.router)
    app.include_router(restart.router)
    return TestClient(app)


# TC-01
def test_tc01_a_note_is_kept_with_its_conversation(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-made-up")
    saved = feedback.save_note(feedback.build_note(note_body(), WHEN), WHEN)
    record = json.loads((progress.home() / saved).read_text())
    assert saved.startswith("notes/")
    assert record["note"] == "I got lost after alpha"
    assert record["thread_id"] == "thread-1"
    assert record["served_by"] == {"kind": "hosted", "model": "gpt-made-up"}
    assert [h["type"] for h in record["history"]] == ["human", "ai"]
    assert set(record["fingerprints"]) == {"prompt", "skills", "curriculum"}


# TC-02, TC-20
def test_tc02_a_note_made_on_the_stub_says_the_stub_answered():
    assert feedback.build_note(note_body(coach="stub"), WHEN)["served_by"] == {"kind": "stub"}


def test_tc20_a_rating_made_on_the_stub_says_the_stub_answered():
    assert ratings.build(rating_body(coach="stub"), WHEN)["served_by"] == {"kind": "stub"}
    assert ratings.build(rating_body(), WHEN)["served_by"]["kind"] == "hosted"


# TC-03, TC-04, TC-05
@pytest.mark.parametrize("bad", [
    {"note": ""}, {"note": "   "}, {"note": None}, {"note": "x" * (feedback.MAX_NOTE + 1)},
    {"messages": "not a list"}, {"messages": [{"role": "user"}] * (ratings.MAX_MESSAGES + 1)}, {"messages": ["not a dict"]},
])
def test_tc03_to_05_a_body_that_isnt_a_note_is_refused(bad):
    with pytest.raises(feedback.Invalid):
        feedback.build_note(note_body(**bad), WHEN)


@pytest.mark.parametrize("ok", [{"note": "x"}, {"note": "x" * feedback.MAX_NOTE}, {"messages": []}])
def test_tc04_05_the_boundaries_that_are_kept(ok):
    assert feedback.build_note(note_body(**ok), WHEN)["note"]


def test_tc03_a_refused_note_writes_nothing():
    response = client().post("/coach/note", json=note_body(note=" "))
    assert response.status_code == 422
    assert not (progress.home() / feedback.NOTES_DIR).exists()


# TC-06
def test_tc06_a_key_in_the_note_or_conversation_is_never_written():
    messages = [{"id": "u1", "role": "user", "content": f"my key is {FAKE_KEY}"}]
    saved = feedback.save_note(feedback.build_note(note_body(note=f"key {FAKE_KEY}", messages=messages), WHEN), WHEN)
    text = (progress.home() / saved).read_text()
    assert FAKE_KEY not in text
    assert turn_log.REDACTED in text


# TC-07, TC-18
@pytest.mark.parametrize("method, path", [("post", "/coach/note"), ("get", "/coach/feedback"), ("post", "/coach/feedback/file")])
def test_tc07_18_a_browser_cannot_call_the_agent_directly(method, path):
    headers = {"Origin": "http://localhost:3000"}
    c = client()
    response = c.get(path, headers=headers) if method == "get" else c.post(path, json=note_body(), headers=headers)
    assert response.status_code == 403
    assert not (progress.home() / feedback.NOTES_DIR).exists()
    assert not (progress.home() / feedback.SENT_FILE).exists()


# TC-08
def test_tc08_restart_coach_keeps_notes_ratings_and_what_was_saved():
    c = client()
    c.post("/coach/note", json=note_body())
    c.post("/coach/rating", json=rating_body())
    c.post("/coach/feedback/file")
    c.post("/coach/note", json=note_body(note="second"))
    before = sorted(p.relative_to(progress.home()).as_posix() for p in progress.home().rglob("*.json"))
    assert c.post("/coach/restart").status_code == 200
    after = sorted(p.relative_to(progress.home()).as_posix() for p in progress.home().rglob("*.json") if "old" not in p.parts)
    assert [p for p in before if not p.startswith("progress")] == [p for p in after if not p.startswith("progress")]
    assert c.get("/coach/feedback").json() == {"unsent": 1}


# TC-09
def test_tc09_nothing_yet_counts_zero():
    assert client().get("/coach/feedback").json() == {"unsent": 0}


# TC-10
def test_tc10_counts_ratings_and_notes_not_yet_in_a_file():
    c = client()
    c.post("/coach/rating", json=rating_body())
    c.post("/coach/feedback/file")
    c.post("/coach/rating", json=rating_body(rating="up"))
    c.post("/coach/rating", json=rating_body(message_id="a1"))
    c.post("/coach/note", json=note_body())
    assert c.get("/coach/feedback").json() == {"unsent": 3}


# TC-11
def test_tc11_an_unreadable_record_of_what_was_saved_counts_as_none_saved():
    c = client()
    c.post("/coach/note", json=note_body())
    (progress.home() / feedback.SENT_FILE).write_text("{not json", encoding="utf-8")
    assert c.get("/coach/feedback").json() == {"unsent": 1}


# TC-12, TC-16
def test_tc12_the_file_holds_every_new_rating_and_note(monkeypatch, tmp_path):
    version = tmp_path / "VERSION"
    version.write_text("9.9.9\n")
    monkeypatch.setattr(feedback, "VERSION_FILE", version)
    c = client()
    c.post("/coach/rating", json=rating_body())
    c.post("/coach/note", json=note_body())
    reply = c.post("/coach/feedback/file").json()
    assert reply["filename"].startswith("coach-feedback-") and reply["filename"].endswith(".json")
    file = reply["file"]
    assert file["version"] == "9.9.9"
    assert file["made_at"]
    assert [r["rating"] for r in file["ratings"]] == ["down"]
    assert [n["note"] for n in file["notes"]] == ["I got lost after alpha"]
    assert c.get("/coach/feedback").json() == {"unsent": 0}


def test_tc16_without_a_release_the_version_is_dev(monkeypatch, tmp_path):
    monkeypatch.setattr(feedback, "VERSION_FILE", tmp_path / "missing")
    assert feedback.version() == feedback.DEV_VERSION


# TC-13
def test_tc13_a_second_file_holds_only_what_came_after_the_first():
    c = client()
    c.post("/coach/rating", json=rating_body())
    c.post("/coach/feedback/file")
    c.post("/coach/rating", json=rating_body(rating="up"))
    file = c.post("/coach/feedback/file").json()["file"]
    assert [r["rating"] for r in file["ratings"]] == ["up"]
    assert file["notes"] == []


# TC-14, TC-15
def test_tc14_errors_after_the_last_file_go_in_and_the_mark_moves():
    write_log([error_event("2026-11-08T09:30:00.000+00:00", "first")])
    first = feedback.build_file(WHEN)
    feedback.mark_sent(first.paths, first.errors_through)
    assert [e["message"] for e in first.file["errors"]] == ["first"]
    write_log([error_event("2026-11-08T09:30:00.000+00:00", "first"), error_event("2026-11-08T10:30:00.000+00:00", "second")])
    second = feedback.build_file(LATER)
    assert [e["message"] for e in second.file["errors"]] == ["second"]
    assert second.errors_through == "2026-11-08T10:30:00.000+00:00"


def test_tc15_no_errors_leaves_the_mark_where_it_was():
    write_log([error_event("2026-11-08T09:30:00.000+00:00")])
    first = feedback.build_file(WHEN)
    feedback.mark_sent(first.paths, first.errors_through)
    again = feedback.build_file(LATER)
    assert again.file["errors"] == []
    assert again.errors_through == first.errors_through


# TC-17
def test_tc17_an_unreadable_record_fails_the_file_and_marks_nothing():
    c = client()
    c.post("/coach/note", json=note_body())
    c.post("/coach/feedback/file")
    c.post("/coach/note", json=note_body(note="second"))
    sent_before = (progress.home() / feedback.SENT_FILE).read_text()
    broken = progress.home() / feedback.NOTES_DIR / "29990101T000000Z-deadbeef.json"
    broken.write_text("{oops", encoding="utf-8")
    response = c.post("/coach/feedback/file")
    assert response.status_code == 500
    assert isinstance(response.json()["error"], str)
    assert (progress.home() / feedback.SENT_FILE).read_text() == sent_before
    assert c.get("/coach/feedback").json() == {"unsent": 2}


# TC-19
def test_tc19_a_key_in_an_error_never_reaches_the_file():
    write_log([error_event("2026-11-08T09:30:00.000+00:00", f"bad key {FAKE_KEY}")])
    text = json.dumps(feedback.build_file(WHEN).file)
    assert FAKE_KEY not in text
    assert turn_log.REDACTED in text
