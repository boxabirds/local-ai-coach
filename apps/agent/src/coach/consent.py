"""What the learner has allowed the coach to look at (docs/design.md, "Consent"; Ceetrix story 9).

consent.json in COACH_HOME, written once from the permission card by temp file
and rename. A missing or unreadable file means the learner has not been asked.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

CONSENT_FILE = "consent.json"
KEYS = ("probes", "history", "doIt")


def load(folder: Path) -> dict[str, Any] | None:
    try:
        record = json.loads((folder / CONSENT_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(record, dict) or not all(isinstance(record.get(k), bool) for k in KEYS):
        return None
    return record


def save(folder: Path, *, probes: bool, history: bool, at: str) -> dict[str, Any]:
    """Write the answer. History only counts if looking at all was allowed. Raises OSError on failure."""
    record = {"probes": bool(probes), "history": bool(probes and history), "doIt": False, "granted_at": at}
    folder.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".consent-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(record, handle, indent=2)
        os.replace(tmp, folder / CONSENT_FILE)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return record


def allows(consent: dict[str, Any] | None, key: str) -> bool:
    return isinstance(consent, dict) and consent.get(key) is True
