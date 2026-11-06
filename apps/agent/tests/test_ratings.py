"""Ratings of the coach's turns (Ceetrix story 26, TC-13 to TC-21 and TC-24). COACH_HOME is a real
temp folder per test (conftest). The messages follow the shape the browser's agent.messages has
(apps/app/src/lib/chat-store.ts): role, content, toolCalls with function.arguments as a JSON
string, toolCallId. Step ids and wording are made up, never the curriculum's."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.coach import progress, ratings, restart, server_model

WHEN = datetime(2026, 11, 6, 9, 0, 0, tzinfo=timezone.utc)
FAKE_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123456789"


def conversation() -> list[dict]:
    return [
        {"id": "u1", "role": "user", "content": "Start me off"},
        {"id": "a1", "role": "assistant", "content": "", "toolCalls": [
            {"id": "c1", "type": "function", "function": {"name": "show_next_step", "arguments": json.dumps({"station": "alpha", "step": "alpha.1"})}},
        ]},
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": json.dumps({"action": "claim"})},
        {"id": "a2", "role": "assistant", "content": "Good. Next, the beta step."},
        {"id": "u2", "role": "user", "content": "Later question"},
        {"id": "a3", "role": "assistant", "content": "Later answer"},
    ]


def body(**overrides) -> dict:
    out = {"thread_id": "thread-1", "message_id": "a1", "rating": "down", "reason": "asked twice",
           "item": {"kind": "step", "text": "Do the alpha thing"}, "messages": conversation()}
    out.update(overrides)
    return out


# TC-13
def test_tc13_browser_messages_become_the_eval_cases_shape():
    history = ratings.to_history(conversation()[:4])
    assert history == [
        {"type": "human", "content": "Start me off"},
        {"type": "ai", "content": "", "tool_calls": [{"id": "c1", "name": "show_next_step", "args": {"station": "alpha", "step": "alpha.1"}}]},
        {"type": "tool", "content": json.dumps({"action": "claim"}), "tool_call_id": "c1", "name": "show_next_step"},
        {"type": "ai", "content": "Good. Next, the beta step."},
    ]


def test_tc13b_system_and_unknown_roles_are_left_out_and_parts_are_joined():
    history = ratings.to_history([
        {"id": "s", "role": "system", "content": "secret prompt"},
        {"id": "d", "role": "developer", "content": "more"},
        {"id": "u", "role": "user", "content": [{"type": "text", "text": "Hel"}, {"type": "text", "text": "lo"}]},
    ])
    assert history == [{"type": "human", "content": "Hello"}]


def test_tc13c_unparseable_arguments_are_kept_not_lost():
    history = ratings.to_history([{"id": "a", "role": "assistant", "toolCalls": [{"id": "c", "function": {"name": "x", "arguments": "{oops"}}]}])
    assert history[0]["tool_calls"][0]["args"] == {"_unparsed": "{oops"}


# TC-14
def test_tc14_history_stops_after_the_rated_message_and_its_tool_results():
    record = ratings.build(body(), WHEN)
    assert [m["id"] for m in record["messages"]] == ["u1", "a1", "t1"]
    assert record["rated_index"] == 1
    assert [h["type"] for h in record["history"]] == ["human", "ai", "tool"]


@pytest.mark.parametrize("message_id, kept", [("a2", ["u1", "a1", "t1", "a2"]), ("a3", ["u1", "a1", "t1", "a2", "u2", "a3"])])
def test_tc14b_a_text_reply_and_the_last_message(message_id, kept):
    assert [m["id"] for m in ratings.build(body(message_id=message_id), WHEN)["messages"]] == kept


def test_tc14c_the_record_says_what_was_rated_and_when():
    record = ratings.build(body(reason="  asked twice  "), WHEN)
    assert record["schema"] == ratings.SCHEMA
    assert record["at"] == "2026-11-06T09:00:00+00:00"
    assert (record["rating"], record["reason"], record["thread_id"]) == ("down", "asked twice", "thread-1")
    assert record["item"] == {"kind": "step", "text": "Do the alpha thing"}
    assert set(record["fingerprints"]) == {"prompt", "skills", "curriculum"}
    assert all(isinstance(v, str) and len(v) == ratings.FINGERPRINT_CHARS for v in record["fingerprints"].values())


def test_tc14d_an_empty_reason_is_no_reason():
    assert ratings.build(body(reason=""), WHEN)["reason"] is None
    assert ratings.build(body(reason=None), WHEN)["reason"] is None


def test_tc14e_fingerprints_are_stable():
    assert ratings.fingerprints() == ratings.fingerprints()


# TC-15: every invalid class, and the boundaries
@pytest.mark.parametrize("bad", [
    "not an object",
    body(rating="meh"),
    body(rating=None),
    body(message_id=None),
    body(message_id=""),
    body(message_id="nowhere"),
    body(message_id="u1"),  # the learner's own message
    body(messages=[]),
    body(messages="nope"),
    body(messages=[{"id": "a1", "role": "assistant"}] * (ratings.MAX_MESSAGES + 1)),
    body(messages=["not a message"]),
    body(reason="x" * (ratings.MAX_REASON + 1)),
    body(reason=7),
])
def test_tc15_invalid_bodies_are_refused(bad):
    with pytest.raises(ratings.Invalid):
        ratings.build(bad, WHEN)


def test_tc15b_the_boundaries_themselves_are_accepted():
    ratings.build(body(reason="x" * ratings.MAX_REASON), WHEN)
    many = [{"id": f"a{i}", "role": "assistant", "content": "x"} for i in range(ratings.MAX_MESSAGES)]
    ratings.build(body(messages=many, message_id="a0"), WHEN)


# TC-16
def test_tc16_keys_never_reach_the_record():
    messages = conversation()
    messages[0]["content"] = f"my key is {FAKE_KEY}"
    record = ratings.build(body(messages=messages, reason=f"leaked {FAKE_KEY}"), WHEN)
    assert FAKE_KEY not in json.dumps(record)


# TC-24
def test_tc24_served_by_names_the_chosen_server_or_the_hosted_model(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-made-up")
    assert ratings.served_by() == {"kind": "hosted", "model": "gpt-made-up"}
    server_model.save("http://box.example:8080/v1", "made-up-model")
    assert ratings.served_by() == {"kind": "server", "host": "box.example:8080", "model": "made-up-model"}


# TC-17 to TC-21: the real route, through FastAPI
def client() -> TestClient:
    app = FastAPI()
    app.include_router(ratings.router)
    app.include_router(restart.router)
    return TestClient(app)


def files() -> list:
    folder = ratings.folder()
    return sorted(folder.glob("*.json")) if folder.is_dir() else []


def test_tc17_the_coach_saves_one_file_and_says_where():
    assert files() == []
    response = client().post("/coach/rating", json=body())
    assert response.status_code == 200
    saved = files()
    assert len(saved) == 1
    assert response.json() == {"saved": f"ratings/{saved[0].name}"}
    kept = json.loads(saved[0].read_text(encoding="utf-8"))
    assert (kept["rating"], kept["reason"], kept["message_id"]) == ("down", "asked twice", "a1")
    assert not list(ratings.folder().glob(".*.tmp"))  # written by rename, no leftovers


def test_tc17b_two_ratings_are_two_files():
    c = client()
    c.post("/coach/rating", json=body())
    c.post("/coach/rating", json=body(rating="up", reason=None))
    assert len(files()) == 2


@pytest.mark.parametrize("header", [{"Origin": "http://localhost:3000"}, {"Sec-Fetch-Site": "same-origin"}])
def test_tc18_a_browser_is_refused_and_nothing_is_saved(header):
    response = client().post("/coach/rating", json=body(), headers=header)
    assert response.status_code == 403
    assert response.json() == {"error": ratings.NOT_OURS}
    assert files() == []


@pytest.mark.parametrize("payload", [{"content": b"{not json", "headers": {"content-type": "application/json"}}, {"json": body(rating="meh")}])
def test_tc19_an_invalid_rating_is_refused_and_nothing_is_saved(payload):
    response = client().post("/coach/rating", **payload)
    assert response.status_code == 422
    assert response.json() == {"error": ratings.BAD_RATING}
    assert files() == []


def test_tc20_a_write_that_fails_says_so():
    home = progress.home()
    home.mkdir(parents=True, exist_ok=True)
    (home / ratings.RATINGS_DIR).write_text("in the way", encoding="utf-8")
    response = client().post("/coach/rating", json=body())
    assert response.status_code == 500
    assert response.json() == {"error": ratings.NOT_SAVED}
    assert (home / ratings.RATINGS_DIR).read_text(encoding="utf-8") == "in the way"


def test_tc21_restart_leaves_ratings_where_they_are():
    c = client()
    c.post("/coach/rating", json=body())
    before = {p.name: p.read_bytes() for p in files()}
    (progress.home() / "progress.json").write_text("{}", encoding="utf-8")
    assert c.post("/coach/restart").status_code == 200
    assert {p.name: p.read_bytes() for p in files()} == before
