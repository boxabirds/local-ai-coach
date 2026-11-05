"""Every model call and tool call, written to a log on the learner's own computer
(Ceetrix story 19, obs.turn_log). For diagnosing the coach: `make tail` follows it.

One JSON object per line in $COACH_HOME/logs/coach-YYYY-MM-DD.jsonl; the seven newest
files are kept. Events: model_request (what the model is sent), model_response (what it
said and called), tool_call and tool_result (each agent-side tool), error. Every event has
the conversation's thread id and the time.

API keys never reach the file: anything equal to a key the coach knows (this request's
credentials, the keys saved on this computer) or shaped like a provider key is written as
[key]. Writing is best effort: a failure never interrupts the learner's turn.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import BaseMessage

from src.coach import keystore, progress

LOG_DIR = "logs"
LOG_PREFIX = "coach-"
LOG_SUFFIX = ".jsonl"
KEEP_FILES = 7
REDACTED = "[key]"
HASH_CHARS = 12
MS_PER_S = 1000
# A provider key: sk- then at least 20 key characters (OpenAI's sk-proj-... included).
KEY_SHAPE = re.compile(r"sk-[A-Za-z0-9_\-]{20,}")


def log_dir() -> Path:
    return progress.home() / LOG_DIR


def today_file(now: datetime | None = None) -> Path:
    now = now or datetime.now(timezone.utc)
    return log_dir() / f"{LOG_PREFIX}{now:%Y-%m-%d}{LOG_SUFFIX}"


def known_keys() -> set[str]:
    """Every key this process could know right now; never logged."""
    keys: set[str] = set()
    try:
        from src.credentials import current_credentials

        credentials = current_credentials.get()
        if credentials is not None:
            keys |= {credentials.openai, credentials.jev}
    except Exception:  # noqa: BLE001 (logging must never break a turn)
        pass
    try:
        saved = keystore.cached()
        if saved:
            keys |= set(saved)
    except Exception:  # noqa: BLE001
        pass
    return {key for key in keys if key}


def redact(value: Any, secrets: set[str]) -> Any:
    """The same structure with every key replaced by [key]."""
    if isinstance(value, str):
        for secret in secrets:
            value = value.replace(secret, REDACTED)
        return KEY_SHAPE.sub(REDACTED, value)
    if isinstance(value, dict):
        return {k: redact(v, secrets) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v, secrets) for v in value]
    return value


def _prune(folder: Path) -> None:
    files = sorted(folder.glob(f"{LOG_PREFIX}*{LOG_SUFFIX}"))
    for old in files[:-KEEP_FILES]:
        old.unlink(missing_ok=True)


def write(event: dict[str, Any]) -> None:
    """Append one event, redacted. Never raises."""
    try:
        now = datetime.now(timezone.utc)
        record = {"at": now.isoformat(timespec="milliseconds"), **event}
        line = json.dumps(redact(record, known_keys()), ensure_ascii=False, default=str)
        path = today_file(now)
        path.parent.mkdir(parents=True, exist_ok=True)
        fresh = not path.exists()
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        if fresh:
            _prune(path.parent)
    except Exception:  # noqa: BLE001
        pass


def _thread() -> str | None:
    try:
        from langgraph.config import get_config

        return (get_config().get("configurable") or {}).get("thread_id")
    except Exception:  # noqa: BLE001
        return None


def message(m: BaseMessage) -> dict[str, Any]:
    out: dict[str, Any] = {"type": m.type, "content": m.content}
    for field in ("tool_calls", "tool_call_id", "name"):
        value = getattr(m, field, None)
        if value:
            out[field] = value
    return out


def _system(request: Any) -> dict[str, Any]:
    system = request.system_message.content if request.system_message else (request.system_prompt or "")
    text = system if isinstance(system, str) else json.dumps(system, default=str)
    return {"chars": len(text), "sha256": hashlib.sha256(text.encode()).hexdigest()[:HASH_CHARS]}


def _requested_model(request: Any) -> str | None:
    model = getattr(request, "model", None)
    for name in ("model_name", "model"):
        value = getattr(model, name, None)
        if isinstance(value, str):
            return value
    return type(model).__name__ if model is not None else None


def _response(result: Any) -> dict[str, Any]:
    messages = getattr(result, "result", None) or []
    ai = next((m for m in messages if getattr(m, "type", "") == "ai"), None)
    if ai is None:
        return {}
    meta = getattr(ai, "response_metadata", {}) or {}
    return {
        "model_reported": meta.get("model_name") or meta.get("model"),
        "text": ai.content,
        "tool_calls": getattr(ai, "tool_calls", []) or [],
        "tokens": getattr(ai, "usage_metadata", None),
    }


class TurnLog(AgentMiddleware):
    """Last in the middleware list, so it sees exactly what the model is sent."""

    def _before(self, request: Any) -> float:
        write({
            "event": "model_request", "thread": _thread(), "model_requested": _requested_model(request),
            "system": _system(request), "messages": [message(m) for m in request.messages],
        })
        return time.monotonic()

    def _after(self, result: Any, started: float) -> None:
        write({"event": "model_response", "thread": _thread(), "ms": round((time.monotonic() - started) * MS_PER_S), **_response(result)})

    def _error(self, kind: str, error: Exception, started: float, **extra: Any) -> None:
        write({"event": "error", "where": kind, "thread": _thread(), "type": type(error).__name__,
               "message": str(error), "ms": round((time.monotonic() - started) * MS_PER_S), **extra})

    def wrap_model_call(self, request, handler):
        started = self._before(request)
        try:
            result = handler(request)
        except Exception as error:
            self._error("model", error, started)
            raise
        self._after(result, started)
        return result

    async def awrap_model_call(self, request, handler):
        started = self._before(request)
        try:
            result = await handler(request)
        except Exception as error:
            self._error("model", error, started)
            raise
        self._after(result, started)
        return result

    def _tool_before(self, request: Any) -> float:
        call = request.tool_call
        write({"event": "tool_call", "thread": _thread(), "name": call.get("name"), "args": call.get("args"), "id": call.get("id")})
        return time.monotonic()

    def _tool_after(self, request: Any, result: Any, started: float) -> None:
        content = getattr(result, "content", None)
        if content is None:  # a Command: log its update
            content = getattr(result, "update", str(result))
        write({"event": "tool_result", "thread": _thread(), "name": request.tool_call.get("name"),
               "id": request.tool_call.get("id"), "result": content, "ms": round((time.monotonic() - started) * MS_PER_S)})

    def wrap_tool_call(self, request, handler):
        started = self._tool_before(request)
        try:
            result = handler(request)
        except Exception as error:
            self._error("tool", error, started, name=request.tool_call.get("name"))
            raise
        self._tool_after(request, result, started)
        return result

    async def awrap_tool_call(self, request, handler):
        started = self._tool_before(request)
        try:
            result = await handler(request)
        except Exception as error:
            self._error("tool", error, started, name=request.tool_call.get("name"))
            raise
        self._tool_after(request, result, started)
        return result
