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


# ------------------------------------------------------------------ story 33: no line on top of another

import re  # noqa: E402

SEP = 6  # the widest line is 6 map units: closer than this, two parallel lines touch
SHARED = 1  # map units two runs may share before it counts as overlap (corners meet at a point)
PITCH = 9  # layout-map.mjs LANE_PITCH


def straight_runs(layout: dict) -> list[tuple[str, float, float, float, str, str]]:
    """Every straight stretch of every link: (h or v, its fixed coordinate, from, to, source, target).
    Arcs are corners, joining two runs."""
    runs = []
    for edge in layout["edges"]:
        tokens = re.findall(r"[MLA]|-?\d+(?:\.\d+)?", edge["d"])
        points, i, cmd = [], 0, None
        while i < len(tokens):
            if tokens[i] in "MLA":
                cmd, i = tokens[i], i + 1
            elif cmd in "ML":
                points.append((float(tokens[i]), float(tokens[i + 1])))
                i += 2
            else:
                points.append((float(tokens[i + 5]), float(tokens[i + 6])))
                i += 7
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            if x1 == x2 and y1 != y2:
                runs.append(("v", x1, min(y1, y2), max(y1, y2), edge["from"], edge["to"]))
            elif y1 == y2 and x1 != x2:
                runs.append(("h", y1, min(x1, x2), max(x1, x2), edge["from"], edge["to"]))
    return runs


def overlaps(layout: dict) -> list[tuple]:
    """Pairs of parallel runs closer than SEP that share more than SHARED of their length, from
    links with a different source and a different target (links leaving one station may fan out
    from a shared stretch, and links arriving at one station may converge on one)."""
    found = []
    for orient in "hv":
        runs = sorted((r for r in straight_runs(layout) if r[0] == orient), key=lambda r: r[1])
        for i, a in enumerate(runs):
            for b in runs[i + 1:]:
                if b[1] - a[1] >= SEP:
                    break
                if a[4] == b[4] or a[5] == b[5]:
                    continue
                if min(a[3], b[3]) - max(a[2], b[2]) > SHARED:
                    found.append((a, b))
    return found


def generate(folder: Path, stations: list[dict], areas: list[str]) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    doc = {"areas": [{"id": a, "name": a} for a in areas], "stations": stations}
    (folder / "stations.json").write_text(json.dumps(doc), encoding="utf-8")
    subprocess.run(["node", str(SCRIPT), str(folder)], check=True, capture_output=True, timeout=120)
    return json.loads((folder / LAYOUT).read_text(encoding="utf-8"))


def station(sid: str, area: str, needs=(), better=(), dest=False) -> dict:
    return {"id": sid, "name": f"Station {sid}", "area": area, "needs": list(needs), "betterWith": list(better), "destination": dest}


def dense_graph() -> tuple[list[dict], list[str]]:
    """A made-up map as crowded as the real one: 6 areas, 60 stations with up to 4 needs and a
    better-with each, 10 destinations needing 6 stations each. Seeded, so always the same."""
    areas = [f"area{i}" for i in range(6)]
    seed = 7

    def pick(n: int) -> int:
        nonlocal seed
        seed = (seed * 1103515245 + 12345) % 2**31
        return seed % n

    stations: list[dict] = []
    for i in range(60):
        earlier = [s["id"] for s in stations]
        needs = sorted({earlier[pick(len(earlier))] for _ in range(min(4, len(earlier)))}) if earlier else []
        better = [earlier[pick(len(earlier))]] if len(earlier) > 4 else []
        stations.append(station(f"s{i:02d}", areas[pick(len(areas))], needs, [b for b in better if b not in needs]))
    ordinary = [s["id"] for s in stations]
    for i in range(10):
        needs = sorted({ordinary[pick(len(ordinary))] for _ in range(6)})
        stations.append(station(f"d{i:02d}", areas[i % len(areas)], needs, dest=True))
    return stations, areas


# TC-23
def test_tc23_no_two_unrelated_links_run_on_top_of_each_other_on_the_fixture():
    assert overlaps(fixture_layout()) == []


# TC-24
@NEEDS_NODE
def test_tc24_no_two_unrelated_links_run_on_top_of_each_other_when_crowded(tmp_path):
    stations, areas = dense_graph()
    layout = generate(tmp_path / "dense", stations, areas)
    assert len(layout["edges"]) > 250
    assert overlaps(layout) == []


# TC-25
@NEEDS_NODE
def test_tc25_more_lines_through_a_gap_make_it_wider_at_the_same_spacing(tmp_path):
    def pairs(n: int) -> dict:
        # n starting stations, each needed by its own station in the next column on another
        # area's rows: n lines from n different stations through one channel.
        stations = [station(f"r{i:02d}", "a") for i in range(n)]
        stations += [station(f"k{i:02d}", "b", [f"r{i:02d}"]) for i in range(n)]
        return generate(tmp_path / f"pairs{n}", stations, ["a", "b"])

    few, many = pairs(1), pairs(30)
    gap = lambda layout: layout["stations"]["k00"]["x"] - layout["stations"]["r00"]["x"]  # noqa: E731
    assert gap(many) > gap(few)
    # The channel's lanes, not the targets' own column where each link drops into its station.
    lanes = sorted({r[1] for r in straight_runs(many) if r[0] == "v" and r[1] < many["stations"]["k00"]["x"]})
    assert len(lanes) == 30
    assert all(round(b - a, 1) == PITCH for a, b in zip(lanes, lanes[1:]))
    assert overlaps(many) == []


# TC-25c
@NEEDS_NODE
def test_tc25c_lines_leaving_one_station_share_its_lane_and_branch_off(tmp_path):
    stations = [station("root", "a")] + [station(f"k{i:02d}", "b", ["root"]) for i in range(10)]
    layout = generate(tmp_path / "fan", stations, ["a", "b"])
    lanes = {r[1] for r in straight_runs(layout) if r[0] == "v" and r[1] < layout["stations"]["k00"]["x"]}
    assert len(lanes) == 1
    assert overlaps(layout) == []


# TC-25b
@NEEDS_NODE
def test_tc25b_a_map_of_one_station_has_no_links(tmp_path):
    layout = generate(tmp_path / "one", [station("only", "a")], ["a"])
    assert list(layout["stations"]) == ["only"] and layout["edges"] == []
