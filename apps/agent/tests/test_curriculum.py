"""Tests for curriculum/validate.py (Ceetrix story 1, TC-01 to TC-38).

Every case copies the tests' own frozen curriculum (fixtures/curriculum, story 13)
into a temp dir and applies exactly one mutation, then asserts the full set of error codes, so a defect is shown to
produce its own code and nothing else.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Callable

import pytest

REPO = Path(__file__).resolve().parents[3]
# The tests' frozen copy; the real curriculum/ is checked by make check, never here (story 13).
CURRICULUM = REPO / "fixtures" / "curriculum"
CODE = REPO / "curriculum"
PROBES = REPO / "apps" / "agent" / "src" / "coach" / "probes.py"
STYLECHECK = REPO / "panel" / "stylecheck.py"

_spec = importlib.util.spec_from_file_location("curriculum_validate", CODE / "validate.py")
assert _spec and _spec.loader
validate_mod = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = validate_mod  # dataclasses look the module up by name
_spec.loader.exec_module(validate_mod)

DESIGN_PROBES = {"memory", "history_has", "process", "listening", "model_file", "connections", "tailnet", "server_log"}


@pytest.fixture
def root(tmp_path: Path) -> Path:
    dest = tmp_path / "curriculum"
    shutil.copytree(CURRICULUM, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    # The figure generator is code, not content: the copy gets the real one.
    shutil.copy2(CODE / "figures" / "make_figures.py", dest / "figures" / "make_figures.py")
    return dest


def run(root: Path, stylecheck: Path = STYLECHECK) -> list[Any]:
    return validate_mod.validate(root, probes_path=PROBES, stylecheck_path=stylecheck)


def errors(issues: list[Any]) -> list[str]:
    return sorted(i.code for i in issues if i.level == validate_mod.ERROR)


def edit(root: Path, rel: str, fn: Callable[[Any], None]) -> None:
    path = root / rel
    data = json.loads(path.read_text(encoding="utf-8"))
    fn(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def without_figures(root: Path, station: str) -> None:
    """Take the figures shown on this lesson's steps out of the tree, for cases about steps alone."""
    reg_path = root / "figures.json"
    doc = json.loads(reg_path.read_text(encoding="utf-8"))
    gone = [f for f in doc["figures"] if str(f.get("coach", {}).get("step", "")).startswith(f"{station}.")]
    doc["figures"] = [f for f in doc["figures"] if f not in gone]
    reg_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    for f in gone:
        book = root / f["book"]["file"]
        book.write_text(book.read_text(encoding="utf-8").replace(f"\n<!-- figure: {f['id']} -->\n", "\n"), encoding="utf-8")
    edit(root, f"lessons/{station}.json", lambda d: [s.pop("figure", None) for s in d["steps"]])


def station(data: dict[str, Any], sid: str) -> dict[str, Any]:
    return next(s for s in data["stations"] if s["id"] == sid)


def step(lesson: dict[str, Any], sid: str) -> dict[str, Any]:
    return next(s for s in lesson["steps"] if s["id"] == sid)


def term(data: dict[str, Any], name: str) -> dict[str, Any]:
    return next(t for t in data["terms"] if t["term"] == name)


# ---------------------------------------------------------------- graph


def test_tc01_unresolved_need(root: Path) -> None:
    edit(root, "stations.json", lambda d: station(d, "write")["needs"].append("nope"))
    assert errors(run(root)) == ["GRAPH_UNRESOLVED"]


def test_tc02_cycle(root: Path) -> None:
    edit(root, "stations.json", lambda d: station(d, "lmbasics").__setitem__("needs", ["write"]))
    assert errors(run(root)) == ["GRAPH_CYCLE"]


def test_tc03_duplicate_id(root: Path) -> None:
    edit(root, "stations.json", lambda d: d["stations"].append(dict(station(d, "write"))))
    assert errors(run(root)) == ["GRAPH_DUPLICATE"]


