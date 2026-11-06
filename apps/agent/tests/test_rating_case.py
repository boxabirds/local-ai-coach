"""A rating as a draft eval case, and the export (Ceetrix story 26, TC-25 to TC-31). The ratings
are built by ratings.build from made-up browser messages, so they have the real file's shape;
COACH_HOME is a temp folder per test (conftest)."""

from __future__ import annotations

import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from src.coach import progress, rating_case, ratings

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evals.harness import Case  # noqa: E402

WHEN = datetime(2026, 11, 6, 9, 0, 0, tzinfo=timezone.utc)
STAMP = "20261106T090000Z"


def messages() -> list[dict]:
    return [
        {"id": "u1", "role": "user", "content": "Start me off"},
        {"id": "a1", "role": "assistant", "content": "", "toolCalls": [
            {"id": "c1", "function": {"name": "show_next_step", "arguments": json.dumps({"station": "alpha", "step": "alpha.1", "extra": "x"})}},
        ]},
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": json.dumps({"action": "claim"})},
        {"id": "a2", "role": "assistant", "content": "A text-only reply."},
    ]


def rating(message_id: str, rating_: str, reason: str | None = None) -> dict:
    return ratings.build({"message_id": message_id, "rating": rating_, "reason": reason, "messages": messages()}, WHEN)


# TC-25
def test_tc25_good_on_a_card_expects_that_card_with_its_station_and_step():
    case = rating_case.draft(rating("a1", "up"))
    assert case["id"] == f"R-{STAMP}"
    assert case["history"] == [{"type": "human", "content": "Start me off"}]
    assert (case["expect_tool"], case["expect_args"]) == ("show_next_step", {"station": "alpha", "step": "alpha.1"})
    Case(**case)  # runs as it is


# TC-26
def test_tc26_good_on_a_text_reply_expects_text():
    case = rating_case.draft(rating("a2", "up"))
    assert case["expect_tool"] is None and case["text_end_ok"] is True
    assert [h["type"] for h in case["history"]] == ["human", "ai", "tool"]
    Case(**case)


# TC-27
def test_tc27_not_good_leaves_the_expected_action_to_the_author():
    case = rating_case.draft(rating("a1", "down", "asked twice"))
    assert case["expect_tool"] == rating_case.TODO
    assert "asked twice" in case["note"] and "show_next_step" in case["note"]
    case["expect_tool"] = "show_next_step"  # what the author fills in
    Case(**case)


def test_tc27b_not_good_without_a_reason_says_so():
    assert "(no reason given)" in rating_case.draft(rating("a2", "down"))["note"]


# TC-28
@pytest.mark.parametrize("bad", [{"schema": 99, "rating": "up"}, {"schema": ratings.SCHEMA, "rating": "meh"}, [], {"schema": ratings.SCHEMA, "rating": "up", "history": []}])
def test_tc28_another_file_is_refused(bad):
    with pytest.raises(rating_case.NotARating):
        rating_case.draft(bad)


def test_tc28b_no_ratings_and_a_wrong_file_exit_1_and_write_nothing(tmp_path, capsys):
    drafts = tmp_path / "drafts"
    assert rating_case.main([], drafts) == rating_case.FAILED
    wrong = tmp_path / "wrong.json"
    wrong.write_text("{}", encoding="utf-8")
    assert rating_case.main([str(wrong)], drafts) == rating_case.FAILED
    assert rating_case.main([str(tmp_path / "missing.json")], drafts) == rating_case.FAILED
    assert not drafts.exists()
    assert "No rating" in capsys.readouterr().out


def test_tc28c_the_newest_rating_is_the_default(tmp_path):
    ratings.save(rating("a1", "up"), datetime(2026, 11, 6, 8, 0, tzinfo=timezone.utc))
    ratings.save(rating("a2", "up"), WHEN)
    drafts = tmp_path / "drafts"
    assert rating_case.main([], drafts) == 0
    (written,) = drafts.glob("*.json")
    assert json.loads(written.read_text(encoding="utf-8"))["expect_tool"] is None  # a2, the newer one


# TC-29
def test_tc29_a_second_draft_never_overwrites_the_first(tmp_path):
    case = rating_case.draft(rating("a1", "up"))
    first = rating_case.write_draft(case, tmp_path)
    second = rating_case.write_draft(case, tmp_path)
    assert (first.name, second.name) == (f"R-{STAMP}.json", f"R-{STAMP}-2.json")


# TC-30
def test_tc30_export_holds_every_rating_and_nothing_else():
    saved = [ratings.save(rating("a1", "up"), WHEN), ratings.save(rating("a2", "down"), WHEN)]
    home = progress.home()
    (home / "progress.json").write_text("{}", encoding="utf-8")  # not a rating: stays out
    out = rating_case.export(home, WHEN)
    assert out == home / f"ratings-export-{STAMP}.zip"
    with zipfile.ZipFile(out) as archive:
        assert sorted(archive.namelist()) == sorted(saved)
    assert len(list(ratings.folder().glob("*.json"))) == 2  # untouched


# TC-31
def test_tc31_no_ratings_no_zip(capsys):
    home = progress.home()
    assert rating_case.export(home, WHEN) is None
    assert rating_case.main(["export"]) == rating_case.FAILED
    assert not list(home.glob("*.zip")) if home.exists() else True
    assert "No ratings" in capsys.readouterr().out
