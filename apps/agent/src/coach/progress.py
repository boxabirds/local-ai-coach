"""The learner's progress on disk (docs/design.md, "Curriculum and progress on disk"; Ceetrix story 10).

progress.json in COACH_HOME is written only by set_progress and end_session
(and, in step 5, the review scheduler), always by temp file and rename. The
stub keeps its own progress.stub.json through the same functions, so the two
never touch each other's file.

Status moves only up the order below; skipped can be set from anything below
verified, and a skipped entry can later move up again.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from src.coach import curriculum

PROGRESS_FILE = "progress.json"
DEFAULT_HOME = Path.home() / ".local-ai-coach"
PROGRESS_SCHEMA = 1

STATUS_ORDER = ("unseen", "read", "rehearsed", "reported", "assisted", "verified")
UNSEEN = STATUS_ORDER[0]
SKIPPED = "skipped"
VERIFIED = "verified"
REPORTED = "reported"
STATUSES = (*STATUS_ORDER, SKIPPED)


def home() -> Path:
    configured = os.environ.get("COACH_HOME", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_HOME


def empty_record(**extra: Any) -> dict[str, Any]:
    return {"schema": PROGRESS_SCHEMA, **extra, "stations": {}, "steps": {}, "sessions": []}


def load(folder: Path, name: str = PROGRESS_FILE, **extra: Any) -> dict[str, Any]:
    """The record, or an empty one if it is missing or unreadable."""
    try:
        record = json.loads((folder / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return empty_record(**extra)
    if not isinstance(record, dict) or not isinstance(record.get("stations"), dict) or not isinstance(record.get("steps"), dict):
        return empty_record(**extra)
    record.setdefault("sessions", [])
    return record


def allowed(current: str, requested: str) -> bool:
    if requested == SKIPPED:
        return current != VERIFIED and current != SKIPPED
    if requested not in STATUS_ORDER:
        return False
    if current == SKIPPED:
        return requested != UNSEEN
    return STATUS_ORDER.index(requested) > STATUS_ORDER.index(current if current in STATUS_ORDER else UNSEEN)


def status_of(record: dict[str, Any], kind: str, key: str) -> str:
    return record["stations" if kind == "station" else "steps"].get(key, {}).get("status", UNSEEN)


def apply(record: dict[str, Any], kind: str, key: str, status: str, at: str, evidence: list[dict[str, Any]] | None = None) -> bool:
    """Move one entry up the status order. Returns whether anything changed."""
    table = record["stations" if kind == "station" else "steps"]
    if not allowed(status_of(record, kind, key), status):
        return False
    entry: dict[str, Any] = {"status": status, "at": at}
    if evidence:
        entry["evidence"] = evidence
    table[key] = entry
    return True


def add_session(record: dict[str, Any], summary: str, at: str) -> None:
    record.setdefault("sessions", []).append({"at": at, "summary": summary})


def save(folder: Path, record: dict[str, Any], name: str = PROGRESS_FILE) -> None:
    """Write the record by atomic rename. Raises OSError if it cannot."""
    folder.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{name}.", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(record, handle, indent=2, sort_keys=True)
        os.replace(tmp, folder / name)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def snapshot(record: dict[str, Any]) -> list[dict[str, str]]:
    """The stations the map shows (V1's in reading order, then those shown but not yet taught):
    name, the learner's status, and the station's criticality from the curriculum (omitted when unrated)."""
    names = curriculum.station_names()
    rated = curriculum.station_criticality()
    entries = []
    for sid in curriculum.map_stations():
        entry = {"id": sid, "name": names.get(sid, sid), "status": status_of(record, "station", sid)}
        if sid in rated:
            entry["criticality"] = rated[sid]
        entries.append(entry)
    return entries
