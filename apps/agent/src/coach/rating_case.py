"""A rating as a draft eval case, and a tester's ratings in one file (Ceetrix story 26).

  make rating-to-case [RATING=<file>]   the named rating, or the newest, becomes
                                        apps/agent/evals/cases/drafts/R-<stamp>.json
  make ratings-export                   every rating, zipped into $COACH_HOME

A draft has the eval case's fields (evals/harness.py Case). Its history is the conversation
before the rated turn. A Good rating proposes what the coach did as the expected action; a Not
good rating leaves expect_tool as TODO, because what the coach should have done is the
author's call. drafts/ is not read by the suite (its glob is not recursive), so a draft runs
only once the author has finished it and moved it into cases/.
"""

from __future__ import annotations

import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.coach import progress, ratings

DRAFTS = Path(__file__).resolve().parents[2] / "evals" / "cases" / "drafts"
TODO = "TODO"
CANONICAL_ARGS = ("station", "step", "story_id")
EXPORT_PREFIX = "ratings-export-"
STAMP_FORMAT = "%Y%m%dT%H%M%SZ"
FAILED = 1
DID_CHARS = 300


class NotARating(ValueError):
    pass


def _stamp(record: dict[str, Any]) -> str:
    try:
        return datetime.fromisoformat(record["at"]).astimezone(timezone.utc).strftime(STAMP_FORMAT)
    except (KeyError, TypeError, ValueError):
        return datetime.now(timezone.utc).strftime(STAMP_FORMAT)


def draft(record: dict[str, Any]) -> dict[str, Any]:
    """The draft case for one rating. Raises NotARating for another file."""
    if not isinstance(record, dict) or record.get("schema") != ratings.SCHEMA or record.get("rating") not in ratings.RATINGS:
        raise NotARating("not a rating this version can read")
    history = record.get("history") or []
    rated = next((i for i in range(len(history) - 1, -1, -1) if history[i].get("type") == "ai"), None)
    if rated is None:
        raise NotARating("no coach turn in this rating")
    turn = history[rated]
    before = history[:rated]
    calls = turn.get("tool_calls") or []
    reason = record.get("reason") or "(no reason given)"
    served = record.get("served_by") or {}
    note = (
        f"From a {'Good' if record['rating'] == 'up' else 'Not good'} rating at {record.get('at')}: {reason}. "
        f"Model {served.get('model')} ({served.get('kind')}); fingerprints {record.get('fingerprints')}. "
        "Recorded on the real curriculum: run with COACH_EVALS_REAL_CURRICULUM=1, or rewrite it for the fixtures."
    )
    case: dict[str, Any] = {"id": f"R-{_stamp(record)}", "kind": "steering", "note": note, "history": before}
    if record["rating"] == "down":
        case["expect_tool"] = TODO
        case["expect_args"] = {}
        did = ", ".join(f"{c.get('name')}({json.dumps(c.get('args') or {})})" for c in calls) or f"answered in text: {turn.get('content', '')[:DID_CHARS]}"
        case["note"] += f" The coach did: {did}."
    elif calls:
        first = calls[0]
        case["expect_tool"] = first.get("name")
        case["expect_args"] = {k: v for k, v in (first.get("args") or {}).items() if k in CANONICAL_ARGS}
    else:
        case["expect_tool"] = None
        case["expect_args"] = {}
        case["text_end_ok"] = True
    return case


def newest(folder: Path) -> Path | None:
    found = sorted(folder.glob("*.json")) if folder.is_dir() else []
    return found[-1] if found else None


def write_draft(case: dict[str, Any], drafts: Path = DRAFTS) -> Path:
    """Write the draft without overwriting another: R-<stamp>.json, then -2, -3..."""
    drafts.mkdir(parents=True, exist_ok=True)
    path, n = drafts / f"{case['id']}.json", 1
    while path.exists():
        n += 1
        path = drafts / f"{case['id']}-{n}.json"
    path.write_text(json.dumps(case, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def export(home: Path, now: datetime | None = None) -> Path | None:
    """Zip every rating into $COACH_HOME/ratings-export-<stamp>.zip. None when there are none."""
    folder = home / ratings.RATINGS_DIR
    files = sorted(folder.glob("*.json")) if folder.is_dir() else []
    if not files:
        return None
    stamp = (now or datetime.now(timezone.utc)).strftime(STAMP_FORMAT)
    out = home / f"{EXPORT_PREFIX}{stamp}.zip"
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, arcname=f"{ratings.RATINGS_DIR}/{path.name}")
    return out


def main(argv: list[str], drafts: Path = DRAFTS) -> int:
    home = progress.home()
    if argv[:1] == ["export"]:
        out = export(home)
        if out is None:
            print(f"No ratings in {home / ratings.RATINGS_DIR}.")
            return FAILED
        print(out)
        return 0
    chosen = Path(argv[0]) if argv and argv[0] else newest(home / ratings.RATINGS_DIR)
    if chosen is None or not chosen.is_file():
        print(f"No rating to turn into a case (looked in {home / ratings.RATINGS_DIR}).")
        return FAILED
    try:
        case = draft(json.loads(chosen.read_text(encoding="utf-8")))
    except (ValueError, NotARating) as error:
        print(f"{chosen} isn't a rating I can read: {error}")
        return FAILED
    print(write_draft(case, drafts))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
