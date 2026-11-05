"""The stub coach: walks chapter 0 and chapter 1 with fixed wording and no model.

Mounted at `/stub` (see main.py). Build step 2 uses it to prove the cards and the
shell without keys; docs/design.md and Ceetrix story 2 describe it.

Each run looks at the last message in the thread, decides one turn with the pure
function `decide`, emits that turn's text and at most one frontend tool call, and
returns the same message so the thread matches what was shown. The walker keeps
no position of its own: it is derived from the thread every run.

It never calls a model, a hosted service or a probe. The only thing it writes is
`$COACH_HOME/progress.stub.json`; the real `progress.json` is never opened.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, MessagesState, StateGraph

from src.bounded_memory_saver import BoundedMemorySaver
from src.coach import curriculum

# ------------------------------------------------------------------ constants

STORY_ID = "legal-letter"
STORY_STATION = "d_legal"
LESSON_STATION = "machine"
NUMBER_STEP = "machine.2"
UNIT = "GB"

STUB_FILE = "progress.stub.json"
DEFAULT_HOME = Path.home() / ".local-ai-coach"
PROGRESS_SCHEMA = 1
MAX_THREADS = 200  # as upstream main.py: threads die on restart and are bounded

STATUS_ORDER = ("unseen", "read", "rehearsed", "reported", "assisted", "verified")
SKIPPED = "skipped"
VERIFIED = "verified"

# Frontend tool names (apps/app/src/hooks/use-coach-ui.tsx).
STORY = "story"
STEP_CARD = "step_card"
NUMBER_CARD = "number_card"
CHECK_RESULT = "check_result"
SHOW_MAP = "show_map"

# Learner-facing wording. tests/test_coach_stub.py runs every string through
# panel/stylecheck.py --book, as the curriculum validator does for lessons.
HELP = (
    "I'm the stub coach. I don't use a model, so I only know three things. "
    "Press Read Priya's story, Find my number, or Where am I on the map?"
)
STORY_QUESTION = "The day after, what did Priya check?"
STORY_OPTIONS = (
    "Where her words went.",
    "How fast the model answered.",
    "How big the model file was.",
)
STORY_DONE = (
    "Thanks. That's Priya's story, chapter 0. "
    "Next comes your own machine. Press Find my number when you're ready."
)
CHECK_INTRO = "You typed {value} GB. Here's what the check found."
MAP_TEXT = "That's where you are. Each station shows how far you've got."
BAD_RESULT = "I couldn't read that answer. Try the card again."
SAVE_FAILED = "I couldn't save your progress just now, so I haven't moved you on. Try the card again."

# The sample check result for machine.2 (no probes until build step 3).
SAMPLE_EVIDENCE = ({"probe": "memory", "cmd": "sysctl -n hw.memsize", "matched": ["17179869184"]},)
SAMPLE_NOTE = "Sample result. The real probe arrives in step 3."

CANNED = (HELP, STORY_QUESTION, *STORY_OPTIONS, STORY_DONE, CHECK_INTRO.format(value=16), MAP_TEXT, BAD_RESULT, SAVE_FAILED, SAMPLE_NOTE)

STARTER_KEYWORDS = (("story", STORY), ("number", STEP_CARD), ("map", SHOW_MAP))


# ------------------------------------------------------------------ the turn


@dataclass(frozen=True)
class Turn:
    """What one run of the stub says and does."""

    text: str | None = None
    tool: str | None = None
    args: dict[str, Any] | None = None
    # (kind, key, status) with kind "station" or "step"
    record: tuple[tuple[str, str, str], ...] = field(default_factory=tuple)


def _steps(lesson: dict[str, Any]) -> list[dict[str, Any]]:
    return list(lesson["steps"])


def _step_turn(step: dict[str, Any], station: str, text: str | None = None, record: tuple = ()) -> Turn:
    """The card for a lesson step: the number card for machine.2, else a step card."""
    if step["id"] == NUMBER_STEP:
        args = {"station_id": station, "step_id": step["id"], "prompt": step["text"], "unit": UNIT, "hint": step.get("hint", ""), "figure": step.get("figure", "")}
        return Turn(text=text, tool=NUMBER_CARD, args=args, record=record)
    args = {
        "station_id": station,
        "step_id": step["id"],
        "text": step["text"],
        "where": step["where"],
        "hint": step.get("hint", ""),
        "has_do_it": "doIt" in step,
        "figure": step.get("figure", ""),
    }
    return Turn(text=text, tool=STEP_CARD, args=args, record=record)


def _after(step_id: str, lesson: dict[str, Any], station: str, record: tuple = (), text: str | None = None) -> Turn:
    """The turn that follows a finished step: the next step, or the map after the last."""
    steps = _steps(lesson)
    index = next(i for i, step in enumerate(steps) if step["id"] == step_id)
    if index + 1 < len(steps):
        return _step_turn(steps[index + 1], station, text=text, record=record)
    return Turn(text=text, tool=SHOW_MAP, args={"focus": station}, record=record)


def _tool_call(messages: list[BaseMessage], tool_call_id: str) -> dict[str, Any] | None:
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            for call in message.tool_calls:
                if call.get("id") == tool_call_id:
                    return call
    return None


def _starter(text: str) -> str | None:
    folded = text.casefold()
    for keyword, tool in STARTER_KEYWORDS:
        if keyword in folded:
            return tool
    return None


def decide(messages: list[BaseMessage], lesson: dict[str, Any]) -> Turn:
    """The next turn, from the thread alone. Pure: no I/O, no clock."""
    station = lesson["station"]
    if not messages:
        return Turn(text=HELP)
    last = messages[-1]

    if isinstance(last, HumanMessage):
        starter = _starter(last.text if hasattr(last, "text") and isinstance(last.text, str) else str(last.content))
        if starter == STORY:
            return Turn(tool=STORY, args={"story_id": STORY_ID, "question": STORY_QUESTION, "options": list(STORY_OPTIONS)})
        if starter == STEP_CARD:
            return _step_turn(_steps(lesson)[0], station)
        if starter == SHOW_MAP:
            return Turn(tool=SHOW_MAP, args={"focus": station})
        return Turn(text=HELP)

    if not isinstance(last, ToolMessage):
        return Turn(text=HELP)

    call = _tool_call(messages, last.tool_call_id)
    name = call["name"] if call else None
    args = call["args"] if call else {}

    # Render-only cards: CopilotKit returns their result at once.
    if name == CHECK_RESULT:
        return _after(args.get("step_id", NUMBER_STEP), lesson, station)
    if name == SHOW_MAP:
        return Turn(text=MAP_TEXT)
    if name not in (STORY, STEP_CARD, NUMBER_CARD):
        return Turn(text=HELP)

    try:
        answer = json.loads(last.content if isinstance(last.content, str) else "")
    except (TypeError, ValueError):
        answer = None
    if not isinstance(answer, dict):
        return Turn(text=BAD_RESULT)

    if name == STORY:
        if answer.get("read") is not True:
            return Turn(text=BAD_RESULT)
        return Turn(text=STORY_DONE, record=(("station", STORY_STATION, "read"),))

    step_id = args.get("step_id")
    step = next((s for s in _steps(lesson) if s["id"] == step_id), None)
    if step is None:
        return Turn(text=HELP)

    if name == NUMBER_CARD:
        value = answer.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
            return Turn(text=BAD_RESULT)
        shown = int(value) if float(value).is_integer() else value
        check = {
            "station_id": station,
            "step_id": step_id,
            "passed": True,
            "evidence": [dict(item, matched=list(item["matched"])) for item in SAMPLE_EVIDENCE],
            "note": SAMPLE_NOTE,
        }
        record = (("step", step_id, "reported"), ("station", station, "reported"))
        return Turn(text=CHECK_INTRO.format(value=shown), tool=CHECK_RESULT, args=check, record=record)

    action = answer.get("action")
    if action == "claim":
        return _after(step_id, lesson, station)
    if action == "skip":
        return _after(step_id, lesson, station, record=(("step", step_id, SKIPPED),))
    if action == "do_it" and "doIt" in step:
        return _step_turn(step, station, text=step["doIt"]["explain"])
    return Turn(text=BAD_RESULT)


# ------------------------------------------------------------------ progress


def home() -> Path:
    configured = os.environ.get("COACH_HOME", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_HOME


def empty_record() -> dict[str, Any]:
    return {"schema": PROGRESS_SCHEMA, "stub": True, "stations": {}, "steps": {}}


def load(folder: Path) -> dict[str, Any]:
    """The stub record, or an empty one if it is missing or unreadable."""
    try:
        record = json.loads((folder / STUB_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return empty_record()
    if not isinstance(record, dict) or not isinstance(record.get("stations"), dict) or not isinstance(record.get("steps"), dict):
        return empty_record()
    return record


def _allowed(current: str, requested: str) -> bool:
    if requested == SKIPPED:
        return current != VERIFIED and current != SKIPPED
    if requested not in STATUS_ORDER:
        return False
    if current == SKIPPED:
        return requested != STATUS_ORDER[0]
    return STATUS_ORDER.index(requested) > STATUS_ORDER.index(current if current in STATUS_ORDER else STATUS_ORDER[0])


def apply(record: dict[str, Any], kind: str, key: str, status: str, at: str) -> bool:
    """Move one entry up the status order. Returns whether anything changed."""
    table = record["stations" if kind == "station" else "steps"]
    current = table.get(key, {}).get("status", STATUS_ORDER[0])
    if not _allowed(current, status):
        return False
    table[key] = {"status": status, "at": at}
    return True


def save(folder: Path, record: dict[str, Any]) -> None:
    """Write the stub record by atomic rename. Raises OSError if it cannot."""
    folder.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".progress.stub.", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(record, handle, indent=2, sort_keys=True)
        os.replace(tmp, folder / STUB_FILE)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def snapshot(record: dict[str, Any]) -> list[dict[str, str]]:
    """The V1 stations the map shows, in reading order: name, the learner's status,
    and the station's criticality from the curriculum (omitted when unrated)."""
    names = curriculum.station_names()
    rated = curriculum.station_criticality()
    entries = []
    for sid in curriculum.v1_stations():
        entry = {"id": sid, "name": names.get(sid, sid), "status": record["stations"].get(sid, {}).get("status", STATUS_ORDER[0])}
        if sid in rated:
            entry["criticality"] = rated[sid]
        entries.append(entry)
    return entries


