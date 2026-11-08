"""A tester's feedback as one file they send the author themselves (Ceetrix story 34).

Ratings (story 26) are already kept one file each in $COACH_HOME/ratings/. This module adds:
- notes: feedback that isn't about one reply, one file each in notes/, kept with the
  conversation on screen when it was written, in the same shape as a rating;
- the unsent count: ratings and notes not yet in a feedback file;
- the feedback file: every unsent rating and note, the turn log's errors since the last file,
  the coach's version. The page hands it to the browser as a download, and the tester sends it.

feedback-sent.json records what earlier files held, by atomic rename and only once a file is
fully built, so a failure marks nothing. Nothing here sends anything anywhere, and Restart
coach leaves all of it alone (restart.LEARNER_FILES).
"""

from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.coach import progress, ratings, server_model, turn_log
from src.coach.stored_keys import from_a_browser

NOTES_DIR = "notes"
SENT_FILE = "feedback-sent.json"
SCHEMA = 1
MAX_NOTE = 4000
FILE_PREFIX = "coach-feedback-"
FILE_STAMP = "%Y%m%d-%H%M%S"
# The release writes VERSION at its root (scripts/build-release.sh); the repo has none.
VERSION_FILE = Path(__file__).resolve().parents[4] / "VERSION"
DEV_VERSION = "dev"
ERROR_EVENT = "error"

FORBIDDEN = 403
UNPROCESSABLE = 422
FAILED_STATUS = 500
# Learner-facing, in the coach's voice.
NOT_OURS = "Only the coach itself can do that."
BAD_NOTE = "I couldn't read that note."
NOTE_NOT_SAVED = "I couldn't keep that note."
FILE_NOT_BUILT = "I couldn't put your feedback in a file."


class Invalid(ValueError):
    """The body isn't a note this module can keep."""


def build_note(body: Any, now: datetime | None = None) -> dict[str, Any]:
    """The record to keep for this note. Raises Invalid."""
    if not isinstance(body, dict):
        raise Invalid("not an object")
    note = body.get("note")
    if not isinstance(note, str) or not note.strip() or len(note.strip()) > MAX_NOTE:
        raise Invalid("note")
    messages = body.get("messages")
    if not isinstance(messages, list) or len(messages) > ratings.MAX_MESSAGES or not all(isinstance(m, dict) for m in messages):
        raise Invalid("messages")
    record = {
        "schema": SCHEMA,
        "at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "thread_id": body.get("thread_id") if isinstance(body.get("thread_id"), str) else None,
        "note": note.strip(),
        "served_by": ratings.answered_by(body.get("coach")),
        "reasoning_effort": server_model.reasoning_effort(),
        "fingerprints": ratings.fingerprints(),
        "messages": messages,
        "history": ratings.to_history(messages),
    }
    return turn_log.redact(record, turn_log.known_keys())


def save_note(record: dict[str, Any], now: datetime | None = None) -> str:
    """Write the note as a new file; its path relative to $COACH_HOME. Raises OSError."""
    stamp = (now or datetime.now(timezone.utc)).strftime(ratings.STAMP_FORMAT)
    name = f"{stamp}-{secrets.token_hex(ratings.NAME_HEX_BYTES)}.json"
    progress.save(progress.home() / NOTES_DIR, record, name)
    return f"{NOTES_DIR}/{name}"


