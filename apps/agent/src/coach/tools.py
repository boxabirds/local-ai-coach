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
    text = (curriculum.CURRICULUM / item["chapter"]).read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        text = text[end + 4:] if end != -1 else text
    return text.strip()


def _terms(station_id: str) -> list[dict[str, Any]]:
    item = _item(station_id)
    terms = json.loads((curriculum.CURRICULUM / "map.json").read_text(encoding="utf-8"))["terms"]
    return [{k: t[k] for k in ("term", "gloss", "analogy", "recap")} for t in terms if item and t.get("firstAt") == item["id"]]


@tool
def get_station(station_id: str) -> str:
    """Read a V1 station's lesson: its steps in order, why it matters, its recap, the chapter body and the terms it defines."""
    item = _item(station_id)
    if not item or item["kind"] != "lesson":
        stations = ", ".join(i["station"] for i in curriculum.scope()["readingOrder"] if i["kind"] == "lesson")
        return f"No lesson for {station_id!r}. Lessons: {stations}."
    return _json({"lesson": curriculum.lesson(station_id), "chapter": chapter_body(station_id), "terms": _terms(station_id)})


@tool
def start_step(station_id: str, step_id: str, runtime: ToolRuntime) -> Command | str:
    """Mark which lesson step is open, before showing its card. Questions in between keep this place."""
    if _step(station_id, step_id) is None:
        return f"No step {step_id!r} in {station_id!r}."
    note = f"Step {step_id} is open. Show its card now."
    return Command(update={"station_id": station_id, "step_id": step_id, "messages": [ToolMessage(note, tool_call_id=runtime.tool_call_id)]})


@tool
def run_check(station_id: str, step_id: str, runtime: ToolRuntime) -> str:
    """Run a step's check. For a real check it looks at this computer (after permission) and the result is shown to the learner as it is. For an ask check it returns the rubric for you to judge."""
    step = _step(station_id, step_id)
    if step is None:
        return f"No step {step_id!r} in {station_id!r}."
    kind = (step.get("check") or {}).get("kind")
    if kind == "ask":
        return _json({"judge": step["check"]["rubric"], "question": step["check"]["question"]})
    if kind != "real":
        return STEP_FIVE
    given = consent_store.load(progress.home())
    if given is None:
        return _json(NEEDS_CONSENT)
    messages = runtime.state.get("messages", [])
    typed = None
    if step["check"].get("compare") == "typed":
        answer = thread.last_answer(messages, "number_card", step_id)
        typed = answer.get("value") if answer else None
        if not isinstance(typed, (int, float)) or isinstance(typed, bool):
            return f"There's no number from the learner for {step_id} yet. Show the number card first."
    verdict = checks.evaluate(step, typed=typed, consent=given, run=RUN, context=runtime.state.get("context") or {})
    return _json({"station_id": station_id, "step_id": step_id, **verdict})


@tool
def set_progress(station_id: str, status: str, runtime: ToolRuntime, step_id: str | None = None, note: str | None = None) -> Command | str:
    """Record progress. status is read (story), reported (the learner says they did it), verified (only after a passing run_check for that step) or skipped. Progress only moves up, except to skipped."""
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


COACH_TOOLS = [get_station, start_step, run_check, set_progress, probe, end_session]
