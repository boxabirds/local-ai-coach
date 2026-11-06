"""Dispatch evaluation (Ceetrix story 19, eval.harness; docs/design/20261105-agent-testing-proposal.md).

A case is a frozen conversation that ends at a decision point, plus the action the coach
should take in the turn that follows. The harness builds the coach as main.py does (prompt,
skills, coach tools, coach middleware, the real model), feeds it the history, and runs one
turn: the coach's own tools (run_check, set_progress, ...) really run, and the turn stops at
the first card for the learner (a browser tool) or a reply in text. That end is what the
learner sees (Level 4: termination). A run passes when the expected call happened in the turn
with the expected canonical arguments, no forbidden call happened, and the turn didn't end in
text alone unless that was expected. Each case runs several times, because the model isn't
deterministic.

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
ANY_ACTION = "*"  # expect_tool value for a safety case judged only on what must not happen
RECURSION_LIMIT = 30
MODEL_NODE = "model"  # the agent graph's node that calls the model


class MissingKeys(RuntimeError):
    pass


TOGETHER_DEFAULT_BASE = "https://api.together.ai/v1"


def load_env() -> dict[str, str]:
    """The test keys, from apps/agent/.env.test (values already in the environment win, so one
    run can try another model). JEV_API_KEY is accepted for TYPESAFE_API_KEY. With
    TOGETHER_API_KEY the suite runs on Together (TOGETHER_API_MODEL_NAME, TOGETHER_API_BASE_URL);
    otherwise on OpenAI with OPENAI_API_KEY."""
    if not ENV_FILE.is_file():
        raise MissingKeys(f"The dispatch suite needs test keys in {ENV_FILE} (OPENAI_API_KEY and TYPESAFE_API_KEY).")
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k.startswith(("TOGETHER_", "OPENAI_", "LLM_MODEL")) and v})
    if not values.get("TYPESAFE_API_KEY") and values.get("JEV_API_KEY"):
        values["TYPESAFE_API_KEY"] = values["JEV_API_KEY"]
    if values.get("TOGETHER_API_KEY"):
        if "/" not in values.get("TOGETHER_API_MODEL_NAME", ""):
            raise MissingKeys(f"{ENV_FILE}: TOGETHER_API_MODEL_NAME needs Together's full id, with its organisation, for example zai-org/GLM-5.3-Flash.")
        return values
    if not values.get("OPENAI_API_KEY"):
        raise MissingKeys(f"{ENV_FILE} needs TOGETHER_API_KEY and TOGETHER_API_MODEL_NAME, or OPENAI_API_KEY.")
    return values


# ------------------------------------------------------------------ tokens and cost

PER_MILLION = 1_000_000


def add_usage(total: dict[str, int], usage: dict[str, Any] | None) -> dict[str, int]:
    """Add one call's usage to a running total, keeping cached input and reasoning output apart:
    a provider charges cached input at its own, lower rate."""
    usage = usage or {}
    details_in = usage.get("input_token_details") or {}
    details_out = usage.get("output_token_details") or {}
    for key, value in (("input", usage.get("input_tokens")), ("output", usage.get("output_tokens")),
                       ("cached_input", details_in.get("cache_read")), ("reasoning", details_out.get("reasoning"))):
        if isinstance(value, int):
            total[key] = total.get(key, 0) + value
    return total


@dataclass
class Prices:
    """Dollars per million tokens, as the provider lists them."""
    input: float
    cached_input: float
    output: float
    source: str

    def cost(self, tokens: dict[str, int]) -> float:
        cached = tokens.get("cached_input", 0)
        uncached = max(tokens.get("input", 0) - cached, 0)
        return (uncached * self.input + cached * self.cached_input + tokens.get("output", 0) * self.output) / PER_MILLION


def provider_prices(values: dict[str, str]) -> Prices | None:
    """Together publishes prices per model through its API; OpenAI doesn't, so its cost is unknown here."""
    if not values.get("TOGETHER_API_KEY"):
        return None
    try:
        import httpx

        base = (values.get("TOGETHER_API_BASE_URL") or TOGETHER_DEFAULT_BASE).rstrip("/")
        listed = httpx.get(f"{base}/models", headers={"Authorization": f"Bearer {values['TOGETHER_API_KEY']}"}, timeout=30).json()
        p = next(m for m in listed if m.get("id") == values["TOGETHER_API_MODEL_NAME"])["pricing"]
        return Prices(float(p["input"]), float(p.get("cached_input", p["input"])), float(p["output"]),
                      f"Together's listed price for {values['TOGETHER_API_MODEL_NAME']}")
    except Exception:  # noqa: BLE001 (no price is reported as unknown, never guessed)
        return None


def eval_model(values: dict[str, str]) -> Any:
    """The model the suite measures: Together's when its key is set, else OpenAI's (src/model.py)."""
    if values.get("TOGETHER_API_KEY"):
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=values["TOGETHER_API_MODEL_NAME"], api_key=values["TOGETHER_API_KEY"],
                          base_url=values.get("TOGETHER_API_BASE_URL") or TOGETHER_DEFAULT_BASE)
    from src.model import build_model

    return build_model()


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
    # The learner asked something, so a reply in text is a proper end to the turn.
    text_end_ok: bool = False

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
    from src.prompt import SYSTEM_PROMPT
    from src.skill_backend import SKILL_SOURCES, build_agent_backend

    return create_deep_agent(
        model=model or eval_model(load_env()), tools=[*COACH_TOOLS, *BROWSER_TOOLS],
        middleware=[CoachStateMiddleware(), TurnLog()],
        skills=SKILL_SOURCES, backend=build_agent_backend, checkpointer=BoundedMemorySaver(max_threads=64),
        system_prompt=SYSTEM_PROMPT,
    )


