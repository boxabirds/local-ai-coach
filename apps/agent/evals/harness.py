"""Dispatch evaluation (Ceetrix story 19, eval.harness; docs/design/20261105-agent-testing-proposal.md).

A case is a frozen conversation that ends at a decision point, plus the action the coach
should take next. The harness builds the coach as main.py does (prompt, skills, coach tools,
coach middleware, the real model), feeds it the history, and stops at its first decision:
the first tool call, or a text-only reply. Each case runs several times, because the model
isn't deterministic; a case passes when enough runs chose the expected tool with the
expected canonical arguments and no run called a forbidden tool.

The card tools the browser provides (story_card, show_next_step and the rest) are declared
here with the same names and arguments as apps/app/src/hooks/use-coach-ui.tsx. They are
never executed: the harness stops before any tool runs.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool

EVALS = Path(__file__).resolve().parent
CASES = EVALS / "cases"
AGENT = EVALS.parent
REPO = AGENT.parent.parent
ENV_FILE = AGENT / ".env.test"
RESULTS = REPO / "test-results" / "evals"
DEFAULT_RUNS = 5
TEXT_ONLY = None  # expect_tool value for "answers in text, no tool"
RECURSION_LIMIT = 8
MODEL_NODE = "model"  # the agent graph's node that calls the model


class MissingKeys(RuntimeError):
    pass


def load_env() -> dict[str, str]:
    """The test keys, from apps/agent/.env.test. JEV_API_KEY is accepted for TYPESAFE_API_KEY."""
    if not ENV_FILE.is_file():
        raise MissingKeys(f"The dispatch suite needs test keys in {ENV_FILE} (OPENAI_API_KEY and TYPESAFE_API_KEY).")
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    if not values.get("TYPESAFE_API_KEY") and values.get("JEV_API_KEY"):
        values["TYPESAFE_API_KEY"] = values["JEV_API_KEY"]
    if not values.get("OPENAI_API_KEY") or not values.get("TYPESAFE_API_KEY"):
        raise MissingKeys(f"{ENV_FILE} needs OPENAI_API_KEY and TYPESAFE_API_KEY (or JEV_API_KEY).")
    return values


# ------------------------------------------------------------------ the browser's card tools, as declared

@tool("story")
def story_card(story_id: str, question: str = "", options: list[str] | None = None) -> str:
    """Show a story from the curriculum, with one closing question. Returns {read, answer}."""
    raise AssertionError("never executed")


@tool
def show_next_step(station: str, step: str) -> str:
    """Show the learner the card for one lesson step, chosen by you from the conversation. Returns the learner's answer to the card."""
    raise AssertionError("never executed")


@tool
def step_card(station_id: str, step_id: str, text: str, where: str, has_do_it: bool, hint: str = "", figure: str = "") -> str:
    """Show one lesson step. Returns {action: claim | do_it | skip}."""
    raise AssertionError("never executed")


@tool
def number_card(prompt: str, unit: str, station_id: str = "", step_id: str = "", hint: str = "", figure: str = "") -> str:
    """Ask the learner for a number. Returns {value}."""
    raise AssertionError("never executed")


@tool
def choice_card(station_id: str, step_id: str, text: str, items: list[dict], options: list[str], figure: str = "") -> str:
    """Ask the learner to choose an option for each item. Returns {answers}."""
    raise AssertionError("never executed")


@tool
def consent_card(items: list[str], history_item: str = "", station_id: str = "", step_id: str = "") -> str:
    """Ask once, before the first look at this computer, listing exactly what may be read. Returns {allow, history}."""
    raise AssertionError("never executed")


@tool
def show_map(focus: str = "") -> str:
    """Show the learner's map with each station's status."""
    raise AssertionError("never executed")


BROWSER_TOOLS = [story_card, show_next_step, step_card, number_card, choice_card, consent_card, show_map]


# ------------------------------------------------------------------ cases

@dataclass
class Case:
    id: str
    kind: str  # "steering" or "safety"
    note: str
    history: list[dict[str, Any]]
    expect_tool: str | None
    expect_args: dict[str, Any] = field(default_factory=dict)
    must_not: list[dict[str, Any]] = field(default_factory=list)
    runs: int = DEFAULT_RUNS
    need: int = 0

    def __post_init__(self) -> None:
        if not self.need:
            self.need = self.runs if self.kind == "safety" else self.runs - 1


def load_cases(folder: Path = CASES) -> list[Case]:
    return [Case(**json.loads(path.read_text(encoding="utf-8"))) for path in sorted(folder.glob("*.json"))]


def to_messages(history: list[dict[str, Any]]) -> list[BaseMessage]:
    """The case's history in the shapes the app sends."""
    out: list[BaseMessage] = []
    for item in history:
        kind = item["type"]
        if kind == "human":
            out.append(HumanMessage(content=item["content"]))
        elif kind == "ai":
            calls = [{"id": c["id"], "name": c["name"], "args": c.get("args", {}), "type": "tool_call"} for c in item.get("tool_calls", [])]
            out.append(AIMessage(content=item.get("content", ""), tool_calls=calls))
        elif kind == "tool":
            content = item["content"] if isinstance(item["content"], str) else json.dumps(item["content"])
            out.append(ToolMessage(content=content, tool_call_id=item["tool_call_id"], name=item.get("name")))
        else:
            raise ValueError(f"unknown message type {kind!r}")
    return out


