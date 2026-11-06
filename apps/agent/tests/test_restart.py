"""Restart coach (Ceetrix story 23, TC-01 to TC-07): the learner's files move whole into a dated
backup; keys, the server choice and logs stay. COACH_HOME is a real temp folder per test
(conftest). The file contents are made-up records, not curriculum."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.coach import progress, restart

WHEN = datetime(2026, 11, 6, 4, 30, 0, tzinfo=timezone.utc)
STAMP = "20261106T043000Z"
RECORDS = {
    "progress.json": {"schema": 1, "stations": {"machine": {"status": "verified"}}, "events": [{"event": "step_shown"}]},
    "progress.stub.json": {"schema": 1, "stations": {}, "stub": True},
    "consent.json": {"probes": True, "history": False, "at": "2026-11-05T11:00:00+00:00"},
}


def write_learner_files() -> dict[str, bytes]:
    home = progress.home()
    home.mkdir(parents=True, exist_ok=True)
    out = {}
    for name, record in RECORDS.items():
        (home / name).write_text(json.dumps(record), encoding="utf-8")
        out[name] = (home / name).read_bytes()
    return out


def test_tc01_every_learner_file_moves_whole_into_a_dated_backup():
    before = write_learner_files()
    result = restart.restart(WHEN)
    backup = progress.home() / "old" / STAMP
    assert result == {"archived": f"old/{STAMP}", "moved": sorted(RECORDS)}
    for name, data in before.items():
        assert (backup / name).read_bytes() == data
        assert not (progress.home() / name).exists()


def test_tc02_keys_server_and_logs_stay():
    write_learner_files()
    home = progress.home()
    (home / "provider.json").write_text('{"base_url": "https://models.example.test/v1", "model": "m"}')
    (home / "logs").mkdir()
    (home / "logs" / "coach-2026-11-06.jsonl").write_text("{}\n")
    restart.restart(WHEN)
    assert (home / "provider.json").exists()
    assert (home / "logs" / "coach-2026-11-06.jsonl").exists()


def test_tc03_nothing_to_move_makes_no_folder():
    assert restart.restart(WHEN) == {"archived": None, "moved": []}
    assert not (progress.home() / "old").exists()


def test_tc04_two_restarts_with_the_same_stamp_keep_separate_backups():
    write_learner_files()
    first = restart.restart(WHEN)
    write_learner_files()
    second = restart.restart(WHEN)
    assert first["archived"] == f"old/{STAMP}"
    assert second["archived"] == f"old/{STAMP}-2"
    for folder in (STAMP, f"{STAMP}-2"):
        assert sorted(p.name for p in (progress.home() / "old" / folder).iterdir()) == sorted(RECORDS)


def test_tc05_after_a_restart_the_coach_sees_a_new_learner():
    write_learner_files()
    restart.restart(WHEN)
    record = progress.load(progress.home())
    assert not record.get("stations") and not record.get("steps") and not record.get("events")


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(restart.router)
    return TestClient(app)


@pytest.mark.parametrize("header", [{"Origin": "https://evil.example"}, {"Sec-Fetch-Site": "cross-site"}])
def test_tc06_a_browser_request_is_refused_and_moves_nothing(client, header):
    write_learner_files()
    assert client.post("/coach/restart", headers=header).status_code == 403
    for name in RECORDS:
        assert (progress.home() / name).exists()


def test_tc06_the_route_restarts(client):
    write_learner_files()
    response = client.post("/coach/restart")
    assert response.status_code == 200
    assert response.json()["moved"] == sorted(RECORDS)


def test_tc07_a_failed_move_says_so_and_loses_nothing(client, monkeypatch):
    write_learner_files()
    real = os.replace
    calls = {"n": 0}

    def flaky(src, dst):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OSError("disk full")
        real(src, dst)

    monkeypatch.setattr(restart.os, "replace", flaky)
    response = client.post("/coach/restart")
    assert response.status_code == 500 and response.json()["error"] == restart.FAILED
    home = progress.home()
    for name in RECORDS:  # every file is still somewhere: in place, or in the backup
        assert (home / name).exists() or any((folder / name).exists() for folder in (home / "old").iterdir())