BROWSER_NAMES = {"story", "show_next_step", "step_card", "number_card", "choice_card", "consent_card", "show_map"}


def run_turn(agent: Any, history: list[dict[str, Any]], thread: str) -> Decision:
    """Run one turn: the coach's own tools run; stop at the first card or a text-only reply.
    tool/args are where the turn ended (a card, or None for text); calls are every call made."""
    started = time.monotonic()
    config = {"configurable": {"thread_id": thread}, "recursion_limit": RECURSION_LIMIT}
    calls: list[dict[str, Any]] = []
    texts: list[str] = []
    meta: dict[str, Any] = {}
    tokens: dict[str, int] = {}
    try:
        for update in agent.stream({"messages": to_messages(history)}, config, stream_mode="updates"):
            # Only the model node's own output: other nodes (middleware hooks) re-emit the history.
            for name, node in update.items():
                if name != MODEL_NODE:
                    continue
                found = node.get("messages") if isinstance(node, dict) else None
                found = getattr(found, "value", found)  # some updates wrap the list in Overwrite
                for m in found if isinstance(found, list) else []:
                    if not isinstance(m, AIMessage):
                        continue
                    meta = m.response_metadata or meta
                    add_usage(tokens, m.usage_metadata)
                    if isinstance(m.content, str) and m.content:
                        texts.append(m.content)
                    made = [{"name": c["name"], "args": c.get("args", {})} for c in m.tool_calls]
                    calls += made
                    card = next((c for c in made if c["name"] in BROWSER_NAMES), None)
                    if card or not made:
                        # The turn ends here: a card waits for the learner, or the coach just spoke.
                        return Decision(card["name"] if card else None, card["args"] if card else {}, calls, "\n".join(texts),
                                        meta.get("model_name"), tokens, round((time.monotonic() - started) * 1000))
        return Decision(None, {}, calls, "\n".join(texts), meta.get("model_name"), tokens,
                        round((time.monotonic() - started) * 1000), error="the turn didn't end")
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
    if case.expect_tool == ANY_ACTION:
        return True, "ok"  # a safety case: only its must-not list is judged
    if case.expect_tool is None:
        return (True, "ok") if decision.tool is None else (False, f"ended with {decision.tool}, expected text only")
    made = [c for c in decision.calls if c["name"] == case.expect_tool]
    if not made:
        seen = ", ".join(c["name"] for c in decision.calls) or "nothing"
        return False, f"no {case.expect_tool} in the turn (called {seen}; ended with {decision.tool or 'text only'})"
    if not any(all(c["args"].get(k) == v for k, v in case.expect_args.items()) for c in made):
        return False, f"{case.expect_tool} with {made[-1]['args']}, expected {case.expect_args}"
    # chapter_ended shows the learner their map, so the turn has ended with something on screen.
    if decision.tool is None and not case.text_end_ok and not any(c["name"] == "chapter_ended" for c in decision.calls):
        return False, "the turn ended in text with nothing for the learner to do"
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
        decision = run_turn(agent, case.history, thread=f"{case.id}-{n}-{os.getpid()}")
        ok, why = judge(case, decision)
        runs.append({"ok": ok, "why": why, **decision.__dict__})
    return CaseResult(case, sum(r["ok"] for r in runs), runs)


def case_tokens(result: CaseResult) -> dict[str, int]:
    total: dict[str, int] = {}
    for run in result.runs:
        for key, value in (run.get("tokens") or {}).items():
            total[key] = total.get(key, 0) + value
    return total


def save(results: list[CaseResult], prices: Prices | None = None, folder: Path | None = None) -> Path:
    folder = folder or RESULTS / time.strftime("%Y-%m-%dT%H%M%S")
    folder.mkdir(parents=True, exist_ok=True)
    summary = []
    for r in results:
        tokens = case_tokens(r)
        summary.append({"id": r.case.id, "kind": r.case.kind, "note": r.case.note, "passes": r.passes, "runs": r.case.runs,
                        "need": r.case.need, "passed": r.passed, "tokens": tokens,
                        "cost_usd": round(prices.cost(tokens), 4) if prices else None,
                        "models": sorted({x.get("model_reported") or "?" for x in r.runs})})
    totals: dict[str, int] = {}
    for item in summary:
        for key, value in item["tokens"].items():
            totals[key] = totals.get(key, 0) + value
    run = {"cases": summary, "tokens": totals, "cost_usd": round(prices.cost(totals), 4) if prices else None,
           "prices": prices.__dict__ if prices else "unknown: this provider doesn't publish prices through its API"}
    (folder / "summary.json").write_text(json.dumps(run, indent=2), encoding="utf-8")
    for r in results:
        (folder / f"{r.case.id}.json").write_text(json.dumps({"case": r.case.__dict__, "runs": r.runs}, indent=2, default=str), encoding="utf-8")
    return folder
