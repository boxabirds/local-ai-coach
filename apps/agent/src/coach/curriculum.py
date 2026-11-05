"""Read-only access to the curriculum (docs/design.md, Curriculum on disk).

Nothing here writes. Paths come from `scope.json`, never from a request. The folder is
curriculum/ at the repo root unless COACH_CURRICULUM names another; the code tests point it
at their own frozen copy, fixtures/curriculum/ (Ceetrix story 13).
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
DEFAULT = REPO / "curriculum"
ENV = "COACH_CURRICULUM"
SCOPE_FILE = "scope.json"
STORY_KIND = "story"


def root() -> Path:
    """The curriculum folder: $COACH_CURRICULUM (relative paths resolve against the repo; empty
    means unset), else curriculum/. A folder without scope.json, or a file, is an error, never
    a fallback to the real curriculum."""
    chosen = os.environ.get(ENV, "").strip()
    folder = DEFAULT if not chosen else Path(chosen) if Path(chosen).is_absolute() else REPO / chosen
    if not (folder / SCOPE_FILE).is_file():
        raise FileNotFoundError(f"curriculum folder {folder} has no {SCOPE_FILE}")
    return folder


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _scope(folder: Path) -> dict[str, Any]:
    return _read_json(folder / SCOPE_FILE)


def scope() -> dict[str, Any]:
    return _scope(root())


@lru_cache(maxsize=None)
def _lesson(folder: Path, station_id: str) -> dict[str, Any]:
    for item in _scope(folder)["readingOrder"]:
        if item["kind"] == "lesson" and item["station"] == station_id:
            return _read_json(folder / item["file"])
    raise KeyError(station_id)


def lesson(station_id: str) -> dict[str, Any]:
    """The lesson JSON for a station listed in the reading order."""
    return _lesson(root(), station_id)


def station_names() -> dict[str, str]:
    """Station id to display name, for every station in stations.json."""
    return _station_names(root())


@lru_cache(maxsize=None)
def _station_names(folder: Path) -> dict[str, str]:
    """Station id to display name, for every station in stations.json."""
    names: dict[str, str] = {}

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if isinstance(node.get("id"), str) and isinstance(node.get("name"), str) and "needs" in node:
                names[node["id"]] = node["name"]
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(_read_json(folder / "stations.json"))
    return names


# The book's three criticality colours, from each station's "inYourHead" (Ceetrix story 5).
CRITICALITY = {"press go": "grey", "know what it does": "amber", "must understand": "red"}


def station_criticality() -> dict[str, str]:
    """Station id to grey, amber or red; stations without a known rating are left out."""
    return _station_criticality(root())


@lru_cache(maxsize=None)
def _station_criticality(folder: Path) -> dict[str, str]:
    rated: dict[str, str] = {}

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            colour = CRITICALITY.get(node.get("inYourHead", ""))
            if isinstance(node.get("id"), str) and "needs" in node and colour:
                rated[node["id"]] = colour
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(_read_json(folder / "stations.json"))
    return rated


def v1_stations() -> list[str]:
    """The V1 stations in reading order: the story's destination, then each lesson."""
    return [item["station"] for item in scope()["readingOrder"]]


def map_stations() -> list[str]:
    """The stations the map shows: V1's, then those shown on the map but not taught in V1."""
    taught = v1_stations()
    return taught + [sid for sid in scope().get("shownOnMap", {}) if sid not in taught]


def story_markdown(story_id: str) -> str | None:
    """The story text for an id listed in scope.json as a story, or for the station that story
    belongs to (a model may pass the station, d_legal, for the story, legal-letter); else None."""
    folder = root()
    for item in _scope(folder)["readingOrder"]:
        if item["kind"] == STORY_KIND and story_id in (item["id"], item["station"]):
            return (folder / item["file"]).read_text(encoding="utf-8")
    return None


FIGURE_FIELDS = ("id", "title", "alt", "caption", "controls")


@lru_cache(maxsize=None)
def _figures(folder: Path) -> dict[str, dict[str, Any]]:
    return {entry["id"]: entry for entry in _read_json(folder / "figures.json")["figures"]}


def figure(figure_id: str) -> dict[str, Any] | None:
    """A figure listed in figures.json, as the coach draws it: its words, choices and SVG; else None."""
    folder = root()
    entry = _figures(folder).get(figure_id)
    if entry is None:
        return None
    svg = (folder / "figures" / f"{entry['id']}.svg").read_text(encoding="utf-8")
    return {**{key: entry[key] for key in FIGURE_FIELDS}, "svg": svg}