# ------------------------------------------------------------------ the graph


class StubState(MessagesState):
    progress_snapshot: list[dict[str, str]]


async def _emit_text(config: RunnableConfig, message_id: str, text: str) -> None:
    await adispatch_custom_event(
        "manually_emit_message",
        {"message": text, "message_id": message_id, "role": "assistant"},
        config=config,
    )


async def _emit_tool_call(config: RunnableConfig, call_id: str, name: str, args: dict[str, Any]) -> None:
    await adispatch_custom_event(
        "manually_emit_tool_call",
        {"name": name, "args": args, "id": call_id},
        config=config,
    )


async def walk(state: StubState, config: RunnableConfig) -> dict[str, Any]:
    turn = decide(list(state["messages"]), curriculum.lesson(LESSON_STATION))
    folder = home()
    record = load(folder)
    if turn.record:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        changed = [apply(record, kind, key, status, now) for kind, key, status in turn.record]
        if any(changed):
            try:
                save(folder, record)
            except OSError:
                turn = Turn(text=SAVE_FAILED)
                record = load(folder)

    # The browser files a streamed tool call under a message whose id is the call's
    # own id (ag-ui-langgraph sets parentMessageId to it). The returned messages must
    # use the same ids, or the end-of-run snapshot replaces the card with a "new"
    # message and the browser redraws it, losing what the learner had done.
    messages: list[AIMessage] = []
    if turn.text:
        text_id = str(uuid.uuid4())
        await _emit_text(config, text_id, turn.text)
        messages.append(AIMessage(id=text_id, content=turn.text))
    if turn.tool:
        call_id = str(uuid.uuid4())
        await _emit_tool_call(config, call_id, turn.tool, turn.args or {})
        call = {"id": call_id, "name": turn.tool, "args": turn.args or {}, "type": "tool_call"}
        messages.append(AIMessage(id=call_id, content="", tool_calls=[call]))
    return {"messages": messages, "progress_snapshot": snapshot(record)}


def build_graph():
    graph = StateGraph(StubState)
    graph.add_node("walk", walk)
    graph.add_edge(START, "walk")
    graph.add_edge("walk", END)
    return graph.compile(checkpointer=BoundedMemorySaver(max_threads=MAX_THREADS))


stub_graph = build_graph()