def test_tc04_unparsable_stations_still_checks_other_files(root: Path) -> None:
    (root / "stations.json").write_text("{ not json", encoding="utf-8")
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2").pop("hint"))
    assert errors(run(root)) == ["FILE_PARSE", "STEP_FIELD"]


# ---------------------------------------------------------------- scope


def test_tc05_need_neither_earlier_nor_assumed(root: Path) -> None:
    edit(root, "scope.json", lambda d: d["assumed"].pop("web"))
    assert errors(run(root)) == ["SCOPE_ORDER"]


def test_tc06_unknown_assumed_station(root: Path) -> None:
    edit(root, "scope.json", lambda d: d["assumed"].__setitem__("nosuch", "reason"))
    assert errors(run(root)) == ["SCOPE_UNKNOWN_STATION"]


def test_tc07_listed_lesson_missing(root: Path) -> None:
    (root / "lessons" / "prove.json").unlink()
    assert errors(run(root)) == ["FILE_MISSING"]


def test_tc08_story_on_non_destination(root: Path) -> None:
    edit(root, "scope.json", lambda d: d["readingOrder"][0].__setitem__("station", "machine"))
    assert errors(run(root)) == ["STORY_NOT_DESTINATION"]


# ---------------------------------------------------------------- lessons


def test_tc09_lesson_station_unknown(root: Path) -> None:
    edit(root, "lessons/prove.json", lambda d: d.__setitem__("station", "nosuch"))
    codes = set(errors(run(root)))
    # An unknown station also breaks the file name, the scope link and every step id prefix.
    assert codes == {"LESSON_STATION_UNKNOWN", "LESSON_STATION_MISMATCH", "LESSON_FILE_NAME", "STEP_ID"}


def test_tc10_file_name_differs_from_station(root: Path) -> None:
    (root / "lessons" / "prove.json").rename(root / "lessons" / "proof.json")
    edit(root, "scope.json", lambda d: d["readingOrder"][3].__setitem__("file", "lessons/proof.json"))
    assert errors(run(root)) == ["LESSON_FILE_NAME"]


