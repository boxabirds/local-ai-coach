"""The stub coach: walks chapter 0 and chapter 1 with fixed wording and no model.

Mounted at `/stub` (see main.py). Build step 2 uses it to prove the cards and the
shell without keys; docs/design.md and Ceetrix story 2 describe it.

Each run looks at the last message in the thread, decides one turn with the pure
function `decide`, emits that turn's text and at most one frontend tool call, and
returns the same message so the thread matches what was shown. The walker keeps
no position of its own: it is derived from the thread every run.

It never calls a model or a hosted service. The memory step runs the real
memory probe (Ceetrix story 9), and only after the learner has allowed it on the
permission card. It writes `$COACH_HOME/progress.stub.json` and, once, the
learner's answer to `$COACH_HOME/consent.json`; the real `progress.json` is never
opened.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, MessagesState, StateGraph

from src.bounded_memory_saver import BoundedMemorySaver
from src.coach import checks, curriculum, probes, progress, thread
from src.coach import consent as consent_store

# ------------------------------------------------------------------ constants

STORY_ID = "legal-letter"
STORY_STATION = "d_legal"
LESSON_STATION = "machine"
NUMBER_STEP = "machine.2"
UNIT = "GB"

STUB_FILE = "progress.stub.json"
MAX_THREADS = 200  # as upstream main.py: threads die on restart and are bounded

STATUS_ORDER = progress.STATUS_ORDER
SKIPPED = progress.SKIPPED
VERIFIED = progress.VERIFIED
REPORTED = progress.REPORTED

# Frontend tool names (apps/app/src/hooks/use-coach-ui.tsx).
STORY = "story"
STEP_CARD = "step_card"
NUMBER_CARD = "number_card"
CHECK_RESULT = "check_result"
CONSENT_CARD = "consent_card"
CHOICE_CARD = "choice_card"
SHOW_MAP = "show_map"

# Learner-facing wording. tests/test_coach_stub.py runs every string through
# panel/stylecheck.py --book, as the curriculum validator does for lessons.
HELP = (
    "I'm the stub coach. I don't use a model, so I only know three things. "
    "Press Read Priya's story, What can my computer do?, or Where am I on the map?"
)
STORY_QUESTION = "The day after, what did Priya check?"
STORY_OPTIONS = (
    "Where her words went.",
    "How fast the model answered.",
    "How big the model file was.",
)
STORY_DONE = (
    "Thanks. That's Priya's story, chapter 0. "
    "Next comes your own computer. Press What can my computer do? when you're ready."
)
CHECK_INTRO = "You typed {value} GB. Here's what the check found."
MAP_TEXT = "That's where you are. Each station shows how far you've got."
# Story 8: a question that quotes a bubble. The stub can't answer; it says so and keeps the place.
QUOTE_ACK = "You asked about “{quote}”. I'm the stub coach, so I can't answer questions; the real coach will. Your place is kept, and the card above still works."
QUOTE_SHOWN = 80
BAD_RESULT = "I couldn't read that answer. Try the card again."
SAVE_FAILED = "I couldn't save your progress just now, so I haven't moved you on. Try the card again."

# The permission card (Ceetrix story 9): asked once, before the first look at the machine.
CONSENT_ASK = "Before I check, may I look at this computer? Here's exactly what I'd read."
CONSENT_ITEMS = consent_store.ITEMS
CONSENT_HISTORY = consent_store.HISTORY_ITEM

CANNED = (
    HELP, STORY_QUESTION, *STORY_OPTIONS, STORY_DONE, CHECK_INTRO.format(value=16), MAP_TEXT, BAD_RESULT, SAVE_FAILED,
    CONSENT_ASK, *CONSENT_ITEMS, CONSENT_HISTORY, QUOTE_ACK.format(quote="The drive's the warehouse."),
)

Run = Callable[..., dict[str, Any]]

# "number" is the old starter's word, kept so a typed "Find my number" still starts the station.
STARTER_KEYWORDS = (("story", STORY), ("computer", STEP_CARD), ("number", STEP_CARD), ("map", SHOW_MAP))


# ------------------------------------------------------------------ the turn


@dataclass(frozen=True)
class Turn:
    """What one run of the stub says and does."""

    text: str | None = None
    tool: str | None = None
    args: dict[str, Any] | None = None
    # (kind, key, status) with kind "station" or "step"
    record: tuple[tuple[str, str, str], ...] = field(default_factory=tuple)
    # The permission card's answer, (allow, history), for walk() to save first.
    consent: tuple[bool, bool] | None = None


def _steps(lesson: dict[str, Any]) -> list[dict[str, Any]]:
    return list(lesson["steps"])


def _is_number(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and value > 0


def _step_turn(step: dict[str, Any], station: str, text: str | None = None, record: tuple = ()) -> Turn:
    """The card for a lesson step: the number card for machine.2, the choice card for a
    check with choices (story 11), else a step card."""
    choices = (step.get("check") or {}).get("choices")
    if choices:
        args = {
            "station_id": station,
            "step_id": step["id"],
            "text": step["text"],
            "items": [item["label"] for item in choices["items"]],
            "options": list(choices["options"]),
            "figure": step.get("figure", ""),
            "fact": step.get("fact", ""),
        }
        return Turn(text=text, tool=CHOICE_CARD, args=args, record=record)
    if step["id"] == NUMBER_STEP:
        args = {"station_id": station, "step_id": step["id"], "prompt": step["text"], "unit": UNIT, "hint": step.get("hint", ""), "figure": step.get("figure", ""), "fact": step.get("fact", "")}
        return Turn(text=text, tool=NUMBER_CARD, args=args, record=record)
    args = {
        "station_id": station,
        "step_id": step["id"],
        "text": step["text"],
        "where": step["where"],
        "hint": step.get("hint", ""),
        "has_do_it": "doIt" in step,
        "figure": step.get("figure", ""),
        "fact": step.get("fact", ""),
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


def _quoted(text: str) -> str | None:
    """The quoted words at the start of a message (story 8's "> " lines), shortened, or None."""
    lines = text.split("\n")
    quote = []
    for line in lines:
        if not line.startswith(">"):
            break
        quote.append(line[1:].strip())
    words = " ".join(w for w in quote if w)
    if not quote or len(quote) == len(lines) or not words:
        return None
    return words if len(words) <= QUOTE_SHOWN else words[: QUOTE_SHOWN - 1].rstrip() + "…"


def _starter(text: str) -> str | None:
    folded = text.casefold()
    for keyword, tool in STARTER_KEYWORDS:
        if keyword in folded:
            return tool
    return None


def _check_turn(step: dict[str, Any], station: str, typed: float, consent: dict[str, Any] | None, run: Run, given: tuple[bool, bool] | None = None) -> Turn:
    """The check card for a typed number: verified when the machine agrees, reported when not looked at."""
    verdict = checks.evaluate(step, typed=typed, consent=consent, run=run)
    shown = int(typed) if float(typed).is_integer() else typed
    args = {"station_id": station, "step_id": step["id"], **verdict}
    if verdict["passed"]:
        record = (("step", step["id"], VERIFIED), ("station", station, VERIFIED))
    elif not verdict["checked"]:
        record = (("step", step["id"], REPORTED), ("station", station, REPORTED))
    else:
        record = ()  # the machine disagrees: nothing recorded, the number card comes back
    return Turn(text=CHECK_INTRO.format(value=shown), tool=CHECK_RESULT, args=args, record=record, consent=given)


def decide(
    messages: list[BaseMessage],
    lesson: dict[str, Any],
    *,
    consent: dict[str, Any] | None = None,
    run: Run = probes.run,
) -> Turn:
    """The next turn, from the thread, the learner's consent and the probes it may run.
    No clock and no file I/O; the probes are the only contact with the machine, and
    only with consent."""
    station = lesson["station"]
    if not messages:
        return Turn(text=HELP)
    last = messages[-1]

    if isinstance(last, HumanMessage):
        quoted = _quoted(last.text if hasattr(last, "text") and isinstance(last.text, str) else str(last.content))
        if quoted is not None:
            return Turn(text=QUOTE_ACK.format(quote=quoted))
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
        step_id = args.get("step_id", NUMBER_STEP)
        if args.get("checked") and not args.get("passed"):
            retry = next((s for s in _steps(lesson) if s["id"] == step_id), None)
            if retry is not None:
                return _step_turn(retry, station)
        return _after(step_id, lesson, station)
    if name == SHOW_MAP:
        return Turn(text=MAP_TEXT)
    if name not in (STORY, STEP_CARD, NUMBER_CARD, CONSENT_CARD, CHOICE_CARD):
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
        if not _is_number(value):
            return Turn(text=BAD_RESULT)
        if consent is None:
            ask = {
                "station_id": station,
                "step_id": step_id,
                "typed": value,
                "items": list(CONSENT_ITEMS),
                "history_item": CONSENT_HISTORY,
            }
            return Turn(text=CONSENT_ASK, tool=CONSENT_CARD, args=ask)
        return _check_turn(step, station, value, consent, run)

    if name == CHOICE_CARD:
        if answer.get("action") == "skip":
            return _after(step_id, lesson, station, record=(("step", step_id, SKIPPED),))
        answers = answer.get("answers")
        room = thread.room_for(messages)
        if room is None:
            return _step_turn(next(s for s in _steps(lesson) if s["id"] == NUMBER_STEP), station)
        try:
            verdict = checks.grade_choices(step, [str(a) for a in answers] if isinstance(answers, list) else [], room)
        except ValueError:
            return Turn(text=BAD_RESULT)
        record = (("step", step_id, REPORTED),) if verdict["passed"] else ()
        return Turn(tool=CHECK_RESULT, args={"station_id": station, "step_id": step_id, **verdict}, record=record)

    if name == CONSENT_CARD:
        allow, history, typed = answer.get("allow"), answer.get("history", False), args.get("typed")
        if not isinstance(allow, bool) or not isinstance(history, bool) or not _is_number(typed):
            return Turn(text=BAD_RESULT)
        given = {"probes": allow, "history": allow and history}
        return _check_turn(step, station, typed, given, run, given=(allow, history))

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
    return progress.home()


def empty_record() -> dict[str, Any]:
    return progress.empty_record(stub=True)


def load(folder: Path) -> dict[str, Any]:
    """The stub record, or an empty one if it is missing or unreadable."""
    return progress.load(folder, STUB_FILE, stub=True)


apply = progress.apply
snapshot = progress.snapshot


def save(folder: Path, record: dict[str, Any]) -> None:
    """Write the stub record by atomic rename. Raises OSError if it cannot."""
    progress.save(folder, record, STUB_FILE)


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
    folder = home()
    given = consent_store.load(folder)
    # Probes block for up to 5 s each: keep them off the event loop.
    turn = await asyncio.to_thread(decide, list(state["messages"]), curriculum.lesson(LESSON_STATION), consent=given)
    if turn.consent is not None:
        allow, history = turn.consent
        try:
            consent_store.save(folder, probes=allow, history=history, at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        except OSError:
            turn = Turn(text=SAVE_FAILED)
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
