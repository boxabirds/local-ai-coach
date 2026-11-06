#!/usr/bin/env python3
"""Follow the coach's turn log (Ceetrix story 19): one readable line per event.

    make tail            # today's log, as it grows
    make tail FULL=1     # every event as full JSON

Reads $COACH_HOME/logs (default ~/.local-ai-coach/logs). Keys are already redacted
in the file. Standard library only.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

POLL_S = 0.5
PREVIEW = 160
THREAD_CHARS = 8


def log_dir() -> Path:
    home = os.environ.get("COACH_HOME")
    return Path(home) if home else Path.home() / ".local-ai-coach"


def today() -> Path:
    return log_dir() / "logs" / f"coach-{datetime.now(timezone.utc):%Y-%m-%d}.jsonl"


def short(value, limit: int = PREVIEW) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def line(event: dict) -> str:
    at = event.get("at", "")[11:19]
    thread = (event.get("thread") or "-")[:THREAD_CHARS]
    kind = event.get("event")
    head = f"{at} [{thread}]"
    if kind == "model_request":
        messages = event.get("messages") or []
        last = messages[-1] if messages else {}
        system = event.get("system") or {}
        return f"{head} → model {event.get('model_requested')}  system {system.get('chars')} chars #{system.get('sha256')}  {len(messages)} msgs, last {last.get('type')}: {short(last.get('content') or last.get('tool_calls'))}"
    if kind == "model_response":
        calls = event.get("tool_calls") or []
        said = "; ".join(f"{c.get('name')}({short(c.get('args'), 100)})" for c in calls) or short(event.get("text"))
        tokens = event.get("tokens") or {}
        cached = (tokens.get("input_token_details") or {}).get("cache_read", 0)
        return f"{head} ← model {event.get('model_reported')}  {event.get('ms')} ms  in {tokens.get('input_tokens')} ({cached} cached) out {tokens.get('output_tokens')}  {said}"
    if kind == "tool_call":
        return f"{head}   tool {event.get('name')}({short(event.get('args'))})"
    if kind == "tool_result":
        return f"{head}   ⤷ {event.get('name')} {event.get('ms')} ms: {short(event.get('result'))}"
    if kind == "error":
        return f"{head} ✗ {event.get('where')} {event.get('type')}: {short(event.get('message'))}"
    return f"{head} {short(event)}"


def follow(full: bool) -> None:
    path, handle = None, None
    print(f"Following {today()} (Ctrl-C to stop)", file=sys.stderr)
    while True:
        current = today()
        if current != path and current.exists():
            if handle:
                handle.close()
            path, handle = current, current.open(encoding="utf-8")
        row = handle.readline() if handle else ""
        if not row:
            time.sleep(POLL_S)
            continue
        try:
            event = json.loads(row)
        except ValueError:
            continue
        print(json.dumps(event, ensure_ascii=False, indent=2) if full else line(event), flush=True)


if __name__ == "__main__":
    try:
        follow(full=os.environ.get("FULL") == "1")
    except KeyboardInterrupt:
        pass
