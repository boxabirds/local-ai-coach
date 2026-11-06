"""The coach's turn log (Ceetrix story 19, TC-10 to TC-13).

A real deep agent with the coach's tools and a scripted model, so every event is written
from a real turn; COACH_HOME is a temp folder per test (conftest).
"""

from __future__ import annotations

import json
from pathlib import Path

from deepagents import create_deep_agent
from langchain_core.messages import AIMessage, HumanMessage

from src.bounded_memory_saver import BoundedMemorySaver
from src.coach import keystore, progress, tools, turn_log
from src.coach.middleware import CoachStateMiddleware
from src.prompt import SYSTEM_PROMPT
from src.skill_backend import SKILL_SOURCES, build_agent_backend
from tests.test_coach_agent import ScriptedModel, call

THREAD = "thread-under-test"
OPENAI = "sk-proj-" + "a1B2c3D4" * 6
JEV = "k9Z8y7X6" * 5


def events() -> list[dict]:
    path = turn_log.today_file()
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []


def run_turn(script: list[AIMessage], text: str = "What can my computer do?") -> None:
    model = ScriptedModel(script=script, seen=[])
    agent = create_deep_agent(
        model=model, tools=tools.COACH_TOOLS,
        middleware=[CoachStateMiddleware(), turn_log.TurnLog()],
        skills=SKILL_SOURCES, backend=build_agent_backend, checkpointer=BoundedMemorySaver(max_threads=4),
        system_prompt=SYSTEM_PROMPT,
    )
    agent.invoke({"messages": [HumanMessage(content=text)]}, {"configurable": {"thread_id": THREAD}})


def test_tc10_a_turn_with_a_tool_call_writes_every_event_with_thread_and_time():
    run_turn([call("set_progress", {"station": "machine", "status": "read"}, "c1"), AIMessage(content="Done.")])
    kinds = [e["event"] for e in events()]
    assert kinds == ["model_request", "model_response", "tool_call", "tool_result", "model_request", "model_response"]
    for event in events():
        assert event["thread"] == THREAD and event["at"]
    first = events()[0]
    assert first["system"]["chars"] > 0 and len(first["system"]["sha256"]) == turn_log.HASH_CHARS
    assert first["messages"][-1] == {"type": "human", "content": "What can my computer do?"}
    assert events()[1]["tool_calls"][0]["name"] == "set_progress"
    assert events()[3]["name"] == "set_progress" and "ms" in events()[3]
    assert events()[-1]["text"] == "Done."


def test_tc11_keys_are_never_written(monkeypatch):
    from src.credentials import Credentials, current_credentials

    token = current_credentials.set(Credentials(OPENAI, JEV))
    monkeypatch.setattr(keystore, "cached", lambda **kw: ("sk-saved-" + "z" * 30, "saved-jev-key-value"))
    try:
        turn_log.write({"event": "probe", "messages": [{"content": f"my key is {OPENAI} and {JEV}"}],
                        "args": {"jev": JEV}, "result": "saved-jev-key-value and sk-saved-" + "z" * 30,
                        "stray": "sk-" + "Q" * 20})
    finally:
        current_credentials.reset(token)
    text = turn_log.today_file().read_text(encoding="utf-8")
    for secret in (OPENAI, JEV, "saved-jev-key-value", "sk-saved-", "sk-" + "Q" * 20):
        assert secret not in text
    assert text.count(turn_log.REDACTED) >= 5


def test_tc11_boundary_a_short_sk_string_is_left_alone():
    nineteen, twenty = "sk-" + "a" * 19, "sk-" + "a" * 20
    assert turn_log.redact(nineteen, set()) == nineteen
    assert turn_log.redact(twenty, set()) == turn_log.REDACTED


def test_tc12_an_unwritable_log_never_breaks_the_turn(monkeypatch, tmp_path):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x")
    monkeypatch.setenv("COACH_HOME", str(blocker))
    run_turn([AIMessage(content="Still answered.")])  # would raise if logging did
    assert not (blocker / turn_log.LOG_DIR).exists()


def test_tc13_seven_days_are_kept():
    folder = progress.home() / turn_log.LOG_DIR
    folder.mkdir(parents=True)
    for day in range(1, 9):
        (folder / f"{turn_log.LOG_PREFIX}2026-10-{day:02d}{turn_log.LOG_SUFFIX}").write_text("{}\n")
    turn_log.write({"event": "probe"})  # today's file is new, so old ones are pruned
    kept = sorted(p.name for p in folder.glob("*.jsonl"))
    assert len(kept) == turn_log.KEEP_FILES
    assert kept[-1] == turn_log.today_file().name
    assert f"{turn_log.LOG_PREFIX}2026-10-01{turn_log.LOG_SUFFIX}" not in kept
