"""Which curriculum the coach reads (Ceetrix story 13, TC-01 to TC-08, TC-12).

The coach reads curriculum/ unless COACH_CURRICULUM names another folder; code tests
point it at their own frozen copy, fixtures/curriculum, so editing the book never
changes a test result.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from src.coach import curriculum, stub
from tests.conftest import FIXTURE_CURRICULUM

REPO = Path(__file__).resolve().parents[3]


def copy_of_fixture(dest: Path) -> Path:
    shutil.copytree(FIXTURE_CURRICULUM, dest)
    return dest


def first_step_text(folder: Path) -> str:
    return json.loads((folder / "lessons" / "machine.json").read_text(encoding="utf-8"))["steps"][0]["text"]


def test_tc01_unset_means_the_real_curriculum(monkeypatch):
    monkeypatch.delenv(curriculum.ENV, raising=False)
    assert curriculum.root() == REPO / "curriculum"


def test_tc02_an_absolute_folder_is_used(monkeypatch, tmp_path):
    folder = copy_of_fixture(tmp_path / "c")
    monkeypatch.setenv(curriculum.ENV, str(folder))
    assert curriculum.root() == folder


def test_tc03_a_relative_path_resolves_against_the_repo(monkeypatch):
    monkeypatch.setenv(curriculum.ENV, "fixtures/curriculum")
    assert curriculum.root() == REPO / "fixtures" / "curriculum"


def test_tc04_a_folder_without_scope_fails_and_never_falls_back(monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv(curriculum.ENV, str(empty))
    with pytest.raises(FileNotFoundError, match=str(empty)):
        curriculum.root()
    with pytest.raises(FileNotFoundError):
        curriculum.lesson("machine")


def test_tc05_lesson_follows_the_folder(monkeypatch, tmp_path):
    a = copy_of_fixture(tmp_path / "a")
    b = copy_of_fixture(tmp_path / "b")
    doc = json.loads((b / "lessons" / "machine.json").read_text(encoding="utf-8"))
    doc["steps"][0]["text"] = "A different first step."
    (b / "lessons" / "machine.json").write_text(json.dumps(doc), encoding="utf-8")
    monkeypatch.setenv(curriculum.ENV, str(a))
    assert curriculum.lesson("machine")["steps"][0]["text"] == first_step_text(a)
    monkeypatch.setenv(curriculum.ENV, str(b))
    assert curriculum.lesson("machine")["steps"][0]["text"] == "A different first step."


@pytest.mark.parametrize("value", ["", "   "])
def test_tc12_empty_means_unset(monkeypatch, value):
    monkeypatch.setenv(curriculum.ENV, value)
    assert curriculum.root() == REPO / "curriculum"


def test_tc12_a_file_is_not_a_folder(monkeypatch):
    monkeypatch.setenv(curriculum.ENV, str(FIXTURE_CURRICULUM / "scope.json"))
    with pytest.raises(FileNotFoundError):
        curriculum.root()


def test_tc06_every_test_starts_on_the_fixture():
    assert curriculum.root() == FIXTURE_CURRICULUM


def test_tc07_editing_another_curriculum_changes_nothing_the_tests_see(tmp_path):
    """A stand-in for the real curriculum, edited the way the author will: a station renamed
    and a step reworded. The tests stay on the fixture and see none of it."""
    before_names = curriculum.station_names()
    before_reply = stub.decide([], curriculum.lesson("machine"))
    other = copy_of_fixture(tmp_path / "edited")
    stations = json.loads((other / "stations.json").read_text(encoding="utf-8"))
    for station in stations["stations"]:
        if station["id"] == "machine":
            station["name"] = "A renamed station"
    (other / "stations.json").write_text(json.dumps(stations), encoding="utf-8")
    doc = json.loads((other / "lessons" / "machine.json").read_text(encoding="utf-8"))
    doc["steps"][0]["text"] = "Reworded."
    (other / "lessons" / "machine.json").write_text(json.dumps(doc), encoding="utf-8")
    assert curriculum.station_names() == before_names
    assert stub.decide([], curriculum.lesson("machine")) == before_reply


def test_tc08_the_checker_passes_the_fixture():
    from tests.test_curriculum import validate_mod

    assert validate_mod.main([str(FIXTURE_CURRICULUM)]) == 0
