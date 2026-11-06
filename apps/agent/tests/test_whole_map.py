"""The whole map and the learner's goal (Ceetrix story 29, TC-04 to TC-14). COACH_HOME is a temp
folder per test and the curriculum is the tests' fixture copy (conftest); expectations are derived
from that data's shape, not written out as content."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.coach import curriculum, middleware, progress, restart, whole_map

WHEN = datetime(2026, 11, 6, 14, 0, tzinfo=timezone.utc)


def stations() -> dict:
    return whole_map.stations_by_id()


def a_destination(min_route: int = 3) -> str:
    """A destination whose route, from nothing done, has a few stations."""
    empty = progress.empty_record()
    return next(sid for sid, s in stations().items() if s.get("destination") and len(whole_map.route(sid, empty, stations())) >= min_route)


def with_status(**statuses: str) -> dict:
    record = progress.empty_record()
    for sid, status in statuses.items():
        progress.apply(record, "station", sid, status, "2026-11-06T00:00:00+00:00")
    return record


# TC-04
def test_tc04_current_station_is_the_last_step_shown():
    record = progress.empty_record()
    record["events"] = [{"event": "step_shown", "station": curriculum.v1_stations()[1]}, {"event": "step_shown", "station": curriculum.v1_stations()[2]}]
    assert whole_map.current_station(record) == curriculum.v1_stations()[2]


def test_tc04b_else_the_first_reading_order_station_not_covered():
    order = curriculum.v1_stations()
    assert whole_map.current_station(progress.empty_record()) == order[0]
    assert whole_map.current_station(with_status(**{order[0]: "verified"})) == order[1]
    assert whole_map.current_station(with_status(**{order[0]: "read"})) == order[0]  # read is not covered


def test_tc04c_with_everything_covered_it_is_the_last_one():
    order = curriculum.v1_stations()
    assert whole_map.current_station(with_status(**{sid: "reported" for sid in order})) == order[-1]


# TC-05 / TC-06
def test_tc05_route_from_nothing_done_ends_at_the_goal_and_respects_needs():
    goal = a_destination()
    path = whole_map.route(goal, progress.empty_record(), stations())
    assert path[-1] == goal
    assert len(path) == len(set(path))  # TC-06: a shared prerequisite is listed once
    position = {sid: i for i, sid in enumerate(path)}
    for sid in path:
        for need in stations()[sid].get("needs") or []:
            if need in position:
                assert position[need] < position[sid], f"{need} must come before {sid}"


def test_tc05b_covered_stations_leave_the_route():
    goal = a_destination()
    full = whole_map.route(goal, progress.empty_record(), stations())
    done = full[0]
    for status in sorted(whole_map.COVERED):
        assert done not in whole_map.route(goal, with_status(**{done: status}), stations())
    assert done in whole_map.route(goal, with_status(**{done: "rehearsed"}), stations())


def test_tc05c_a_reached_goal_has_an_empty_route():
    goal = a_destination()
    full = whole_map.route(goal, progress.empty_record(), stations())
    assert whole_map.route(goal, with_status(**{sid: "verified" for sid in full}), stations()) == []


def test_tc06_a_prerequisite_needed_twice_is_listed_once():
    st = stations()
    shared = None
    for goal, s in st.items():
        if not s.get("destination"):
            continue
        path = whole_map.route(goal, progress.empty_record(), st)
        counts: dict[str, int] = {}
        for sid in path:
            for need in st[sid].get("needs") or []:
                counts[need] = counts.get(need, 0) + 1
        shared = next((n for n, c in counts.items() if c > 1), None)
        if shared:
            assert path.count(shared) == 1
            break
    assert shared, "the fixture should have a route with a shared prerequisite"


# TC-07
def test_tc07_a_goal_that_is_not_a_destination_is_ignored():
    record = progress.empty_record()
    non_destination = next(sid for sid, s in stations().items() if not s.get("destination"))
    record["goal"] = {"destination": non_destination}
    assert whole_map.goal_of(record, stations()) is None
    record["goal"] = {"destination": "no-such-station"}
    assert whole_map.goal_of(record, stations()) is None


# TC-08 to TC-14 through the real routes


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(whole_map.router)
    app.include_router(restart.router)
    return TestClient(app)


def test_tc08_the_map_has_every_station_placed_with_a_status(client):
    response = client.get("/curriculum/map")
    assert response.status_code == 200
    data = response.json()
    ids = {s["id"] for s in data["stations"]}
    assert ids == set(stations())
    assert ids == set(data["layout"]["stations"])
    assert all(s["status"] == "unseen" for s in data["stations"])
    assert data["current"] == curriculum.v1_stations()[0]
    assert (data["goal"], data["route"], data["reached"]) == (None, [], False)


def test_tc08b_a_curriculum_without_a_layout_cannot_load_the_map(client, monkeypatch, tmp_path):
    import shutil

    copy = tmp_path / "curriculum"
    shutil.copytree(curriculum.root(), copy)
    (copy / whole_map.LAYOUT_FILE).unlink()
    monkeypatch.setenv("COACH_CURRICULUM", str(copy))
    response = client.get("/curriculum/map")
    assert response.status_code == 500
    assert response.json() == {"error": whole_map.NOT_LOADED}


def test_tc09_the_coach_is_told_the_goal_only_when_there_is_one(client):
    assert "The learner's goal" not in middleware.coach_context({})
    goal = a_destination()
    client.post("/coach/goal", json={"destination": goal})
    context = middleware.coach_context({})
    assert f"The learner's goal: {goal}." in context
    assert whole_map.route(goal, progress.empty_record(), stations())[0] in context


def test_tc11_set_change_and_clear_the_goal(client):
    first, second = [sid for sid, s in stations().items() if s.get("destination")][:2]
    data = client.post("/coach/goal", json={"destination": first}).json()
    assert data["goal"] == first and data["route"][-1] == first
    assert progress.load(progress.home())["goal"]["destination"] == first
    assert client.post("/coach/goal", json={"destination": second}).json()["goal"] == second
    data = client.post("/coach/goal", json={"destination": None}).json()
    assert (data["goal"], data["route"]) == (None, [])
    assert "goal" not in progress.load(progress.home())


def test_tc11b_the_stub_keeps_its_own_goal(client):
    goal = a_destination()
    client.post("/coach/goal?record=stub", json={"destination": goal})
    assert client.get("/curriculum/map?record=stub").json()["goal"] == goal
    assert client.get("/curriculum/map").json()["goal"] is None


def test_tc12_a_goal_never_changes_a_status_or_an_event(client):
    order = curriculum.v1_stations()
    record = with_status(**{order[0]: "verified", order[1]: "read"})
    record["events"] = [{"event": "step_shown", "station": order[1], "step": f"{order[1]}.1", "call": "c1"}]
    progress.save(progress.home(), record)
    before = {k: v for k, v in json.loads((progress.home() / "progress.json").read_text()).items() if k != "goal"}
    for destination in [a_destination(), None]:
        client.post("/coach/goal", json={"destination": destination})
        after = {k: v for k, v in json.loads((progress.home() / "progress.json").read_text()).items() if k != "goal"}
        assert after == before


@pytest.mark.parametrize("headers, body, status, error", [
    ({"Origin": "http://localhost:3000"}, {"destination": None}, 403, whole_map.NOT_OURS),
    ({}, {"destination": "no-such-station"}, 422, whole_map.NOT_A_DESTINATION),
    ({}, {"destination": 7}, 422, whole_map.NOT_A_DESTINATION),
    ({}, ["not", "an", "object"], 422, whole_map.NOT_A_DESTINATION),
])
def test_tc13_refused_requests_change_nothing(client, headers, body, status, error):
    response = client.post("/coach/goal", json=body, headers=headers)
    assert response.status_code == status
    assert response.json() == {"error": error}
    assert not (progress.home() / "progress.json").exists()


def test_tc13b_a_non_destination_station_is_refused(client):
    non_destination = next(sid for sid, s in stations().items() if not s.get("destination"))
    assert client.post("/coach/goal", json={"destination": non_destination}).status_code == 422


def test_tc13c_a_write_that_fails_says_so(client):
    blocker = progress.home() / "progress.json"
    blocker.mkdir(parents=True)  # a folder where the record goes: the rename onto it fails
    response = client.post("/coach/goal", json={"destination": a_destination()})
    assert response.status_code == 500
    assert response.json() == {"error": whole_map.NOT_SAVED}


def test_tc14_restart_moves_the_goal_aside_with_progress(client):
    client.post("/coach/goal", json={"destination": a_destination()})
    assert client.post("/coach/restart").status_code == 200
    assert client.get("/curriculum/map").json()["goal"] is None


# Story 30, TC-15
def test_s30_tc15_the_map_carries_the_tube_layout(client):
    layout = client.get("/curriculum/map").json()["layout"]
    assert layout["version"] == 2
    assert set(layout["stations"]) == set(stations())
    assert {e["kind"] for e in layout["edges"]} == {"track", "link", "better"}
