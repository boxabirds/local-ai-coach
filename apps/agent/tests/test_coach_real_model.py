"""The real hosted model teaches chapter 1, headless (Ceetrix story 10, part of TC-29).

Opt in with COACH_REAL_MODEL=1 and OPENAI_API_KEY set; it costs a few cents. The
browser's cards are played by tools that answer as a learner would and end the
run, as a waiting card does in the browser, so each answer starts a new run and
CoachStateMiddleware sees it. Everything else is the real coach: tools,
middleware, probes on this computer, prompt, skills and the hosted model. Jev's
routing is left out; the browser run with both keys covers it.

It asserts what must hold whatever the wording: the steps in order, permission
before any look, verified only with the real check's evidence, and the fits
answer judged.
"""

from __future__ import annotations

import json
import os

import pytest
from deepagents import create_deep_agent
from langchain.tools import tool
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from src.bounded_memory_saver import BoundedMemorySaver
from src.coach import consent, probes, progress
from src.coach import tools as coach_tools
from src.coach.middleware import CoachStateMiddleware
from src.prompt import SYSTEM_PROMPT
from src.skill_backend import SKILL_SOURCES, build_agent_backend

pytestmark = pytest.mark.skipif(
    os.environ.get("COACH_REAL_MODEL") != "1" or not os.environ.get("OPENAI_API_KEY"),
    reason="set COACH_REAL_MODEL=1 and OPENAI_API_KEY (calls the hosted model)",
)
CARDS = ("step_card", "number_card", "consent_card")
MAX_RUNS = 12


def learner(number_gb: int):
    answers = {"step_card": {"action": "claim"}, "number_card": {"value": number_gb}, "consent_card": {"allow": True, "history": False}}
    shown: list[tuple[str, dict]] = []

    @tool(return_direct=True)
    def step_card(station_id: str, step_id: str, text: str, where: str, has_do_it: bool, hint: str = "") -> str:
        """Show one lesson step. Returns {action: claim | do_it | skip}."""
        shown.append(("step_card", {"step_id": step_id}))
        return json.dumps(answers["step_card"])

    @tool(return_direct=True)
    def number_card(prompt: str, unit: str, station_id: str = "", step_id: str = "", hint: str = "") -> str:
        """Ask the learner for a number. Returns {value}."""
        shown.append(("number_card", {"step_id": step_id}))
        return json.dumps(answers["number_card"])

    @tool(return_direct=True)
    def consent_card(items: list[str], history_item: str = "", station_id: str = "", step_id: str = "") -> str:
        """Ask once, before the first look at this computer, listing exactly what may be read. Returns {allow, history}."""
        shown.append(("consent_card", {"items": items}))
        return json.dumps(answers["consent_card"])

    @tool
    def show_map(focus: str = "") -> str:
        """Show the learner's map with each V1 station's status."""
        shown.append(("show_map", {}))
        return "shown"

    return [step_card, number_card, consent_card, show_map], shown


def test_tc29_headless_the_real_model_teaches_know_your_machine():
    from src.model import build_model

    number_gb = probes.run("memory", consent={"probes": True})["value"]
    cards, shown = learner(number_gb)
    agent = create_deep_agent(
        model=build_model(), tools=[*coach_tools.COACH_TOOLS, *cards], middleware=[CoachStateMiddleware()],
        skills=SKILL_SOURCES, backend=build_agent_backend, checkpointer=BoundedMemorySaver(max_threads=2), system_prompt=SYSTEM_PROMPT,
    )
    config = {"configurable": {"thread_id": "tc29"}, "recursion_limit": 60}
    agent.invoke({"messages": [HumanMessage("Find my number")]}, config)
    for _ in range(MAX_RUNS):
        last = agent.get_state(config).values["messages"][-1]
        if not (isinstance(last, ToolMessage) and last.name in CARDS):
            break
        agent.invoke({"messages": []}, config)
    agent.invoke({"messages": [HumanMessage("Fits, fits, and the 20 GB one doesn't fit.")]}, config)

    messages = agent.get_state(config).values["messages"]
    calls = [c for m in messages if isinstance(m, AIMessage) for c in m.tool_calls]
    opened = [c["args"]["step_id"] for c in calls if c["name"] == "start_step"]
    assert opened[:3] == ["machine.1", "machine.2", "machine.3"]
    # Permission came before the first real look, and was asked once.
    names = [c["name"] for c in calls]
    assert names.count("consent_card") == 1
    checks_after = [i for i, c in enumerate(calls) if c["name"] == "run_check" and c["args"].get("step_id") == "machine.2"]
    assert checks_after and checks_after[-1] > names.index("consent_card")
    record = progress.load(progress.home())
    assert record["steps"]["machine.2"]["status"] == "verified"
    assert record["steps"]["machine.2"]["evidence"][0]["probe"] == "memory"
    assert record["steps"]["machine.3"]["status"] == "reported"
    assert consent.load(progress.home())["probes"] is True
    assert ("show_map", {}) in shown
