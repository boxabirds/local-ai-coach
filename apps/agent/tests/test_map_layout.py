"""The whole map's tube layout (Ceetrix stories 29 and 30, TC-01 to TC-08). The layout rules are
checked on the generated fixture layout (which TC-06 proves is what the generator writes); the
validator runs on temp copies of the fixture curriculum, never the real one."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.test_curriculum import CURRICULUM, REPO, edit, errors, run

SCRIPT = REPO / "apps" / "app" / "scripts" / "layout-map.mjs"
LAYOUT = "map-layout.json"
LABEL_CHARS = 15  # layout-map.mjs
NEEDS_NODE = pytest.mark.skipif(shutil.which("node") is None, reason="needs node to run the generator")


@pytest.fixture
def root(tmp_path: Path) -> Path:
    dest = tmp_path / "curriculum"
    shutil.copytree(CURRICULUM, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copy2(REPO / "curriculum" / "figures" / "make_figures.py", dest / "figures" / "make_figures.py")
    return dest


def fixture_layout() -> dict:
    return json.loads((CURRICULUM / LAYOUT).read_text(encoding="utf-8"))


def fixture_stations() -> dict[str, dict]:
    return {s["id"]: s for s in json.loads((CURRICULUM / "stations.json").read_text(encoding="utf-8"))["stations"]}


# TC-01
def test_tc01_every_station_sits_right_of_everything_it_needs():
    spots, stations = fixture_layout()["stations"], fixture_stations()
    for sid, st in stations.items():
        for need in st.get("needs") or []:
            assert spots[need]["x"] < spots[sid]["x"], f"{sid} must be right of {need}"


# TC-02
def test_tc02_tracks_continue_on_the_parent_row_and_forks_go_below():
    spots, stations = fixture_layout()["stations"], fixture_stations()
    continued = forked = 0
    for area in {s["area"] for s in stations.values()}:
        children: dict[str, list[str]] = {}
        for sid, st in stations.items():
            if st["area"] != area or st.get("destination"):
                continue
            parent = next((n for n in st.get("needs") or [] if stations[n]["area"] == area), None)
            if parent:
                children.setdefault(parent, []).append(sid)
        for parent, kids in children.items():
            rows = [spots[k]["y"] for k in kids]
            if spots[parent]["y"] in rows:
                continued += 1
            forked += sum(1 for y in rows if y > spots[parent]["y"])
    assert continued and forked, "the fixture has both continued tracks and forks"


# TC-03
def test_tc03_destinations_stand_in_one_column_right_of_everything():
    spots = fixture_layout()["stations"]
    dest_x = {s["x"] for s in spots.values() if s["dest"]}
    assert len(dest_x) == 1
    assert min(dest_x) > max(s["x"] for s in spots.values() if not s["dest"])


# TC-04
def test_tc04_every_link_is_drawn_once_with_the_right_kind():
    layout, stations = fixture_layout(), fixture_stations()
    edges = [(e["from"], e["to"], e["kind"]) for e in layout["edges"]]
    assert len(edges) == len(set(edges))
    for sid, st in stations.items():
        for need in st.get("needs") or []:
            kind = "track" if stations[need]["area"] == st["area"] and not st.get("destination") else "link"
            assert (need, sid, kind) in edges
        for other in st.get("betterWith") or []:
            assert (other, sid, "better") in edges
    assert all(e["area"] == stations[e["to"]]["area"] and e["d"].startswith("M") for e in layout["edges"])


# TC-05
def test_tc05_long_names_go_on_two_lines_destinations_on_one():
    spots, stations = fixture_layout()["stations"], fixture_stations()
    for sid, st in stations.items():
        label = spots[sid]["label"]
        assert " ".join(label) == st["name"]
        assert len(label) == (1 if st.get("destination") or len(st["name"]) <= LABEL_CHARS else 2), sid


# TC-06
@NEEDS_NODE
def test_tc06_the_generator_is_deterministic_and_matches_the_committed_layout(root):
    committed = (root / LAYOUT).read_bytes()
    digests = []
    for _ in range(2):
        subprocess.run(["node", str(SCRIPT), str(root)], check=True, capture_output=True, timeout=120)
        digests.append(hashlib.sha256((root / LAYOUT).read_bytes()).hexdigest())
    assert digests[0] == digests[1]
    assert (root / LAYOUT).read_bytes() == committed


@NEEDS_NODE
@pytest.mark.parametrize("field", ["needs", "betterWith"])
def test_tc06b_an_unknown_station_stops_the_generator_and_writes_nothing(root, field):
    before = (root / LAYOUT).read_bytes()
    edit(root, "stations.json", lambda doc: doc["stations"][0].setdefault(field, []).append("no-such-station"))
    result = subprocess.run(["node", str(SCRIPT), str(root)], capture_output=True, text=True, timeout=120)
    assert result.returncode != 0
    assert "no-such-station" in result.stderr
    assert (root / LAYOUT).read_bytes() == before


# TC-07
def test_tc07_the_committed_fixture_layout_passes(root):
    assert "MAP_LAYOUT" not in errors(run(root))


def test_tc07b_no_layout_is_allowed(root):
    (root / LAYOUT).unlink()
    assert "MAP_LAYOUT" not in errors(run(root))


# TC-08: each way a layout can be wrong
def first(layout: dict, kind: str) -> dict:
    return next(e for e in layout["edges"] if e["kind"] == kind)


def drop_station(layout):
    layout["stations"].pop(sorted(layout["stations"])[0])


def add_station(layout):
    layout["stations"]["made-up-station"] = {"x": 0, "y": 0, "dest": False, "label": ["x"]}


def drop_need(layout):
    layout["edges"].remove(first(layout, "track"))


def drop_better(layout):
    layout["edges"].remove(first(layout, "better"))


def wrong_kind(layout):
    first(layout, "track")["kind"] = "tunnel"


def need_as_better(layout):
    first(layout, "link")["kind"] = "better"


def empty_path(layout):
    first(layout, "link")["d"] = ""


def bad_x(layout):
    layout["stations"][sorted(layout["stations"])[0]]["x"] = "left"


def old_version(layout):
    layout["version"] = 1


def twice(layout):
    layout["edges"].append(dict(first(layout, "track")))


@pytest.mark.parametrize("breakage", [drop_station, add_station, drop_need, drop_better, wrong_kind, need_as_better, empty_path, bad_x, old_version, twice], ids=lambda f: f.__name__)
def test_tc08_a_broken_layout_is_refused(root, breakage):
    edit(root, LAYOUT, breakage)
    assert "MAP_LAYOUT" in errors(run(root))
