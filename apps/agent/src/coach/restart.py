"""Restart coach (Ceetrix story 23): start again from the very beginning.

The learner's own files (progress, the stub's progress, and the permission to look at this
computer) move whole into $COACH_HOME/old/<UTC stamp>/, so a restart by mistake can be undone
by hand. They are moved, never edited, so the rule that progress only moves up still holds
inside every record. The keys (Keychain), the chosen server (provider.json) and the logs stay.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.coach import progress
from src.coach.stored_keys import from_a_browser

LEARNER_FILES = ("consent.json", "progress.json", "progress.stub.json")
BACKUP_DIR = "old"
STAMP_FORMAT = "%Y%m%dT%H%M%SZ"
FORBIDDEN = 403
FAILED_STATUS = 500
# Learner-facing, in the coach's voice.
NOT_OURS = "Only the coach itself can restart."
FAILED = "I couldn't put your progress aside, so I've left it where it was. Anything I'd already moved is in the old folder."


def restart(now: datetime | None = None) -> dict[str, Any]:
    """Move the learner's files into a new dated backup. {archived: "old/<stamp>" or None, moved: [names]}.
    OSError if a move fails; files moved before it stay in the backup."""
    home = progress.home()
    present = [name for name in LEARNER_FILES if (home / name).exists()]
    if not present:
        return {"archived": None, "moved": []}
    stamp = (now or datetime.now(timezone.utc)).strftime(STAMP_FORMAT)
    folder, n = home / BACKUP_DIR / stamp, 1
    while folder.exists():
        n += 1
        folder = home / BACKUP_DIR / f"{stamp}-{n}"
    folder.mkdir(parents=True)
    for name in present:
        os.replace(home / name, folder / name)
    return {"archived": folder.relative_to(home).as_posix(), "moved": present}


router = APIRouter()


@router.post("/coach/restart")
def restart_route(request: Request):
    if from_a_browser([(name.encode(), value.encode()) for name, value in request.headers.items()]):
        return JSONResponse({"error": NOT_OURS}, status_code=FORBIDDEN)
    try:
        return JSONResponse(restart())
    except OSError:
        return JSONResponse({"error": FAILED}, status_code=FAILED_STATUS)
