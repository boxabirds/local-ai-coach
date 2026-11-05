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
from datetime import datetime, timezone
from typing import Any, NotRequired

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import SystemMessage

from src.coach import curriculum, progress, thread
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


def coach_context(state: dict[str, Any]) -> str:
    record = progress.load(progress.home())
    given = consent_store.load(progress.home())
    parts = [
        "## The learner, now",
        f"Platform: {platform.system() or 'unknown'}.",
        f"Permission to look at this computer: {consent_status(given)}.",
        "Map (V1 stations, the learner's status):",
        compressed_map(record),
    ]
    station, step = state.get("station_id"), state.get("step_id")
    if station:
        parts.append(f"Open station: {station}; open step: {step or 'none'}.")
        try:
            parts += ["Lesson (the contract; use its text):", json.dumps(curriculum.lesson(station), ensure_ascii=False)]
        except KeyError:
            pass
        body = chapter_body(station)
        if body:
            parts += ["Chapter text (for answering questions; the learner may not have read it):", body]
    else:
        parts.append("No station is open yet.")
    return "\n\n".join(parts)


def with_context(request):
    note = "\n\n" + coach_context(request.state)
    current = request.system_message.content if request.system_message else ""
    content = [*current, {"type": "text", "text": note}] if isinstance(current, list) else current + note
    return request.override(system_message=SystemMessage(content=content))


class CoachStateMiddleware(AgentMiddleware):
    state_schema = CoachState

    def before_agent(self, state, runtime):
        capture_consent(state.get("messages", []))
        return {"progress_snapshot": progress.snapshot(progress.load(progress.home()))}

    async def abefore_agent(self, state, runtime):
        return self.before_agent(state, runtime)

    def wrap_model_call(self, request, handler):
        return handler(with_context(request))

    async def awrap_model_call(self, request, handler):
        return await handler(with_context(request))
