"""A turn a provider refuses ends with the coach saying so (Ceetrix story 37).

Before: the exception escaped the agent's run, the response stream just stopped, and the
page showed the learner's message and nothing else. The errors here are made up in the
shape the upstream wrappers raise (src/visualization_router.py, src/model.py).
"""

from __future__ import annotations

import asyncio

import pytest
from ag_ui.core import RunAgentInput
from langchain_core.messages import AIMessage
from langgraph.graph import END, START, MessagesState, StateGraph

from src.bounded_memory_saver import BoundedMemorySaver

FAKE_KEY = "sk-made-up-0123456789abcdef"
JEV_REFUSED = "Jev visualization routing failed (HTTP 401). Check provider access or retry."
JEV_BUSY = "Jev visualization routing failed (HTTP 429). Check provider access or retry."
OPENAI_FAILED = "OpenAI request failed. Check your key and model access, or retry."


def _agent(error: Exception | None):
    from src.coach.refusals import RefusalReportingAgent

    async def answer(state):
        if error is not None:
            raise error
        return {"messages": [AIMessage(content="OK")]}

    builder = StateGraph(MessagesState)
    builder.add_node("answer", answer)
    builder.add_edge(START, "answer")
    builder.add_edge("answer", END)
    return RefusalReportingAgent(name="test", graph=builder.compile(checkpointer=BoundedMemorySaver()))


def _run(error: Exception | None) -> list:
    from src.credentials import Credentials, current_credentials

    async def go():
        token = current_credentials.set(Credentials(FAKE_KEY, "jev-made-up-0123456789"))
        try:
            data = RunAgentInput(thread_id="t", run_id="r", messages=[{"id": "m", "role": "user", "content": "Hello"}], state={}, tools=[], context=[], forwarded_props={})
            return [event async for event in _agent(error).clone().run(data)]
        finally:
            current_credentials.reset(token)

    return asyncio.run(go())


def _error(events: list):
    errors = [e for e in events if e.type == "RUN_ERROR"]
    assert len(errors) == 1, [e.type for e in events]
    assert events[-1].type == "RUN_ERROR"
    return errors[0]


@pytest.fixture
def no_server(monkeypatch, tmp_path):
    monkeypatch.setenv("COACH_HOME", str(tmp_path))


def test_tc01_jev_refused_names_jev_and_the_key(no_server):
    from src.coach import refusals

    event = _error(_run(ValueError(JEV_REFUSED)))
    assert event.message == refusals.JEV_REFUSED
    assert event.code == refusals.CODE


def test_tc02_jev_busy_or_down_says_try_again(no_server):
    from src.coach import refusals

    assert _error(_run(ValueError(JEV_BUSY))).message == refusals.JEV_UNAVAILABLE


def test_tc03_openai_failed_names_openai(no_server):
    from src.coach import refusals

    assert _error(_run(ValueError(OPENAI_FAILED))).message == refusals.OPENAI_FAILED


def test_tc04_a_chosen_server_is_named_instead_of_openai(no_server, tmp_path):
    from src.coach import refusals

    (tmp_path / "provider.json").write_text('{"base_url": "https://api.example.test/v1", "model": "made-up-model"}')
    assert _error(_run(ValueError(OPENAI_FAILED))).message == refusals.SERVER_FAILED


def test_tc05_anything_else_is_the_existing_cut_off_line(no_server):
    from src.coach import refusals

    assert _error(_run(RuntimeError(f"boom {FAKE_KEY}"))).message == refusals.CUT_OFF


def test_tc06_no_key_or_provider_text_reaches_the_learner(no_server):
    for error in (ValueError(JEV_REFUSED), ValueError(OPENAI_FAILED), RuntimeError(f"Incorrect API key provided: {FAKE_KEY}")):
        event = _error(_run(error))
        shown = event.message + (event.code or "")
        assert FAKE_KEY not in shown and FAKE_KEY[:10] not in shown
        assert "HTTP" not in shown and "Incorrect API key" not in shown and "visualization routing" not in shown


def test_tc07_a_turn_that_works_has_no_error(no_server):
    events = _run(None)
    assert "RUN_ERROR" not in [e.type for e in events]
    assert events[-1].type == "RUN_FINISHED"


def test_tc08_the_real_coach_uses_it():
    import main
    from src.coach.refusals import RefusalReportingAgent

    assert isinstance(main.coach_agent, RefusalReportingAgent)
