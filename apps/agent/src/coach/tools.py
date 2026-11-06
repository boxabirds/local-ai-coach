"""The coach's tools (docs/design.md, "Agent design"; Ceetrix story 10).

What the model may do, and the rules it cannot talk its way round:
- progress.json changes only through set_progress and end_session;
- verified needs a passing run_check for that step in this thread;
- run_check and probe run nothing until the learner has answered the
  permission card, and never take a number from the model: the typed number
  is read from the learner's own card answer in the thread.

run_do_it, the practice terminal's checks and reviews arrive in build step 5.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from langchain.tools import ToolRuntime, tool
from langchain_core.messages import ToolMessage
from langgraph.types import Command

from src.coach import checks, curriculum, probes, progress, thread
from src.coach import consent as consent_store

# Replaced in tests; the real probe runner otherwise.
RUN = probes.run

MODEL_STATUSES = ("read", progress.REPORTED, progress.VERIFIED, progress.SKIPPED)
NEEDS_CONSENT = {
    "needs": "consent",
    "say": "Show the permission card first: call consent_card with these items and history_item, then run the check again.",
    "items": list(consent_store.ITEMS),
    "history_item": consent_store.HISTORY_ITEM,
}
CLAIM_ANSWERS = "The learner's I did it answers this check. Record reported for this step and show the next step's card. Don't ask the question again."
STEP_FIVE = "This kind of check arrives in build step 5; judge the learner's answer yourself for now."


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _item(station_id: str) -> dict[str, Any] | None:
    return next((i for i in curriculum.scope()["readingOrder"] if i["station"] == station_id), None)


def _step(station_id: str, step_id: str) -> dict[str, Any] | None:
    try:
        lesson = curriculum.lesson(station_id)
    except KeyError:
        return None
    return next((s for s in lesson["steps"] if s["id"] == step_id), None)


def chapter_body(station_id: str) -> str | None:
    """The chapter's Markdown without its front matter, which is never shown to the learner."""
    item = _item(station_id)
    if not item or not item.get("chapter"):
        return None
    text = (curriculum.root() / item["chapter"]).read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        text = text[end + 4:] if end != -1 else text
    return text.strip()


def _terms(station_id: str) -> list[dict[str, Any]]:
    item = _item(station_id)
    terms = json.loads((curriculum.root() / "map.json").read_text(encoding="utf-8"))["terms"]
    return [{k: t[k] for k in ("term", "gloss", "analogy", "recap")} for t in terms if item and t.get("firstAt") == item["id"]]


@tool
def run_check(station: str, step: str, runtime: ToolRuntime) -> str:
    """Run a step's check (station and step are ids, as in show_next_step). For a real check it looks at this computer (after permission) and the result is shown to the learner as it is. For an ask check it returns the rubric for you to judge."""
    station_id, step_id = station, step
    step = _step(station_id, step_id)
    if step is None:
        return f"No step {step_id!r} in {station_id!r}."
    kind = (step.get("check") or {}).get("kind")
    messages = runtime.state.get("messages", [])
    if kind == "ask" and step["check"].get("choices"):
        answer = thread.last_answer(messages, "choice_card", step_id)
        if not answer or not isinstance(answer.get("answers"), list):
            return f"Show the choice card for {step_id} (choice_card with the step's text, the choices' item labels and options), then run this check again."
        room = thread.room_for(messages)
        if room is None:
            return "There's no memory number yet. Show the number card first."
        try:
            verdict = checks.grade_choices(step, [str(a) for a in answer["answers"]], room)
        except ValueError as exc:
            return f"The answers didn't match the card ({exc}). Show the choice card again."
        return _json({"station_id": station_id, "step_id": step_id, **verdict})
    if kind == "ask":
        claimed = (thread.last_answer(runtime.state.get("messages", []), "step_card", step_id) or {}).get("action") == "claim"
        if step["check"].get("answeredByClaim") and claimed:
            return _json({"answered": "claim", "say": CLAIM_ANSWERS})
        return _json({"judge": step["check"]["rubric"], "question": step["check"]["question"]})
    if kind != "real":
        return STEP_FIVE
    given = consent_store.load(progress.home())
    if given is None:
        return _json(NEEDS_CONSENT)
    typed = None
    if step["check"].get("compare") == "typed":
        answer = thread.last_answer(messages, "number_card", step_id)
        typed = answer.get("value") if answer else None
        if not isinstance(typed, (int, float)) or isinstance(typed, bool):
            return f"There's no number from the learner for {step_id} yet. Show the number card first."
    verdict = checks.evaluate(step, typed=typed, consent=given, run=RUN, context=runtime.state.get("context") or {})
    return _json({"station_id": station_id, "step_id": step_id, **verdict})


