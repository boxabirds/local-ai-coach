"""The whole map (Ceetrix story 29): every station, where the learner is, and where they want to go.

Read-only map data comes from the curriculum (stations.json and its generated map-layout.json)
and the learner's record; the one thing written is the learner's goal, a destination, kept in
the progress record by atomic rename. A goal never changes any status. The stub coach keeps its
own record (progress.stub.json); the app asks for it with record=stub.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.coach import curriculum, progress
from src.coach.stored_keys import from_a_browser

LAYOUT_FILE = "map-layout.json"
STUB_RECORD = "progress.stub.json"
GOAL = "goal"
EVENTS = "events"
STEP_SHOWN = "step_shown"
# Covered: full strength on the map, and off the route (decision 2 in the proposal).
COVERED = frozenset({"reported", "assisted", "verified", "skipped"})
STATION_FIELDS = ("id", "name", "area", "zone", "needs", "unlocks", "destination")

FORBIDDEN = 403
UNPROCESSABLE = 422
FAILED_STATUS = 500
# Learner-facing, in the coach's voice.
NOT_OURS = "Only the coach itself can set a goal."
NOT_A_DESTINATION = "That isn't a destination on the map."
NOT_LOADED = "I couldn't load the map."
NOT_SAVED = "I couldn't save that goal."


@lru_cache(maxsize=None)
def _stations(folder: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    doc = json.loads((Path(folder) / "stations.json").read_text(encoding="utf-8"))
    return doc["areas"], doc["stations"]


@lru_cache(maxsize=None)
def _layout(folder: str) -> dict[str, Any]:
    return json.loads((Path(folder) / LAYOUT_FILE).read_text(encoding="utf-8"))


def stations_by_id() -> dict[str, dict[str, Any]]:
    _, stations = _stations(str(curriculum.root()))
    return {s["id"]: s for s in stations}


def record_name(which: str | None) -> str:
    return STUB_RECORD if which == "stub" else progress.PROGRESS_FILE


def _covered(record: dict[str, Any], sid: str) -> bool:
    return progress.status_of(record, "station", sid) in COVERED


def current_station(record: dict[str, Any]) -> str:
    """Where the learner is: the station of the last step the coach showed, else the first station
    of the reading order not yet covered, else the last one."""
    shown = next((e for e in reversed(record.get(EVENTS) or []) if e.get("event") == STEP_SHOWN and e.get("station")), None)
    if shown:
        return shown["station"]
    order = curriculum.v1_stations()
    return next((sid for sid in order if not _covered(record, sid)), order[-1])


def route(goal: str, record: dict[str, Any], stations: dict[str, dict[str, Any]]) -> list[str]:
    """Everything the goal needs, directly or not, the goal included, that is not covered yet; each
    station after what it needs. Empty when the goal is reached."""
    ordered: list[str] = []
    seen: set[str] = set()

    def visit(sid: str) -> None:
        if sid in seen or sid not in stations:
            return
        seen.add(sid)
        for need in stations[sid].get("needs") or []:
            visit(need)
        if not _covered(record, sid):
            ordered.append(sid)

    visit(goal)
    return ordered


def goal_of(record: dict[str, Any], stations: dict[str, dict[str, Any]]) -> str | None:
    """The learner's goal, if it is still a destination on the map (the curriculum can change)."""
    goal = record.get(GOAL)
    sid = goal.get("destination") if isinstance(goal, dict) else None
    return sid if sid in stations and stations[sid].get("destination") else None


def map_data(which: str | None = None) -> dict[str, Any]:
    folder = str(curriculum.root())
    areas, stations_list = _stations(folder)
    layout = _layout(folder)
    stations = {s["id"]: s for s in stations_list}
    record = progress.load(progress.home(), record_name(which))
    rated = curriculum.station_criticality()
    goal = goal_of(record, stations)
    path = route(goal, record, stations) if goal else []
    return {
        "areas": areas,
        "stations": [
            {**{k: s[k] for k in STATION_FIELDS if k in s}, "criticality": rated.get(s["id"]), "status": progress.status_of(record, "station", s["id"])}
            for s in stations_list
        ],
        "layout": layout,
        "current": current_station(record),
        "goal": goal,
        "route": path,
        "reached": bool(goal) and not path,
    }


def goal_line(record: dict[str, Any]) -> str | None:
    """For the coach's context: the goal and the route, as ids; None without a goal."""
    stations = stations_by_id()
    goal = goal_of(record, stations)
    if not goal:
        return None
    path = route(goal, record, stations)
    return f"The learner's goal: {goal}. Route (not covered yet, in order): {', '.join(path) if path else 'none, the goal is reached'}."


def set_goal(destination: str | None, which: str | None = None, now: datetime | None = None) -> dict[str, Any]:
    """Make a destination the learner's goal, or clear it with None. Raises ValueError for anything
    that is not a destination, OSError when the record can't be written. Touches nothing else."""
    stations = stations_by_id()
    if destination is not None and not (destination in stations and stations[destination].get("destination")):
        raise ValueError(destination)
    home = progress.home()
    name = record_name(which)
    record = progress.load(home, name)
    if destination is None:
        record.pop(GOAL, None)
    else:
        record[GOAL] = {"destination": destination, "at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")}
    progress.save(home, record, name)
    return map_data(which)


router = APIRouter()


@router.get("/curriculum/map")
def map_route(record: str | None = None):
    try:
        return JSONResponse(map_data(record))
    except (OSError, ValueError, KeyError):
        return JSONResponse({"error": NOT_LOADED}, status_code=FAILED_STATUS)


@router.post("/coach/goal")
async def goal_route(request: Request, record: str | None = None):
    if from_a_browser([(name.encode(), value.encode()) for name, value in request.headers.items()]):
        return JSONResponse({"error": NOT_OURS}, status_code=FORBIDDEN)
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse({"error": NOT_A_DESTINATION}, status_code=UNPROCESSABLE)
    destination = body.get("destination") if isinstance(body, dict) else ...
    if destination is not None and not isinstance(destination, str):
        return JSONResponse({"error": NOT_A_DESTINATION}, status_code=UNPROCESSABLE)
    try:
        return JSONResponse(set_goal(destination, record))
    except ValueError:
        return JSONResponse({"error": NOT_A_DESTINATION}, status_code=UNPROCESSABLE)
    except OSError:
        return JSONResponse({"error": NOT_SAVED}, status_code=FAILED_STATUS)
