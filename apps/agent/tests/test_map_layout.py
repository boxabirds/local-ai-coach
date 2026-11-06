"""The whole map's generated layout (Ceetrix story 29, TC-01 to TC-03). The validator runs on temp
copies of the tests' fixture curriculum, never the real one; the generator is the committed script."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.test_curriculum import CURRICULUM, REPO, edit, errors, run

SCRIPT = REPO / "apps" / "app" / "scripts" / "layout-map.mjs"
LAYOUT = "map-layout.json"


@pytest.fixture
def root(tmp_path: Path) -> Path:
    dest = tmp_path / "curriculum"
    shutil.copytree(CURRICULUM, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copy2(REPO / "curriculum" / "figures" / "make_figures.py", dest / "figures" / "make_figures.py")
    return dest


def first_edge(layout: dict) -> dict:
    return layout["edges"][0]


# TC-01
def test_tc01_the_committed_fixture_layout_passes(root):
    assert (root / LAYOUT).is_file()
    assert "MAP_LAYOUT" not in errors(run(root))


def test_tc01b_no_layout_is_allowed(root):
    (root / LAYOUT).unlink()
    assert "MAP_LAYOUT" not in errors(run(root))


# TC-02: each way a layout can be wrong
def drop_station(layout: dict) -> None:
    layout["stations"].pop(sorted(layout["stations"])[0])


def add_station(layout: dict) -> None:
    layout["stations"]["made-up-station"] = {"x": 0, "y": 0, "w": 10, "h": 10}


def drop_link(layout: dict) -> None:
    layout["edges"].pop(0)


def add_link(layout: dict) -> None:
    edge = first_edge(layout)
    layout["edges"].append({"from": edge["to"], "to": edge["from"], "points": [[0, 0], [1, 1]]})


def bad_point(layout: dict) -> None:
    first_edge(layout)["points"][0] = [0, "far away"]


def bad_box(layout: dict) -> None:
    box = layout["stations"][sorted(layout["stations"])[0]]
    box["x"] = None


@pytest.mark.parametrize("breakage", [drop_station, add_station, drop_link, add_link, bad_point, bad_box], ids=lambda f: f.__name__)
def test_tc02_a_broken_layout_is_refused(root, breakage):
    edit(root, LAYOUT, breakage)
    assert "MAP_LAYOUT" in errors(run(root))


def test_tc02b_a_layout_that_is_not_a_layout_is_refused(root):
    (root / LAYOUT).write_text('{"stations": []}', encoding="utf-8")
    assert "MAP_LAYOUT" in errors(run(root))


# TC-03
@pytest.mark.skipif(shutil.which("node") is None, reason="needs node to run the generator")
def test_tc03_the_generator_is_deterministic_and_matches_the_committed_layout(root):
    committed = (root / LAYOUT).read_bytes()
    digests = []
    for _ in range(2):
        subprocess.run(["node", str(SCRIPT), str(root)], check=True, capture_output=True, timeout=120)
        digests.append(hashlib.sha256((root / LAYOUT).read_bytes()).hexdigest())
    assert digests[0] == digests[1]
    assert (root / LAYOUT).read_bytes() == committed  # the committed file is what the generator writes


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node to run the generator")
def test_tc03b_an_unknown_need_stops_the_generator_and_writes_nothing(root):
    before = (root / LAYOUT).read_bytes()
    edit(root, "stations.json", lambda doc: doc["stations"][0].setdefault("needs", []).append("no-such-station"))
    result = subprocess.run(["node", str(SCRIPT), str(root)], capture_output=True, text=True, timeout=120)
    assert result.returncode != 0
    assert "no-such-station" in result.stderr
    assert (root / LAYOUT).read_bytes() == before