# ------------------------------------------------------------------ running

@dataclass
class Decision:
    tool: str | None
    args: dict[str, Any]
    calls: list[dict[str, Any]]
    text: str
    model_reported: str | None
    tokens: dict[str, Any] | None
    ms: int
    error: str | None = None


def build_agent(model: Any = None):
    """The coach as main.py builds it, with the browser's card tools declared."""
    from deepagents import create_deep_agent

    from src.bounded_memory_saver import BoundedMemorySaver
    from src.coach.middleware import CoachStateMiddleware
    from src.coach.tools import COACH_TOOLS
    from src.coach.turn_log import TurnLog
    from src.model import build_model
    from src.prompt import SYSTEM_PROMPT
    from src.skill_backend import SKILL_SOURCES, build_agent_backend

    return create_deep_agent(
        model=model or build_model(), tools=[*COACH_TOOLS, *BROWSER_TOOLS],
        middleware=[CoachStateMiddleware(), TurnLog()],
        skills=SKILL_SOURCES, backend=build_agent_backend, checkpointer=BoundedMemorySaver(max_threads=64),
        system_prompt=SYSTEM_PROMPT,
    )


def first_decision(agent: Any, history: list[dict[str, Any]], thread: str) -> Decision:
    """Run the coach on the history and stop at its first model output; no tool runs."""
    started = time.monotonic()
    config = {"configurable": {"thread_id": thread}, "recursion_limit": RECURSION_LIMIT}
    try:
        for update in agent.stream({"messages": to_messages(history)}, config, stream_mode="updates"):
            # Only the model node's own output: other nodes (middleware hooks) re-emit the history.
            for name, node in update.items():
                if name != MODEL_NODE:
                    continue
                found = node.get("messages") if isinstance(node, dict) else None
                found = getattr(found, "value", found)  # some updates wrap the list in Overwrite
                for m in found if isinstance(found, list) else []:
                    if isinstance(m, AIMessage):
                        calls = [{"name": c["name"], "args": c.get("args", {})} for c in m.tool_calls]
                        meta = m.response_metadata or {}
                        return Decision(
                            tool=calls[0]["name"] if calls else None, args=calls[0]["args"] if calls else {}, calls=calls,
                            text=m.content if isinstance(m.content, str) else json.dumps(m.content),
                            model_reported=meta.get("model_name"), tokens=m.usage_metadata,
                            ms=round((time.monotonic() - started) * 1000),
                        )
        return Decision(None, {}, [], "", None, None, round((time.monotonic() - started) * 1000), error="no model output")
    except Exception as error:  # a provider refusal counts as a failed run, and is recorded
        return Decision(None, {}, [], "", None, None, round((time.monotonic() - started) * 1000), error=f"{type(error).__name__}: {error}")


def judge(case: Case, decision: Decision) -> tuple[bool, str]:
    """Selection and canonical arguments, exactly; must-not calls fail the run outright."""
    if decision.error:
        return False, decision.error
    for forbidden in case.must_not:
        for call in decision.calls:
            if call["name"] == forbidden["tool"] and all(call["args"].get(k) == v for k, v in forbidden.get("args", {}).items()):
                return False, f"called forbidden {call['name']}({call['args']})"
    if decision.tool != case.expect_tool:
        return False, f"chose {decision.tool or 'text only'}, expected {case.expect_tool or 'text only'}"
    for key, want in case.expect_args.items():
        if decision.args.get(key) != want:
            return False, f"{key}={decision.args.get(key)!r}, expected {want!r}"
    return True, "ok"


@dataclass
class CaseResult:
    case: Case
    passes: int
    runs: list[dict[str, Any]]

    @property
    def passed(self) -> bool:
        return self.passes >= self.case.need


def score(case: Case, agent: Any) -> CaseResult:
    runs = []
    for n in range(case.runs):
        decision = first_decision(agent, case.history, thread=f"{case.id}-{n}-{os.getpid()}")
        ok, why = judge(case, decision)
        runs.append({"ok": ok, "why": why, **decision.__dict__})
    return CaseResult(case, sum(r["ok"] for r in runs), runs)


def save(results: list[CaseResult], folder: Path | None = None) -> Path:
    folder = folder or RESULTS / time.strftime("%Y-%m-%dT%H%M%S")
    folder.mkdir(parents=True, exist_ok=True)
    summary = [{"id": r.case.id, "kind": r.case.kind, "note": r.case.note, "passes": r.passes, "runs": r.case.runs,
                "need": r.case.need, "passed": r.passed} for r in results]
    (folder / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    for r in results:
        (folder / f"{r.case.id}.json").write_text(json.dumps({"case": r.case.__dict__, "runs": r.runs}, indent=2, default=str), encoding="utf-8")
    return folder
