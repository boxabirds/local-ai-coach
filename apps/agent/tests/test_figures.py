"""Figures in the curriculum (Ceetrix story 7, TC-01 to TC-16).

Like test_curriculum.py, each case copies the real curriculum and changes one
thing, then asserts the exact set of error codes. Changes to a drawing are made
inside an element hidden in the figure's print state, so they show their own
code and not FIGURE_PRINT as well, unless the case is about the print drawing.
"""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable

import pytest

from tests.test_curriculum import CODE, CURRICULUM, errors, root, run, validate_mod  # noqa: F401  (root is a fixture)

GENERATOR = CODE / "figures" / "make_figures.py"
_gspec = importlib.util.spec_from_file_location("make_figures", GENERATOR)
assert _gspec and _gspec.loader
make_figures = importlib.util.module_from_spec(_gspec)
_gspec.loader.exec_module(make_figures)

STORY = "stories/legal-letter.md"
CHAPTER = "chapters/know-your-machine.md"


def svg_path(root: Path, fid: str, printed: bool = False) -> Path:
    return root / "figures" / ("print" if printed else "") / f"{fid}.svg"


def edit_text(path: Path, fn: Callable[[str], str]) -> None:
    before = path.read_text(encoding="utf-8")
    after = fn(before)
    assert after != before, f"the edit changed nothing in {path.name}"
    path.write_text(after, encoding="utf-8")


def hidden(root: Path, fid: str, snippet: str) -> None:
    """Add snippet to a figure's drawing, where its print state never draws it."""
    when = {"where-words-go": "when=last-year", "will-it-fit": "memory=8 file=2", "three-stations": "station=machine"}[fid]
    edit_text(svg_path(root, fid), lambda s: s.replace("</svg>", f'<g data-when="{when}">{snippet}</g></svg>'))


def edit_registry(root: Path, fid: str, fn: Callable[[dict], None]) -> None:
    path = root / "figures.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    fn(next(e for e in doc["figures"] if e["id"] == fid))
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- the generator


