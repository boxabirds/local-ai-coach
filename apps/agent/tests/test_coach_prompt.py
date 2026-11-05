"""The coach's prompt and skills (Ceetrix story 10, TC-26 and TC-27; TC-25 is the
existing canonical and skills contract tests, which still pass)."""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from src.prompt import AVOID_END, AVOID_START, EXAMPLES_END, EXAMPLES_START, SYSTEM_PROMPT

STYLECHECK = Path(__file__).resolve().parents[3] / "panel" / "stylecheck.py"
SKILLS = Path(__file__).resolve().parents[1] / "skills"
CONTRACT_HEADING = "## Streaming tool contract"
# sha256 of the prompt from the streaming contract heading to the end, as upstream
# wrote it (CopilotKit commit 40dfa3b). It must stay verbatim (CLAUDE.md).
UPSTREAM_CONTRACT_SHA256 = "03d24c5211fda04ecf75af54c93bae344e29b379fb907ad5c903711e19e846f0"


def ours() -> str:
    """Our part of the prompt: before upstream's sections, without the quoted avoid list."""
    head = SYSTEM_PROMPT[: SYSTEM_PROMPT.index("## Truthful data and capabilities")]
    for start, end in ((AVOID_START, AVOID_END), (EXAMPLES_START, EXAMPLES_END)):
        head = re.sub(re.escape(start) + r".*?" + re.escape(end), "", head, flags=re.S)
    return head


def avoid_hits(text: str) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as tmp:
        tmp.write(text)
    try:
        out = subprocess.run([sys.executable, str(STYLECHECK), "--book", tmp.name], capture_output=True, text=True, check=True).stdout
    finally:
        Path(tmp.name).unlink()
    return next(line for line in out.splitlines() if line.startswith("avoid-list hits:"))


def test_tc27_the_streaming_contract_is_upstreams_verbatim():
    tail = SYSTEM_PROMPT[SYSTEM_PROMPT.index(CONTRACT_HEADING):]
    assert hashlib.sha256(tail.encode()).hexdigest() == UPSTREAM_CONTRACT_SHA256


def test_tc26_our_prompt_text_passes_the_voice_rules():
    assert avoid_hits(ours()) == "avoid-list hits: none"
    assert AVOID_START in SYSTEM_PROMPT and AVOID_END in SYSTEM_PROMPT


@pytest.mark.parametrize("name", ["coach-playbook", "step-contract", "evidence-rules"])
def test_tc26_each_coach_skill_passes_the_voice_rules(name):
    assert avoid_hits((SKILLS / name / "SKILL.md").read_text()) == "avoid-list hits: none"


def test_the_prompt_names_every_coach_tool_and_card():
    for name in ("get_station", "start_step", "run_check", "set_progress", "end_session", "step_card", "number_card", "consent_card", "show_map"):
        assert name in SYSTEM_PROMPT


def test_s8_tc17_the_prompt_names_the_quote_rule():
    assert "A message that starts with lines beginning > quotes something" in SYSTEM_PROMPT



MIN_EXAMPLES = 4


def test_s12_tc03_the_voice_comes_with_whole_passages_as_examples():
    block = SYSTEM_PROMPT[SYSTEM_PROMPT.index(EXAMPLES_START):SYSTEM_PROMPT.index(EXAMPLES_END)]
    assert len(re.findall(r"^Example \d+:$", block, flags=re.M)) >= MIN_EXAMPLES


def test_s12_tc01_no_dashes_in_our_prompt_text():
    assert not re.search("[\u2013\u2014]", ours())
