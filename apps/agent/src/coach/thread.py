"""Reading what has happened in a thread (Ceetrix story 10).

The coach's evidence comes from here, never from the model's own arguments:
what the learner typed on a card, what they answered on the permission card,
and whether a check passed, are all read from the tool results in the thread.
"""

from __future__ import annotations

import json
from typing import Any, Iterator

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage


def _parse(content: Any) -> Any:
    if isinstance(content, (dict, list)):
        return content
    if isinstance(content, str):
        try:
            return json.loads(content)
        except ValueError:
            return None
    return None


def results(messages: list[BaseMessage], name: str) -> Iterator[tuple[dict[str, Any], Any]]:
    """(call args, parsed result) for every completed call of this tool, oldest first."""
    calls: dict[str, dict[str, Any]] = {}
    for message in messages:
        if isinstance(message, AIMessage):
            for call in message.tool_calls:
                if call.get("name") == name and call.get("id"):
                    calls[call["id"]] = call.get("args") or {}
        elif isinstance(message, ToolMessage) and message.tool_call_id in calls:
            yield calls[message.tool_call_id], _parse(message.content)


# show_next_step (story 19) draws whichever card a step calls for, so its answer is that card's answer.
SHOW_NEXT_STEP = "show_next_step"
STEP_CARDS = {"step_card", "number_card", "choice_card"}


def _answers(messages: list[BaseMessage], name: str) -> Iterator[tuple[str | None, Any]]:
    """(step id, parsed answer) for every completed call of this card, or of show_next_step
    when the card is a step's card, oldest first."""
    calls: dict[str, str | None] = {}
    for message in messages:
        if isinstance(message, AIMessage):
            for call in message.tool_calls:
                args = call.get("args") or {}
                if not call.get("id"):
                    continue
                if call.get("name") == name:
                    calls[call["id"]] = args.get("step_id")
                elif name in STEP_CARDS and call.get("name") == SHOW_NEXT_STEP:
                    calls[call["id"]] = args.get("step")
        elif isinstance(message, ToolMessage) and message.tool_call_id in calls:
            yield calls[message.tool_call_id], _parse(message.content)


def last_answer(messages: list[BaseMessage], name: str, step_id: str | None = None) -> dict[str, Any] | None:
    """The newest JSON answer from a card (or from show_next_step for that step), optionally for one step."""
    found = None
    for step, answer in _answers(messages, name):
        if isinstance(answer, dict) and (step_id is None or step == step_id):
            found = answer
    return found


def passing_check(messages: list[BaseMessage], step_id: str) -> dict[str, Any] | None:
    """The newest run_check result for this step, if it passed."""
    found = None
    for args, verdict in results(messages, "run_check"):
        # step (story 19) or step_id (threads from before it)
        if (args.get("step") or args.get("step_id")) == step_id and isinstance(verdict, dict):
            found = verdict
    return found if found and found.get("passed") is True and found.get("checked") is True else None


def room_for(messages: list[BaseMessage]) -> float | None:
    """The learner's memory number for marking (story 11): the newest checked measurement in
    the thread (the real coach's run_check result or the stub's check card), else the newest
    number they typed, else None."""
    measured = None
    for _args, verdict in results(messages, "run_check"):
        if isinstance(verdict, dict) and verdict.get("checked") and isinstance(verdict.get("measured"), (int, float)):
            measured = verdict["measured"]
    for message in messages:
        if isinstance(message, AIMessage):
            for call in message.tool_calls:
                args = call.get("args") or {}
                if call.get("name") == "check_result" and args.get("checked") and isinstance(args.get("measured"), (int, float)):
                    measured = args["measured"]
    if measured is not None:
        return float(measured)
    typed = last_answer(messages, "number_card")
    value = typed.get("value") if typed else None
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
