"""The real coach agent with a scripted model (Ceetrix story 10, TC-23 and TC-24).

The agent is built as main.py builds it (deep agent, coach tools, coach
middleware, skills), but with a chat model that plays a fixed script, because a
real model is not repeatable, and without the hosted router, which needs the
network. The thread is the one the browser would send after the learner has
answered the cards; the scripted model then calls the backend tools.
"""

from __future__ import annotations

import json
from typing import Any

from deepagents import create_deep_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from src.bounded_memory_saver import BoundedMemorySaver
from src.coach import consent, progress, tools
from src.coach.middleware import CoachStateMiddleware
from src.prompt import SYSTEM_PROMPT
from src.skill_backend import SKILL_SOURCES, build_agent_backend


class ScriptedModel(BaseChatModel):
    """Answers each call with the next message of a script; records what it was shown."""

    script: list[AIMessage]
    seen: list[list[Any]] = []

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.script.pop(0))])


def call(name: str, args: dict, call_id: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"id": call_id, "name": name, "args": args, "type": "tool_call"}])


def answered(name: str, args: dict, answer: dict, call_id: str) -> list:
    return [call(name, args, call_id), ToolMessage(content=json.dumps(answer), tool_call_id=call_id)]


class Machine:
    def __init__(self):
        self.calls = []

    def __call__(self, name, params=None, **kw):
        self.calls.append(name)
        return {"probe": name, "cmd": "sysctl -n hw.memsize", "matched": ["17179869184"], "value": 16}


def agent_with(script):
    model = ScriptedModel(script=script, seen=[])
    agent = create_deep_agent(
        model=model,
        tools=tools.COACH_TOOLS,
        middleware=[CoachStateMiddleware()],
        skills=SKILL_SOURCES,
        backend=build_agent_backend,
        checkpointer=BoundedMemorySaver(max_threads=10),
        system_prompt=SYSTEM_PROMPT,
    )
    return agent, model


def learner_thread() -> list:
    """Find my number, step 1 claimed, the number typed, permission given: as the browser sends it."""
    return [
        HumanMessage(content="Find my number"),
        *answered("step_card", {"station_id": "machine", "step_id": "machine.1"}, {"action": "claim"}, "sc1"),
        *answered("number_card", {"station_id": "machine", "step_id": "machine.2", "prompt": "Type it", "unit": "GB"}, {"value": 16}, "nc1"),
        *answered("consent_card", {"items": list(consent.ITEMS)}, {"allow": True, "history": False}, "cc1"),
    ]


def test_tc23_number_permission_check_and_verified_through_the_real_graph(monkeypatch):
    machine = Machine()
    monkeypatch.setattr(tools, "RUN", machine)
    agent, model = agent_with([
        call("run_check", {"station": "machine", "step": "machine.2"}, "rc1"),
        call("set_progress", {"station": "machine", "status": "verified", "step": "machine.2"}, "sp1"),
        AIMessage(content="Your number checks out. Now the test."),
    ])
    config = {"configurable": {"thread_id": "tc23"}}
    agent.invoke({"messages": learner_thread()}, config)
    state = agent.get_state(config).values

    assert consent.load(progress.home())["probes"] is True  # saved by the middleware from the card
    assert machine.calls == ["memory"]
    check = next(m for m in state["messages"] if isinstance(m, ToolMessage) and m.tool_call_id == "rc1")
    assert json.loads(check.content)["passed"] is True
    record = progress.load(progress.home())
    assert record["steps"]["machine.2"]["status"] == "verified" and record["stations"]["machine"]["status"] == "verified"
    assert {s["id"]: s["status"] for s in state["progress_snapshot"]}["machine"] == "verified"
    # The model saw the coach's context on its first call.
    first_system = model.seen[0][0].content
    assert "Permission to look at this computer: allowed." in str(first_system)


def test_tc24_verified_before_any_check_is_refused_and_nothing_is_written(monkeypatch):
    machine = Machine()
    monkeypatch.setattr(tools, "RUN", machine)
    agent, _ = agent_with([
        call("set_progress", {"station": "machine", "status": "verified", "step": "machine.2"}, "sp1"),
        AIMessage(content="Let me check first."),
    ])
    config = {"configurable": {"thread_id": "tc24"}}
    agent.invoke({"messages": learner_thread()}, config)
    refusal = next(m for m in agent.get_state(config).values["messages"] if isinstance(m, ToolMessage) and m.tool_call_id == "sp1")
    assert refusal.content.startswith("Refused: verified needs a passing run_check")
    assert not (progress.home() / "progress.json").exists()
    assert machine.calls == []


def test_tc24_no_probe_runs_before_the_permission_answer(monkeypatch):
    machine = Machine()
    monkeypatch.setattr(tools, "RUN", machine)
    agent, _ = agent_with([
        call("run_check", {"station": "machine", "step": "machine.2"}, "rc1"),
        AIMessage(content="I need your permission first."),
    ])
    config = {"configurable": {"thread_id": "tc24b"}}
    agent.invoke({"messages": learner_thread()[:-2]}, config)  # no permission answer yet
    out = next(m for m in agent.get_state(config).values["messages"] if isinstance(m, ToolMessage) and m.tool_call_id == "rc1")
    assert json.loads(out.content)["needs"] == "consent"
    assert machine.calls == [] and consent.load(progress.home()) is None
