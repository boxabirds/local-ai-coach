"""The learner's progress file (Ceetrix story 10, TC-01 to TC-05)."""

from __future__ import annotations

import itertools
import json

import pytest

from src.coach import progress, stub

AT = "2026-11-05T12:00:00+00:00"
ORDER = progress.STATUS_ORDER


@pytest.mark.parametrize("current, requested", list(itertools.product(progress.STATUSES, progress.STATUSES)))
def test_tc01_every_transition(current, requested):
    if requested == progress.SKIPPED:
        expected = current not in (progress.VERIFIED, progress.SKIPPED)
    elif current == progress.SKIPPED:
        expected = requested != progress.UNSEEN
    else:
        expected = ORDER.index(requested) > ORDER.index(current)
    assert progress.allowed(current, requested) is expected


def test_tc01_apply_changes_only_when_allowed():
    record = progress.empty_record()
    assert progress.apply(record, "station", "machine", "verified", AT, [{"probe": "memory"}])
    assert record["stations"]["machine"] == {"status": "verified", "at": AT, "evidence": [{"probe": "memory"}]}
    assert not progress.apply(record, "station", "machine", "reported", AT)
    assert not progress.apply(record, "station", "machine", "skipped", AT)
    assert not progress.apply(record, "station", "machine", "nonsense", AT)


def test_tc02_round_trip_and_the_stub_keeps_its_own_file(tmp_path):
    record = progress.empty_record()
    progress.apply(record, "station", "machine", "reported", AT)
    progress.save(tmp_path, record)
    assert progress.load(tmp_path)["stations"]["machine"]["status"] == "reported"
    stub_record = stub.empty_record()
    stub.apply(stub_record, "station", "d_legal", "read", AT)
    stub.save(tmp_path, stub_record)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["progress.json", "progress.stub.json"]
    assert "d_legal" not in progress.load(tmp_path)["stations"]
    assert "machine" not in stub.load(tmp_path)["stations"]


def test_tc03_a_failed_write_keeps_the_old_file(tmp_path, monkeypatch):
    record = progress.empty_record()
    progress.save(tmp_path, record)
    before = (tmp_path / "progress.json").read_bytes()

    def boom(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(progress.os, "replace", boom)
    progress.apply(record, "station", "machine", "reported", AT)
    with pytest.raises(OSError):
        progress.save(tmp_path, record)
    assert (tmp_path / "progress.json").read_bytes() == before
    assert [p.name for p in tmp_path.iterdir()] == ["progress.json"]


@pytest.mark.parametrize("text", ["", "{bad", "[]", '{"stations": []}'])
def test_tc04_unreadable_or_empty_is_an_empty_record_all_unseen(tmp_path, text):
    (tmp_path / "progress.json").write_text(text)
    record = progress.load(tmp_path)
    snap = progress.snapshot(record)
    assert [s["id"] for s in snap] == ["d_legal", "machine", "localchat", "prove"]
    assert {s["status"] for s in snap} == {"unseen"}
    assert {s["id"]: s.get("criticality") for s in snap} == {"d_legal": "red", "machine": "amber", "localchat": "grey", "prove": "red"}


def test_tc05_sessions_are_appended(tmp_path):
    record = progress.load(tmp_path)
    progress.add_session(record, "Found the number.", AT)
    progress.add_session(record, "Fits test.", AT)
    progress.save(tmp_path, record)
    assert json.loads((tmp_path / "progress.json").read_text())["sessions"] == [
        {"at": AT, "summary": "Found the number."}, {"at": AT, "summary": "Fits test."}]
