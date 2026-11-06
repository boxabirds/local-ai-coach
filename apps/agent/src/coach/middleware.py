"""CoachStateMiddleware (docs/design.md, "Agent design: State"; Ceetrix story 10).

Before each turn it saves the learner's answer from the permission card, if
there is one and none is saved yet (the model can never grant permission
itself), and puts the learner's progress in agent state for the map. On every
model call it adds the compressed map, the open lesson and its chapter, and
whether the coach may look at this computer, to the system message.
"""

from __future__ import annotations

import json
import platform
from functools import lru_cache
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, NotRequired

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.coach import whole_map, curriculum, progress, thread
from src.coach import consent as consent_store
from src.coach.tools import chapter_body

CONSENT_UNASKED, CONSENT_ALLOWED, CONSENT_DECLINED = "unasked", "allowed", "declined"


class CoachState(AgentState):
    station_id: NotRequired[str]
    step_id: NotRequired[str]
    progress_snapshot: NotRequired[list[dict[str, str]]]


def consent_status(given: dict[str, Any] | None) -> str:
    if given is None:
        return CONSENT_UNASKED
    return CONSENT_ALLOWED if given.get("probes") else CONSENT_DECLINED


def capture_consent(messages: list) -> None:
    """Save the learner's permission card answer once, if there is one and nothing is saved."""
    folder = progress.home()
    if consent_store.load(folder) is not None:
        return
    answer = thread.last_answer(messages, "consent_card")
    if not answer or not isinstance(answer.get("allow"), bool):
        return
    history = answer.get("history") is True
    try:
        consent_store.save(folder, probes=answer["allow"], history=history, at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    except OSError:
        return  # stays unasked; the card is shown again


def compressed_map(record: dict[str, Any]) -> str:
    """Every V1 station as `id: name [status]`, with its criticality."""
    lines = []
    for entry in progress.snapshot(record):
        crit = f" ({entry['criticality']})" if "criticality" in entry else ""
        lines.append(f"- {entry['id']}: {entry['name']} [{entry['status']}]{crit}")
    return "\n".join(lines)


STATION_FIELDS = ("name", "area", "inYourHead", "needs", "headNote", "proof", "unlocks")


@lru_cache(maxsize=None)
def _curriculum_block(folder: str) -> str:
    """The whole curriculum, as the model reads it (Ceetrix story 19, flow.context). The same text
    all session for a given folder, so it sits before anything that changes and can be cached."""
    root = Path(folder)
    scope = json.loads((root / "scope.json").read_text(encoding="utf-8"))
    stations = json.loads((root / "stations.json").read_text(encoding="utf-8"))["stations"]
    terms = json.loads((root / "map.json").read_text(encoding="utf-8"))["terms"]
    parts = ["## The curriculum, all of it",
             "Everything the learner can ask about. Use ids exactly as written here.",
             "### Reading order (what the coach teaches now, in order)",
             json.dumps(scope["readingOrder"], ensure_ascii=False)]
    if scope.get("shownOnMap"):
        parts += ["Shown on the map but not taught yet: " + json.dumps(scope["shownOnMap"], ensure_ascii=False)]
    parts.append("### Every station on the map")
    parts += [f"- {s['id']}: " + json.dumps({k: s[k] for k in STATION_FIELDS if k in s}, ensure_ascii=False) for s in stations]
    parts += ["### Terms (where each is first taught)",
              "\n".join(f"- {t['term']} (first at {t.get('firstAt', '?')}): {t.get('gloss', '')}" for t in terms)]
    for item in scope["readingOrder"]:
        path = root / item["file"]
        if not path.is_file():
            raise FileNotFoundError(f"scope.json lists {item['file']}, which isn't in {root}")
        text = path.read_text(encoding="utf-8")
        if item["kind"] == "lesson":
            parts += [f"### Lesson {item['station']} (its steps are the contract: use their text and ids)", text.strip()]
            body = chapter_body(item["station"])
            if body:
                parts += [f"### Chapter for {item['station']} (for answering questions)", body]
        else:
            parts += [f"### Story {item['id']} (story_id \"{item['id']}\", for station {item['station']})", text.strip()]
    return "\n\n".join(parts)


def curriculum_block() -> str:
    return _curriculum_block(str(curriculum.root()))


def coach_context(state: dict[str, Any]) -> str:
    """What changes turn to turn: who the learner is now. Comes after the curriculum block."""
    record = progress.load(progress.home())
    given = consent_store.load(progress.home())
    parts = [
        "## The learner, now",
        f"Platform: {platform.system() or 'unknown'}.",
        f"Permission to look at this computer: {consent_status(given)}.",
        "Map (the learner's status per station):",
        compressed_map(record),
    ]
    # Story 29: the goal the learner chose on the whole map, and its route. What to do with it is
    # the coach's call.
    goal = whole_map.goal_line(record)
    if goal:
        parts.append(goal)
    return "\n\n".join(parts)


LATE_ANSWER = "I've now answered the earlier {name} for {step}: {answer}"


def without_late_answers(messages: list) -> list:
    """Messages as the model may receive them: a card's answer that arrives after the learner
    typed something (its call was marked cancelled, but the card still worked on screen) has
    no call directly before it, which the hosted model refuses. It goes in as the learner's
    note instead. Only what the model is sent changes; the thread keeps the tool result."""
    calls = {c["id"]: c for m in messages if isinstance(m, AIMessage) for c in m.tool_calls if c.get("id")}
    out, open_ids = [], set()
    for m in messages:
        if isinstance(m, AIMessage):
            open_ids = {c["id"] for c in m.tool_calls if c.get("id")}
        elif isinstance(m, ToolMessage):
            if m.tool_call_id in open_ids:
                open_ids.discard(m.tool_call_id)
            else:
                call = calls.get(m.tool_call_id, {})
                step = (call.get("args") or {}).get("step_id") or "the open step"
                answer = m.content if isinstance(m.content, str) else str(m.content)
                out.append(HumanMessage(content=LATE_ANSWER.format(name=call.get("name", "card"), step=step, answer=answer)))
                continue
        else:
            open_ids = set()
        out.append(m)
    return out


def with_context(request):
    # The stable curriculum first, then what changes (story 19): the provider caches the prefix.
    note = "\n\n" + curriculum_block() + "\n\n" + coach_context(request.state)
    current = request.system_message.content if request.system_message else ""
    content = [*current, {"type": "text", "text": note}] if isinstance(current, list) else current + note
    return request.override(system_message=SystemMessage(content=content), messages=without_late_answers(list(request.messages)))


class CoachStateMiddleware(AgentMiddleware):
    state_schema = CoachState

    def before_agent(self, state, runtime):
        capture_consent(state.get("messages", []))
        return {"progress_snapshot": progress.snapshot(progress.load(progress.home()))}

    async def abefore_agent(self, state, runtime):
        return self.before_agent(state, runtime)

    def after_model(self, state, runtime):
        """Record each show_next_step the model just called (story 22). This writes down the
        model's decision, as chapter_ended and user_navigated do; it decides nothing."""
        from src.coach import tools

        messages = state.get("messages", [])
        newest = messages[-1] if messages else None
        for call in getattr(newest, "tool_calls", None) or []:
            args = call.get("args") or {}
            station, step = args.get("station"), args.get("step")
            if call.get("name") == tools.SHOW_NEXT_STEP and isinstance(station, str) and isinstance(step, str) and call.get("id"):
                tools.record_step_shown(station, step, call["id"])
        return None

    async def aafter_model(self, state, runtime):
        return self.after_model(state, runtime)

    def wrap_model_call(self, request, handler):
        return handler(with_context(request))

    async def awrap_model_call(self, request, handler):
        return await handler(with_context(request))
