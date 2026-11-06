"""Ratings of the coach's turns (Ceetrix story 26): the author's ground truth for the evals.

The author (or a tester beside them) presses Good or Not good on something the coach showed.
The browser sends its own copy of the conversation (agent.messages): the agent's checkpointer
keeps threads in memory under an id derived from the provider keys, so it can't be read without
the keys and is gone after a reload, while the browser's copy has every message the model saw.
This module adds what the browser can't know (the model in use, fingerprints of the prompt,
skills and curriculum), turns the conversation into the eval cases' shape, and writes one file
per rating to $COACH_HOME/ratings/ by atomic rename. Nothing is edited later and nothing leaves
this computer. Restart coach leaves the folder alone (restart.LEARNER_FILES).
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.coach import curriculum, progress, server_model, turn_log
from src.coach.stored_keys import from_a_browser

RATINGS_DIR = "ratings"
SCHEMA = 1
RATINGS = ("up", "down")
MAX_REASON = 2000
MAX_MESSAGES = 2000
MAX_ITEM_TEXT = 4000
FINGERPRINT_CHARS = 12
NAME_HEX_BYTES = 4
STAMP_FORMAT = "%Y%m%dT%H%M%SZ"
SKILLS = Path(__file__).resolve().parents[2] / "skills"
ROLE_TO_TYPE = {"user": "human", "assistant": "ai", "tool": "tool"}

FORBIDDEN = 403
UNPROCESSABLE = 422
FAILED_STATUS = 500
# Learner-facing, in the coach's voice.
NOT_OURS = "Only the coach itself can save a rating."
NOT_SAVED = "I couldn't save that rating."
BAD_RATING = "I couldn't read that rating."


class Invalid(ValueError):
    """The body isn't a rating this module can keep."""


def _args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except ValueError:
            return {"_unparsed": raw}
        return parsed if isinstance(parsed, dict) else {"_unparsed": raw}
    return {}


def _text(content: Any) -> str:
    """AG-UI content is a string, or a list of parts with text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


def to_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The browser's messages in the eval cases' shape (evals/harness.py): human, ai with
    tool_calls, tool with tool_call_id. System, developer and other roles are left out; the
    prompt is identified by its fingerprint instead."""
    names: dict[str, str] = {}
    out: list[dict[str, Any]] = []
    for message in messages:
        kind = ROLE_TO_TYPE.get(message.get("role", ""))
        if kind is None:
            continue
        if kind == "ai":
            calls = []
            for call in message.get("toolCalls") or []:
                function = call.get("function") or {}
                names[call.get("id", "")] = function.get("name", "")
                calls.append({"id": call.get("id", ""), "name": function.get("name", ""), "args": _args(function.get("arguments"))})
            item: dict[str, Any] = {"type": "ai", "content": _text(message.get("content"))}
            if calls:
                item["tool_calls"] = calls
            out.append(item)
        elif kind == "tool":
            call_id = message.get("toolCallId", "")
            out.append({"type": "tool", "content": _text(message.get("content")), "tool_call_id": call_id, "name": names.get(call_id)})
        else:
            out.append({"type": "human", "content": _text(message.get("content"))})
    return out


def _rated_slice(messages: list[dict[str, Any]], index: int) -> list[dict[str, Any]]:
    """Up to and including the rated message, then the tool results answering its calls."""
    calls = {call.get("id") for call in messages[index].get("toolCalls") or []}
    end = index + 1
    while end < len(messages) and messages[end].get("role") == "tool" and messages[end].get("toolCallId") in calls:
        end += 1
    return messages[:end]


def _tree_fingerprint(root: Path) -> str | None:
    if not root.is_dir():
        return None
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:FINGERPRINT_CHARS]


def fingerprints() -> dict[str, str | None]:
    from src.prompt import SYSTEM_PROMPT

    return {
        "prompt": hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest()[:FINGERPRINT_CHARS],
        "skills": _tree_fingerprint(SKILLS),
        "curriculum": _tree_fingerprint(curriculum.root()),
    }


def served_by() -> dict[str, Any]:
    """Which model answers now: the learner's own server if one is chosen, else the hosted one."""
    chosen = server_model.load()
    if chosen:
        from urllib.parse import urlsplit

        return {"kind": "server", "host": urlsplit(chosen["base_url"]).netloc, "model": chosen["model"]}
    from src.model import DEFAULT_MODEL

    return {"kind": "hosted", "model": os.environ.get("LLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL}


def build(body: Any, now: datetime | None = None) -> dict[str, Any]:
    """The record to keep for this rating. Raises Invalid."""
    if not isinstance(body, dict):
        raise Invalid("not an object")
    rating = body.get("rating")
    if rating not in RATINGS:
        raise Invalid("rating")
    reason = body.get("reason")
    if reason is not None and (not isinstance(reason, str) or len(reason) > MAX_REASON):
        raise Invalid("reason")
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES or not all(isinstance(m, dict) for m in messages):
        raise Invalid("messages")
    message_id = body.get("message_id")
    if not isinstance(message_id, str) or not message_id:
        raise Invalid("message_id")
    index = next((i for i, m in enumerate(messages) if m.get("id") == message_id), None)
    if index is None or messages[index].get("role") != "assistant":
        raise Invalid("message_id")
    item = body.get("item") if isinstance(body.get("item"), dict) else {}
    kept = _rated_slice(messages, index)
    record = {
        "schema": SCHEMA,
        "at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "thread_id": body.get("thread_id") if isinstance(body.get("thread_id"), str) else None,
        "message_id": message_id,
        "rating": rating,
        "reason": (reason or "").strip() or None,
        "item": {"kind": str(item.get("kind", ""))[:MAX_ITEM_TEXT], "text": str(item.get("text", ""))[:MAX_ITEM_TEXT]},
        "served_by": served_by(),
        "reasoning_effort": server_model.reasoning_effort(),
        "fingerprints": fingerprints(),
        "rated_index": index,
        "messages": kept,
        "history": to_history(kept),
    }
    return turn_log.redact(record, turn_log.known_keys())


def folder() -> Path:
    return progress.home() / RATINGS_DIR


def save(record: dict[str, Any], now: datetime | None = None) -> str:
    """Write the record as a new file; its path relative to $COACH_HOME. Raises OSError."""
    stamp = (now or datetime.now(timezone.utc)).strftime(STAMP_FORMAT)
    name = f"{stamp}-{secrets.token_hex(NAME_HEX_BYTES)}.json"
    progress.save(folder(), record, name)
    return f"{RATINGS_DIR}/{name}"


router = APIRouter()


@router.post("/coach/rating")
async def rating_route(request: Request):
    if from_a_browser([(name.encode(), value.encode()) for name, value in request.headers.items()]):
        return JSONResponse({"error": NOT_OURS}, status_code=FORBIDDEN)
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse({"error": BAD_RATING}, status_code=UNPROCESSABLE)
    try:
        record = build(body)
    except Invalid:
        return JSONResponse({"error": BAD_RATING}, status_code=UNPROCESSABLE)
    try:
        return JSONResponse({"saved": save(record)})
    except OSError:
        return JSONResponse({"error": NOT_SAVED}, status_code=FAILED_STATUS)