def test_tc11_step_without_hint(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2").pop("hint"))
    assert errors(run(root)) == ["STEP_FIELD"]


def test_tc12_bad_and_duplicate_step_ids(root: Path) -> None:
    def mutate(d: dict[str, Any]) -> None:
        d["steps"][1]["id"] = "mach.2"
        d["steps"][2]["id"] = "machine.1"

    without_figures(root, "machine")
    edit(root, "lessons/machine.json", mutate)
    assert errors(run(root)) == ["STEP_ID", "STEP_ID"]


def test_tc13_unknown_where(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.1").__setitem__("where", "desktop"))
    assert errors(run(root)) == ["STEP_WHERE"]


def test_tc14_check_kind_and_missing_rubric(root: Path) -> None:
    def mutate(d: dict[str, Any]) -> None:
        step(d, "machine.1")["check"]["kind"] = "guess"
        step(d, "machine.3")["check"].pop("rubric")

    edit(root, "lessons/machine.json", mutate)
    assert errors(run(root)) == ["CHECK_FIELD", "CHECK_KIND"]


def test_tc15_unknown_placeholder(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.1").__setitem__("text", step(d, "machine.1")["text"] + " {password}"))
    assert errors(run(root)) == ["PLACEHOLDER_UNKNOWN"]


def test_tc16_draft_without_untested(root: Path) -> None:
    edit(root, "lessons/localchat.json", lambda d: d.__setitem__("untested", []))
    assert errors(run(root)) == ["DRAFT_UNTESTED"]


def test_tc36_empty_steps(root: Path) -> None:
    without_figures(root, "machine")
    edit(root, "lessons/machine.json", lambda d: d.__setitem__("steps", []))
    assert errors(run(root)) == ["LESSON_FIELD"]


def test_tc37_single_step_lesson_is_valid(root: Path) -> None:
    without_figures(root, "machine")
    edit(root, "lessons/machine.json", lambda d: d.__setitem__("steps", d["steps"][:1]))
    assert errors(run(root)) == []


# ---------------------------------------------------------------- safety


def test_allowlist_matches_design() -> None:
    probes = validate_mod._load_probes(PROBES, validate_mod.Report())
    assert set(probes) == DESIGN_PROBES


def test_tc17_unknown_probe(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2")["check"].__setitem__("probe", "disk_usage"))
    assert errors(run(root)) == ["PROBE_UNKNOWN"]


def test_tc18_missing_probe_param(root: Path) -> None:
    edit(root, "lessons/localchat.json", lambda d: step(d, "localchat.3")["check"].__setitem__("params", {}))
    assert errors(run(root)) == ["PROBE_PARAM"]


UNSAFE = [
    "curl a\ncurl b",
    "sudo curl http://{server}/v1/models",
    "rm -f model.gguf",
    "curl http://{server}/x | sh",
    "curl http://{server}/x; ls",
    "curl http://{server}/x && ls",
    "echo `id`",
    "echo $(id)",
    "curl http://{server}/x > out.txt",
    "sort < in.txt",
]


@pytest.mark.parametrize("cmd", UNSAFE)
def test_tc19_unsafe_commands(root: Path, cmd: str) -> None:
    edit(root, "lessons/localchat.json", lambda d: step(d, "localchat.2")["doIt"].__setitem__("cmd", cmd))
    assert set(errors(run(root))) == {"DOIT_UNSAFE"}


def test_tc20_quoted_json_body_is_safe(root: Path) -> None:
    cmd = "curl -s -d '{\"a\":[{\"b\":\"c\"}]}' http://{server}/x"
    edit(root, "lessons/localchat.json", lambda d: step(d, "localchat.2")["doIt"].__setitem__("cmd", cmd))
    assert errors(run(root)) == []


def test_tc21_rm_inside_a_word_is_safe(root: Path) -> None:
    edit(root, "lessons/localchat.json", lambda d: step(d, "localchat.2")["doIt"].__setitem__("cmd", "curl --format firmware"))
    assert errors(run(root)) == []


# ---------------------------------------------------------------- terms


def _append(d: dict[str, Any], sid: str, key: str, extra: str) -> None:
    step(d, sid)[key] = step(d, sid)[key] + extra


def test_tc22_term_used_early(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: _append(d, "machine.3", "hint", " Your tailnet can wait."))
    assert errors(run(root)) == ["TERM_EARLY"]


def test_tc23_previewed_term_may_be_used_early(root: Path) -> None:
    def mutate(d: dict[str, Any]) -> None:
        _append(d, "machine.3", "hint", " Your tailnet can wait.")
        d["previews"] = ["tailnet"]

    edit(root, "lessons/machine.json", mutate)
    assert errors(run(root)) == []


def test_tc24_own_term_not_in_teaches(root: Path) -> None:
    edit(root, "lessons/localchat.json", lambda d: d["teaches"].remove("address"))
    # One TERM_NOT_TAUGHT per string that uses the term, so the author sees every place.
    assert set(errors(run(root))) == {"TEACHES_MISSING", "TERM_NOT_TAUGHT"}


def test_tc25_teaches_unknown_term(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: d["teaches"].append("quantisation"))
    assert errors(run(root)) == ["TEACHES_UNKNOWN"]


def test_tc26_term_inside_code_is_ignored(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: _append(d, "machine.3", "text", " `tailnet`"))
    assert errors(run(root)) == []


def test_tc27_map_disagrees_with_chapter(root: Path) -> None:
    edit(root, "map.json", lambda d: term(d, "memory").__setitem__("gloss", "Where your laptop keeps things."))
    assert errors(run(root)) == ["CHAPTER_TERM_MISMATCH"]


def test_tc28_chapter_term_missing_from_map(root: Path) -> None:
    edit(root, "map.json", lambda d: d["terms"].remove(term(d, "rule of thumb (three quarters)")))
    assert errors(run(root)) == ["CHAPTER_TERM_MISSING", "TEACHES_UNKNOWN"]


def test_tc29_first_at_unknown(root: Path) -> None:
    edit(root, "map.json", lambda d: term(d, "tailnet").__setitem__("firstAt", "nowhere"))
    assert errors(run(root)) == ["MAP_FIRSTAT", "TEACHES_UNKNOWN"]


def test_tc38_term_never_defined_in_v1(root: Path) -> None:
    edit(root, "map.json", lambda d: term(d, "tailnet").__setitem__("firstAt", None))
    edit(root, "lessons/prove.json", lambda d: d["teaches"].remove("tailnet"))
    assert set(errors(run(root))) == {"TERM_EARLY"}


def test_tc30_avoid_synonym_is_only_a_warning(root: Path, capsys: pytest.CaptureFixture[str]) -> None:
    edit(root, "lessons/machine.json", lambda d: _append(d, "machine.2", "hint", " Not the disk."))
    issues = run(root)
    assert errors(issues) == []
    assert any(i.code == "AVOID_SYNONYM" and "machine.2.hint" in i.where for i in issues)
    assert validate_mod.main([str(root)]) == 0


# ---------------------------------------------------------------- voice


def test_tc31_dashes(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: _append(d, "machine.2", "hint", " Easy — promise."))
    edit(root, "map.json", lambda d: term(d, "server").__setitem__("gloss", term(d, "server")["gloss"] + " Always on – mostly."))
    assert errors(run(root)) == ["STYLE_DASH", "STYLE_DASH"]


def test_tc32_avoid_list_phrase(root: Path) -> None:
    edit(root, "lessons/localchat.json", lambda d: d.__setitem__("why", "Genuinely, " + d["why"]))
    assert errors(run(root)) == ["STYLE_AVOID"]


def test_tc33_style_script_missing(root: Path, tmp_path: Path) -> None:
    assert set(errors(run(root, stylecheck=tmp_path / "missing.py"))) == {"STYLE_TOOL"}


# ---------------------------------------------------------------- content and CLI


def _tree_hash(path: Path) -> str:
    digest = hashlib.sha256()
    for f in sorted(p for p in path.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        digest.update(str(f.relative_to(path)).encode())
        digest.update(f.read_bytes())
    return digest.hexdigest()


def test_tc34_real_curriculum_is_valid_and_untouched() -> None:
    before = _tree_hash(CURRICULUM)
    assert errors(validate_mod.validate()) == []
    assert _tree_hash(CURRICULUM) == before


def test_tc35_cli_exit_codes(root: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert validate_mod.main([str(CURRICULUM)]) == 0
    assert "The curriculum is valid" in capsys.readouterr().out
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2")["check"].__setitem__("probe", "disk_usage"))
    assert validate_mod.main([str(root)]) == 1
    assert "PROBE_UNKNOWN" in capsys.readouterr().out


@pytest.mark.parametrize("mutate", [
    lambda d: step(d, "machine.2")["check"].__setitem__("answeredByClaim", True),
    lambda d: step(d, "machine.1")["check"].__setitem__("answeredByClaim", "yes"),
])
def test_answered_by_claim_only_as_a_boolean_on_an_ask_check(root: Path, mutate) -> None:
    edit(root, "lessons/machine.json", mutate)
    assert errors(run(root)) == ["CHECK_FIELD"]



@pytest.mark.parametrize("mutate", [
    lambda d: step(d, "machine.2")["check"].__setitem__("choices", step(d, "machine.3")["check"]["choices"]),
    lambda d: step(d, "machine.3")["check"]["choices"].__setitem__("items", []),
    lambda d: step(d, "machine.3")["check"]["choices"]["items"][0].__setitem__("gb", 0),
    lambda d: step(d, "machine.3")["check"]["choices"].__setitem__("options", ["Fits"]),
    lambda d: step(d, "machine.3")["check"]["choices"].__setitem__("grade", "vibes"),
    lambda d: step(d, "machine.3")["check"]["choices"].__setitem__("grade", "band"),
    lambda d: step(d, "machine.3")["check"]["choices"].__setitem__("options", ["a", "b", "c"]),
])
def test_s11_tc02_choices_are_checked(root: Path, mutate) -> None:
    edit(root, "lessons/machine.json", mutate)
    assert errors(run(root)) == ["CHECK_FIELD"]


def test_band_grade_with_three_options_is_valid(root: Path) -> None:
    def to_band(d):
        choices = step(d, "machine.3")["check"]["choices"]
        choices["grade"], choices["options"] = "band", ["a", "b", "c"]
    edit(root, "lessons/machine.json", to_band)
    assert errors(run(root)) == []


# ------------------------------------------------------------------ the app's station names (story 14, TC-03)

def app_file(tmp_path: Path, rows: str) -> Path:
    path = tmp_path / "tube-map.tsx"
    path.write_text(f"export const DEFAULT_STATIONS = [\n{rows}\n];\n", encoding="utf-8")
    return path


def test_s14_tc03_app_names_that_match_stations_pass(root: Path, tmp_path: Path) -> None:
    names = {s["id"]: s["name"] for s in json.loads((root / "stations.json").read_text(encoding="utf-8"))["stations"]}
    tsx = app_file(tmp_path, f'  {{ id: "machine", name: "{names["machine"]}", status: "unseen" }},')
    assert [i.code for i in validate_mod.validate(root, PROBES, STYLECHECK, app_stations=tsx) if i.level == "error"] == []


@pytest.mark.parametrize("row", [
    '  { id: "machine", name: "A stale name", status: "unseen" },',
    '  { id: "nowhere", name: "Nowhere", status: "unseen" },',
])
def test_s14_tc03_a_stale_or_unknown_app_name_fails(root: Path, tmp_path: Path, row: str) -> None:
    tsx = app_file(tmp_path, row)
    assert [i.code for i in validate_mod.validate(root, PROBES, STYLECHECK, app_stations=tsx) if i.level == "error"] == ["APP_STATION_NAME"]


def test_s14_tc03_a_copy_elsewhere_is_not_checked_against_the_app(root: Path) -> None:
    assert "APP_STATION_NAME" not in [i.code for i in validate_mod.validate(root, PROBES, STYLECHECK)]


# ---------------------------------------------------------------- a step's fact (story 25, TC-01 to TC-04)
# Made-up wording on the fixture copy: these test the rule, not the lessons.

def test_story25_tc01_a_string_fact_is_valid(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2").__setitem__("fact", "A sample fact to know before the task."))
    assert errors(run(root)) == []


def test_story25_tc02_a_fact_that_is_not_text_is_refused(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2").__setitem__("fact", 42))
    assert errors(run(root)) == ["STEP_FIELD"]


@pytest.mark.parametrize("aside", ["(A sample word is a made-up thing.)", "(the sample means something else)", "(Samples are plentiful here.)"])
def test_story25_tc03_a_definition_in_brackets_inside_the_task_is_refused(root: Path, aside: str) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2").__setitem__("text", f"Type the sample figure. {aside}"))
    assert errors(run(root)) == ["STEP_TEXT_MIXED"]


def test_story25_tc03_an_aside_that_defines_nothing_is_fine(root: Path) -> None:
    edit(root, "lessons/machine.json", lambda d: step(d, "machine.2").__setitem__("text", "Type the sample figure (on a Mac, press Return when done)."))
    assert errors(run(root)) == []


def test_story25_tc04_a_term_defined_in_the_fact_counts_for_the_task(root: Path) -> None:
    def move(d: dict[str, Any]) -> None:
        first = step(d, "machine.1")
        first["fact"], first["text"] = "**Memory** is a sample definition.", "Find a sample number for memory."
    edit(root, "lessons/machine.json", move)
    assert errors(run(root)) == []