def test_tc01_committed_figures_are_what_the_generator_writes(root):
    # On the tests' copy; make check runs the same --check on the real curriculum.
    result = subprocess.run([sys.executable, str(root / "figures" / "make_figures.py"), "--check"], capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr


def test_tc02_check_names_an_edited_drawing(root):
    edit_text(svg_path(root, "will-it-fit"), lambda s: s.replace("Your memory", "Your memroy", 1))
    result = subprocess.run([sys.executable, str(root / "figures" / "make_figures.py"), "--check"], capture_output=True, text=True, check=False)
    assert result.returncode == 1
    assert result.stderr.strip() == "stale: figures/will-it-fit.svg"


@pytest.mark.parametrize("file_gb,expected", [(7.9, "fits"), (8, "depends"), (16, "depends"), (16.1, "no")])
def test_tc03_fit_rule_boundaries_on_16_gb(file_gb, expected):
    assert make_figures.fit(file_gb, 16) == expected
    assert validate_mod.fit_verdict(file_gb, 16) == expected


# ---------------------------------------------------------------- the validator


def test_tc04_the_real_tree_has_no_figure_issues(root):
    assert errors(run(root)) == []
    words = " ".join(text for _, text in validate_mod.figure_texts({"id": "x"}, None))
    assert words == ""  # an entry with no words yields none


def test_tc05_a_marker_naming_no_figure(root):
    edit_text(root / STORY, lambda s: s.replace("<!-- figure: where-words-go -->", "<!-- figure: where-word-go -->"))
    # The real figure has lost its marker too.
    assert errors(run(root)) == ["FIGURE_PLACEMENT", "FIGURE_UNKNOWN"]


def test_tc05b_a_step_naming_no_figure(root):
    edit_text(root / "lessons" / "machine.json", lambda s: s.replace('"figure": "will-it-fit"', '"figure": "will-it-fits"'))
    assert errors(run(root)) == ["FIGURE_PLACEMENT", "FIGURE_UNKNOWN"]


def test_tc06_missing_from_the_book(root):
    edit_text(root / CHAPTER, lambda s: s.replace("\n<!-- figure: will-it-fit -->\n", "\n"))
    assert errors(run(root)) == ["FIGURE_PLACEMENT"]


def test_tc06b_placed_twice_in_the_book(root):
    edit_text(root / CHAPTER, lambda s: s + "\n<!-- figure: will-it-fit -->\n")
    assert errors(run(root)) == ["FIGURE_PLACEMENT"]


def test_tc06c_on_two_lesson_steps(root):
    edit_text(root / "lessons" / "machine.json", lambda s: s.replace('"id": "machine.1",\n', '"id": "machine.1",\n      "figure": "will-it-fit",\n'))
    assert errors(run(root)) == ["FIGURE_PLACEMENT"]


def test_tc06d_a_story_figure_on_a_lesson_step(root):
    edit_text(root / "lessons" / "machine.json", lambda s: s.replace('"id": "machine.1",\n', '"id": "machine.1",\n      "figure": "three-stations",\n'))
    assert errors(run(root)) == ["FIGURE_PLACEMENT"]


def test_tc07_a_marker_after_the_wrong_sentence(root):
    marker = "\n<!-- figure: three-stations -->\n"
    edit_text(root / STORY, lambda s: s.replace(marker, "\n").replace("Three different amounts of you.\n", "Three different amounts of you.\n" + marker))
    assert errors(run(root)) == ["FIGURE_AFTER"]


@pytest.mark.parametrize("snippet", [
    "<script>alert(1)</script>",
    '<rect onload="alert(1)"/>',
    "<foreignObject><p>x</p></foreignObject>",
    "<style>text { fill: red }</style>",
    '<rect href="https://example.com/x.svg"/>',
    '<rect fill="url(https://example.com/x.svg)"/>',
])
def test_tc08_unsafe_content_is_refused(root, snippet):
    hidden(root, "where-words-go", snippet)
    assert set(errors(run(root))) == {"FIGURE_UNSAFE"}


@pytest.mark.parametrize("when", ["colour=red", "when=yesterday"])
def test_tc09_a_condition_that_is_not_a_choice(root, when):
    edit_text(svg_path(root, "where-words-go"), lambda s: s.replace("</svg>", f'<rect data-when="{when}"/></svg>'))
    assert errors(run(root)) == ["FIGURE_WHEN"]


def test_tc10_a_state_with_no_result(root):
    edit_text(svg_path(root, "where-words-go"), lambda s: re.sub(r'\s*<text [^>]*fig-result[^>]*data-when="when=last-year"[^>]*>[^<]*</text>', "", s))
    assert errors(run(root)) == ["FIGURE_VERDICT"]


def test_tc10b_a_state_with_two_results(root):
    hidden(root, "where-words-go", '<text class="fig-ink fig-result">And another.</text>')
    assert errors(run(root)) == ["FIGURE_VERDICT"]


def test_tc11_five_gb_on_sixteen_called_depends_is_refused(root):
    """5 GB is under half of 16 GB, so a drawing that says it depends breaks the rule."""
    def lie(s: str) -> str:
        lines = s.split("\n")
        i = next(n for n, line in enumerate(lines) if "fig-result" in line and 'data-when="memory=16 file=5"' in line)
        lines[i] = lines[i].replace('data-verdict="fits"', 'data-verdict="depends"').replace(
            "Fits: 5 GB is under half", "Depends: 5 GB is between half and all")
        return "\n".join(lines)
    edit_text(svg_path(root, "will-it-fit"), lie)
    assert errors(run(root)) == ["FIGURE_VERDICT"]


def test_tc12_a_station_in_the_wrong_colour(root):
    for printed in (False, True):
        edit_text(svg_path(root, "three-stations", printed), lambda s: s.replace('coach-crit--red" fill="#b91c1c" data-station="prove"', 'coach-crit--amber" fill="#b45309" data-station="prove"'))
    assert errors(run(root)) == ["FIGURE_CRIT"]


def test_tc13_a_stale_print_drawing(root):
    edit_text(svg_path(root, "will-it-fit", printed=True), lambda s: s.replace("Your memory: 16 GB", "Your memory: 32 GB"))
    assert errors(run(root)) == ["FIGURE_PRINT"]


def test_tc13b_a_missing_drawing(root):
    svg_path(root, "one-file").unlink()
    assert errors(run(root)) == ["FIGURE_PARSE"]


def test_tc14_a_term_before_it_is_defined(root):
    edit_registry(root, "where-words-go", lambda e: e.update(caption="Same app, same letter, same memory."))
    assert errors(run(root)) == ["TERM_EARLY"]


def test_tc15_a_dash_in_a_figure(root):
    edit_registry(root, "will-it-fit", lambda e: e.update(caption="Pick your number — then a file."))
    assert errors(run(root)) == ["STYLE_DASH"]