def _sent() -> dict[str, Any]:
    """What earlier files held; an unreadable record counts as nothing saved."""
    try:
        record = json.loads((progress.home() / SENT_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"files": [], "errors_through": None}
    files = record.get("files") if isinstance(record, dict) else None
    through = record.get("errors_through") if isinstance(record, dict) else None
    return {
        "files": [f for f in files if isinstance(f, str)] if isinstance(files, list) else [],
        "errors_through": through if isinstance(through, str) else None,
    }


def _records(folder: str) -> list[str]:
    root = progress.home() / folder
    if not root.is_dir():
        return []
    return sorted(f"{folder}/{path.name}" for path in root.glob("*.json"))


def unsent() -> list[str]:
    """Ratings and notes not yet in a feedback file, as paths relative to $COACH_HOME."""
    done = set(_sent()["files"])
    return [path for path in _records(ratings.RATINGS_DIR) + _records(NOTES_DIR) if path not in done]


def _when(stamp: str) -> datetime | None:
    try:
        return datetime.fromisoformat(stamp)
    except (TypeError, ValueError):
        return None


def errors_after(through: str | None) -> list[dict[str, Any]]:
    """The turn log's error events later than `through` (all of them when None), oldest first."""
    after = _when(through) if through else None
    found: list[dict[str, Any]] = []
    folder = turn_log.log_dir()
    if not folder.is_dir():
        return found
    for path in sorted(folder.glob(f"{turn_log.LOG_PREFIX}*{turn_log.LOG_SUFFIX}")):
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if not isinstance(event, dict) or event.get("event") != ERROR_EVENT:
                continue
            at = _when(event.get("at"))
            if at is None or (after is not None and at <= after):
                continue
            found.append(event)
    return sorted(found, key=lambda event: _when(event["at"]))


def version() -> str:
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip() or DEV_VERSION
    except OSError:
        return DEV_VERSION


@dataclass
class Built:
    filename: str
    file: dict[str, Any]
    paths: list[str]
    errors_through: str | None


def build_file(now: datetime | None = None) -> Built:
    """Every unsent rating and note, and the errors since the last file. Marks nothing.
    Raises OSError or ValueError when a record can't be read."""
    now = now or datetime.now(timezone.utc)
    sent = _sent()
    paths = unsent()
    home = progress.home()
    kept = {ratings.RATINGS_DIR: [], NOTES_DIR: []}
    for path in paths:
        kept[path.split("/", 1)[0]].append(json.loads((home / path).read_text(encoding="utf-8")))
    errors = errors_after(sent["errors_through"])
    file = {
        "schema": SCHEMA,
        "made_at": now.isoformat(timespec="seconds"),
        "version": version(),
        "ratings": kept[ratings.RATINGS_DIR],
        "notes": kept[NOTES_DIR],
        "errors": errors,
    }
    return Built(
        filename=f"{FILE_PREFIX}{now.strftime(FILE_STAMP)}.json",
        file=turn_log.redact(file, turn_log.known_keys()),
        paths=paths,
        errors_through=errors[-1]["at"] if errors else sent["errors_through"],
    )


def mark_sent(paths: list[str], errors_through: str | None) -> None:
    """Record that a file held these. Raises OSError."""
    sent = _sent()
    progress.save(progress.home(), {"schema": SCHEMA, "files": sorted(set(sent["files"]) | set(paths)), "errors_through": errors_through}, SENT_FILE)


router = APIRouter()


def _not_ours(request: Request) -> bool:
    return from_a_browser([(name.encode(), value.encode()) for name, value in request.headers.items()])


@router.get("/coach/feedback")
def count_route(request: Request):
    if _not_ours(request):
        return JSONResponse({"error": NOT_OURS}, status_code=FORBIDDEN)
    return JSONResponse({"unsent": len(unsent())})


@router.post("/coach/note")
async def note_route(request: Request):
    if _not_ours(request):
        return JSONResponse({"error": NOT_OURS}, status_code=FORBIDDEN)
    try:
        record = build_note(await request.json())
    except (ValueError, Invalid):
        return JSONResponse({"error": BAD_NOTE}, status_code=UNPROCESSABLE)
    try:
        return JSONResponse({"saved": save_note(record)})
    except OSError:
        return JSONResponse({"error": NOTE_NOT_SAVED}, status_code=FAILED_STATUS)


@router.post("/coach/feedback/file")
def file_route(request: Request):
    if _not_ours(request):
        return JSONResponse({"error": NOT_OURS}, status_code=FORBIDDEN)
    try:
        built = build_file()
        mark_sent(built.paths, built.errors_through)
    except (OSError, ValueError, KeyError):
        return JSONResponse({"error": FILE_NOT_BUILT}, status_code=FAILED_STATUS)
    return JSONResponse({"filename": built.filename, "file": built.file})
