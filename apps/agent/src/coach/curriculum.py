"""Read-only access to the curriculum at the repo root (docs/design.md, Curriculum on disk).

Nothing here writes. Paths come from `scope.json`, never from a request.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

CURRICULUM = Path(__file__).resolve().parents[4] / "curriculum"
STORY_KIND = "story"


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def scope() -> dict[str, Any]:
    return _read_json(CURRICULUM / "scope.json")


@lru_cache(maxsize=None)
def lesson(station_id: str) -> dict[str, Any]:
    """The lesson JSON for a station listed in the reading order."""
    for item in scope()["readingOrder"]:
        if item["kind"] == "lesson" and item["station"] == station_id:
            return _read_json(CURRICULUM / item["file"])
    raise KeyError(station_id)


@lru_cache(maxsize=1)
def station_names() -> dict[str, str]:
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

    walk(_read_json(CURRICULUM / "stations.json"))
    return names


# The book's three criticality colours, from each station's "inYourHead" (Ceetrix story 5).
CRITICALITY = {"press go": "grey", "know what it does": "amber", "must understand": "red"}


@lru_cache(maxsize=1)
def station_criticality() -> dict[str, str]:
    """Station id to grey, amber or red; stations without a known rating are left out."""
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

    walk(_read_json(CURRICULUM / "stations.json"))
    return rated


def v1_stations() -> list[str]:
    """The V1 stations in reading order: the story's destination, then each lesson."""
    return [item["station"] for item in scope()["readingOrder"]]


def story_markdown(story_id: str) -> str | None:
    """The story text for an id listed in scope.json as a story, else None."""
    for item in scope()["readingOrder"]:
        if item["kind"] == STORY_KIND and item["id"] == story_id:
            return (CURRICULUM / item["file"]).read_text(encoding="utf-8")
    return None
