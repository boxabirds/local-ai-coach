"""Fixed text a learner sees in the browser follows the tone-of-voice guide's hard rules
(Ceetrix story 12, TC-04 and TC-05): no dashes, no avoid-list phrase.

The patterns are read from panel/stylecheck.py, the guide's own checker, not copied.
Strings are string literals and JSX text in the coach's own frontend files; identifiers
(no spaces, no capital start) and class names are ignored.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
STYLECHECK = REPO / "panel" / "stylecheck.py"
APP = REPO / "apps" / "app" / "src"
FILES = sorted(
    [*(APP / "components" / "coach").glob("*.tsx"), *(APP / "components" / "coach").glob("*.ts")]
    + [APP / "components" / "chat" / n for n in ("quote-block.tsx", "quoted-input.tsx", "quoted-user-text.tsx")]
    + [APP / "app" / "page.tsx", APP / "hooks" / "use-coach-ui.tsx"]
)
DASHES = re.compile("[–—]")
COMMENTS = re.compile(r"/\*.*?\*/|(?<![:\"'])//[^\n]*", re.S)
LITERALS = re.compile(r'"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|\'((?:[^\'\\\n]|\\.)*)\'')
JSX_TEXT = re.compile(r">\s*([^<>{}\n][^<>{}]*?)\s*<")


def avoid_patterns() -> list[str]:
    source = STYLECHECK.read_text(encoding="utf-8")
    listed = re.search(r"tells=(\[.*?\])\nhits", source, re.S)
    assert listed, "could not find the avoid list in stylecheck.py"
    return [p for p in ast.literal_eval(listed.group(1)) if p not in ("—", "–")]


def learner_strings(text: str) -> list[str]:
    """String literals and JSX text that read as words: they have a space or start with a capital."""
    text = COMMENTS.sub("", text)
    found = [next(g for g in m.groups() if g is not None) for m in LITERALS.finditer(text)]
    found += [m.group(1) for m in JSX_TEXT.finditer(text)]
    return [s for s in found if s.strip() and (" " in s.strip() or s[:1].isupper()) and not s.startswith(("@/", "./", "../", "http"))]


def hits(text: str, patterns: list[str]) -> list[str]:
    out = []
    for s in learner_strings(text):
        if DASHES.search(s):
            out.append(f"dash: {s!r}")
        out += [f"{p!r}: {s!r}" for p in patterns if re.search(p, s, re.I)]
    return out


@pytest.mark.parametrize("path", FILES, ids=lambda p: str(p.relative_to(APP)))
def test_s12_tc04_frontend_text_follows_the_voice_rules(path):
    assert hits(path.read_text(encoding="utf-8"), avoid_patterns()) == []


def test_s12_tc05_the_scanner_catches_a_dash_and_an_avoid_phrase():
    patterns = avoid_patterns()
    bad = 'export const A = "It fits — nearly.";\nconst B = () => <p>This is genuinely useful.</p>;'
    found = hits(bad, patterns)
    assert any(f.startswith("dash:") for f in found)
    assert any("genuinely" in f for f in found)
    assert hits('const ok = "coach-card"; const label = <p>Not yet</p>;', patterns) == []
