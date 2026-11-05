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


def last_answer(messages: list[BaseMessage], name: str, step_id: str | None = None) -> dict[str, Any] | None:
    """The newest JSON answer from a card, optionally for one step."""
    found = None
    for args, answer in results(messages, name):
        if isinstance(answer, dict) and (step_id is None or args.get("step_id") == step_id):
            found = answer
    return found


def passing_check(messages: list[BaseMessage], step_id: str) -> dict[str, Any] | None:
    """The newest run_check result for this step, if it passed."""
    found = None
    for args, verdict in results(messages, "run_check"):
        if args.get("step_id") == step_id and isinstance(verdict, dict):
            found = verdict
    return found if found and found.get("passed") is True and found.get("checked") is True else None
