"""The consent file (Ceetrix story 9, TC-15 to TC-17)."""

from __future__ import annotations

import json

import pytest

from src.coach import consent

AT = "2026-11-05T12:00:00+00:00"


def test_tc15_save_then_load(tmp_path):
    saved = consent.save(tmp_path, probes=True, history=True, at=AT)
    assert saved == {"probes": True, "history": True, "doIt": False, "granted_at": AT}
    assert consent.load(tmp_path) == saved
    assert [p.name for p in tmp_path.iterdir()] == ["consent.json"]  # no temp file left behind


def test_tc15_history_only_counts_with_looking_allowed(tmp_path):
    assert consent.save(tmp_path, probes=False, history=True, at=AT)["history"] is False
    assert consent.allows(consent.load(tmp_path), "probes") is False


@pytest.mark.parametrize("text", ["", "{not json", "[]", '{"probes": "yes", "history": false, "doIt": false}', '{"probes": true}'])
def test_tc16_unreadable_or_malformed_means_not_asked(tmp_path, text):
    (tmp_path / "consent.json").write_text(text)
    assert consent.load(tmp_path) is None


def test_tc16_missing_means_not_asked(tmp_path):
    assert consent.load(tmp_path) is None
    assert consent.allows(None, "probes") is False


def test_tc17_a_failed_write_raises_and_keeps_the_old_file(tmp_path, monkeypatch):
    consent.save(tmp_path, probes=False, history=False, at=AT)
    before = (tmp_path / "consent.json").read_bytes()

    def boom(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(consent.os, "replace", boom)
    with pytest.raises(OSError):
        consent.save(tmp_path, probes=True, history=True, at=AT)
    assert (tmp_path / "consent.json").read_bytes() == before
    assert [p.name for p in tmp_path.iterdir()] == ["consent.json"]
    assert json.loads(before)["probes"] is False