@tool
def set_progress(station: str, status: str, runtime: ToolRuntime, step: str | None = None, note: str | None = None) -> Command | str:
    """Record progress for a step (station and step are ids, as in show_next_step). status is read (a story: give its station, no step), reported (the learner says they did the step), verified (only after a passing run_check for that step) or skipped (always with the step they skipped). Progress only moves up, except to skipped."""
    station_id, step_id = station, step
    if status == progress.SKIPPED and step_id is None:
        return "Refused: say which step was skipped (step), so the rest of the station isn't marked skipped too."
    if station_id not in curriculum.v1_stations():
        return f"No station {station_id!r} in V1."
    if status not in MODEL_STATUSES:
        return f"status must be one of {', '.join(MODEL_STATUSES)}."
    if step_id is not None and _step(station_id, step_id) is None:
        return f"No step {step_id!r} in {station_id!r}."
    evidence = None
    if status == progress.VERIFIED:
        passed = thread.passing_check(runtime.state.get("messages", []), step_id) if step_id else None
        if passed is None:
            return "Refused: verified needs a passing run_check for that step in this conversation. Use reported for the learner's word."
        evidence = passed.get("evidence")
    folder = progress.home()
    record = progress.load(folder)
    at = _now()
    changed = [progress.apply(record, "step", step_id, status, at, evidence)] if step_id else []
    changed.append(progress.apply(record, "station", station_id, status, at, evidence))
    if not any(changed):
        current = progress.status_of(record, "station", station_id)
        return f"Not changed: {station_id} is already {current}, and progress only moves up."
    try:
        progress.save(folder, record)
    except OSError as exc:
        return f"I couldn't save progress ({exc.strerror or 'write failed'}). Nothing was recorded."
    message = f"Recorded {status} for {step_id or station_id}."
    return Command(update={"progress_snapshot": progress.snapshot(record), "messages": [ToolMessage(message, tool_call_id=runtime.tool_call_id)]})


@tool
def probe(name: str, params: dict[str, str] | None = None) -> str:
    """Look at one thing on this computer outside a step, such as whether anything listens on a port. Allowlisted probes only, after permission; you get the matched lines only."""
    given = consent_store.load(progress.home())
    if given is None:
        return _json(NEEDS_CONSENT)
    return _json(RUN(name, params or {}, consent=given))


@tool
def end_session(summary: str) -> str:
    """Save a one-paragraph summary of this session when the learner says goodbye."""
    folder = progress.home()
    record = progress.load(folder)
    progress.add_session(record, summary, _now())
    try:
        progress.save(folder, record)
    except OSError as exc:
        return f"I couldn't save the summary ({exc.strerror or 'write failed'})."
    return "Saved."


# ------------------------------------------------------------------ the agentic flow (story 19)
# These record decisions the model has made; none of them decides or checks the order of steps.

MAX_EVENTS = 200  # the newest kept in progress.json, enough to pick up where a learner left off
EVENTS = "events"


def _record_event(kind: str, **fields: Any) -> bool:
    """Append an event to progress.json (atomic rename). Returns whether it was saved."""
    folder = progress.home()
    record = progress.load(folder)
    events = record.setdefault(EVENTS, [])
    events.append({"event": kind, "at": _now(), **fields})
    del events[:-MAX_EVENTS]
    try:
        progress.save(folder, record)
    except OSError:
        return False
    return True


SHOW_NEXT_STEP = "show_next_step"  # the frontend tool (apps/app use-coach-ui.tsx)


def record_step_shown(station: str, step: str, call_id: str) -> bool:
    """The model chose to show this step (story 22): record it once per tool call, so a
    replayed or redrawn card never adds history. Returns whether a new event was written."""
    events = progress.load(progress.home()).get(EVENTS, [])
    if any(e.get("event") == "step_shown" and e.get("call") == call_id for e in events):
        return False
    return _record_event("step_shown", station=station, step=step, call=call_id)


@tool
def chapter_ended(station: str, summary: str, runtime: ToolRuntime) -> Command | str:
    """Use when you judge the learner has finished a station's steps: closes the chapter and shows them their map.
    summary: one sentence on what they did. Returns the map's statuses."""
    if _item(station) is None:
        return f"No station {station!r} in the curriculum the learner is doing."
    saved = _record_event("chapter_ended", station=station, summary=summary)
    record = progress.load(progress.home())
    snapshot = progress.snapshot(record)
    note = _json({"recorded": saved, "map": snapshot})
    return Command(update={"progress_snapshot": snapshot, "messages": [ToolMessage(note, tool_call_id=runtime.tool_call_id)]})


@tool
def user_navigated(topic: str, details: str, station: str | None = None) -> str:
    """Use when the learner goes to another topic: a question about anything in the book, or a wish to look at another station.
    topic: a few words; details: what they asked or wanted; station: the station it belongs to, if any.
    Returns the last step shown to them, so you can bring them back to it."""
    saved = _record_event("user_navigated", topic=topic, details=details, station=station)
    events = progress.load(progress.home()).get(EVENTS, [])
    shown = next((e for e in reversed(events) if e.get("event") == "step_shown"), None)
    return _json({"recorded": saved, "was_at": shown})


COACH_TOOLS = [run_check, set_progress, probe, end_session, chapter_ended, user_navigated]
