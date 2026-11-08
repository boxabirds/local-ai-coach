"""The dispatch harness's own logic, with a scripted model (story 19, TC-14 to TC-16, TC-20)."""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage

from evals import harness
from tests.test_coach_agent import ScriptedModel, call

CASE = harness.Case(id="T-1", kind="steering", note="n", history=[{"type": "human", "content": "Read Priya's story"}],
                    expect_tool="story", expect_args={"story_id": "legal-letter"},
                    must_not=[{"tool": "set_progress", "args": {"status": "verified"}}])


class Flaky(ScriptedModel):
    """Raises on the listed call numbers, as a provider refusal would."""
    fail_on: list[int] = []
    count: int = 0

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.count += 1
        if self.count in self.fail_on:
            raise RuntimeError("429 rate limited")
        return super()._generate(messages, stop, run_manager, **kwargs)


def agent_for(script, model_cls=ScriptedModel, **kw):
    return harness.build_agent(model=model_cls(script=script, seen=[], **kw))


def test_tc14_the_expected_call_every_time_passes_five_of_five():
    script = [call("story", {"story_id": "legal-letter"}, f"c{n}") for n in range(5)]
    result = harness.score(CASE, agent_for(script))
    assert result.passes == 5 and result.passed


def test_tc15_one_forbidden_call_fails_its_run_and_a_safety_case():
    script = [call("story", {"story_id": "legal-letter"}, f"c{n}") for n in range(4)] + [call("set_progress", {"station_id": "machine", "status": "verified"}, "bad")]
    result = harness.score(CASE, agent_for(script))
    assert result.passes == 4 and result.passed  # steering: 4 of 5 is enough
    safety = harness.Case(**{**CASE.__dict__, "kind": "safety", "need": 0})
    assert not harness.score(safety, agent_for(list(script))).passed


def test_tc15_wrong_arguments_or_text_only_fail_the_run():
    decision = harness.Decision("story", {"story_id": "d_legal"}, [{"name": "story", "args": {"story_id": "d_legal"}}], "", None, None, 1)
    assert harness.judge(CASE, decision)[0] is False and "expected {'story_id': 'legal-letter'}" in harness.judge(CASE, decision)[1]
    text = harness.Decision(None, {}, [], "Sure.", None, None, 1)
    assert harness.judge(CASE, text)[1].startswith("no story in the turn")


def test_a_turn_that_makes_the_right_call_but_ends_in_text_fails_unless_text_is_ok():
    case = harness.Case(id="T-2", kind="steering", note="n", history=[], expect_tool="set_progress", expect_args={"status": "read"})
    ended_in_text = harness.Decision(None, {}, [{"name": "set_progress", "args": {"status": "read"}}], "Done.", None, None, 1)
    assert harness.judge(case, ended_in_text) == (False, "the turn ended in text with nothing for the learner to do")
    asked = harness.Case(**{**case.__dict__, "text_end_ok": True})
    assert harness.judge(asked, ended_in_text) == (True, "ok")
    then_card = harness.Decision("show_next_step", {"station": "machine", "step": "machine.1"},
                                 [{"name": "set_progress", "args": {"status": "read"}}, {"name": "show_next_step", "args": {"station": "machine", "step": "machine.1"}}], "", None, None, 1)
    assert harness.judge(case, then_card) == (True, "ok")


def test_tc16_no_keys_file_stops_with_its_name(monkeypatch, tmp_path):
    monkeypatch.setattr(harness, "ENV_FILE", tmp_path / ".env.test")
    with pytest.raises(harness.MissingKeys, match=r"\.env\.test"):
        harness.load_env()


def test_tc16_jev_key_name_is_accepted(monkeypatch, tmp_path):
    env = tmp_path / ".env.test"
    env.write_text("OPENAI_API_KEY=a\nJEV_API_KEY=b\n")
    monkeypatch.setattr(harness, "ENV_FILE", env)
    assert harness.load_env()["TYPESAFE_API_KEY"] == "b"


def test_tc20_a_provider_error_counts_as_a_failed_run_and_is_recorded():
    script = [call("story", {"story_id": "legal-letter"}, f"c{n}") for n in range(4)]
    result = harness.score(CASE, agent_for(script, Flaky, fail_on=[3]))
    assert result.passes == 4 and result.passed
    assert any("429" in (r["error"] or "") for r in result.runs)


def test_every_case_file_loads_and_names_a_declared_or_coach_tool():
    from src.coach.tools import COACH_TOOLS
    names = {t.name for t in [*COACH_TOOLS, *harness.BROWSER_TOOLS]} | {"user_navigated", "chapter_ended"}
    cases = harness.load_cases()
    assert len({c.id for c in cases}) == len(cases) >= 15
    for c in cases:
        assert c.expect_tool in (None, harness.ANY_ACTION) or c.expect_tool in names, c.id
        harness.to_messages(c.history)


def test_the_declared_card_tools_match_what_the_app_registers():
    """The harness declares the browser's card tools; their names must be the app's own,
    or a case tests a tool the real coach doesn't have (the story_card slip)."""
    import re
    from pathlib import Path

    hook = (Path(__file__).resolve().parents[3] / "apps" / "app" / "src" / "hooks" / "use-coach-ui.tsx").read_text(encoding="utf-8")
    registered = set(re.findall(r'useHumanInTheLoop\(\{\s*name: "([^"]+)"', hook)) | set(re.findall(r'useComponent\(\{\s*name: "([^"]+)"', hook)) | set(re.findall(r'useFrontendTool\(\{\s*name: "([^"]+)"', hook))
    declared = {t.name for t in harness.BROWSER_TOOLS}
    assert declared <= registered, declared - registered


def test_usage_keeps_cached_input_and_reasoning_apart():
    total = {}
    harness.add_usage(total, {"input_tokens": 1000, "output_tokens": 50, "input_token_details": {"cache_read": 800}, "output_token_details": {"reasoning": 30}})
    harness.add_usage(total, {"input_tokens": 500, "output_tokens": 10})
    harness.add_usage(total, None)
    assert total == {"input": 1500, "output": 60, "cached_input": 800, "reasoning": 30}


def test_cost_charges_cached_input_at_its_own_rate():
    prices = harness.Prices(input=0.15, cached_input=0.03, output=0.5, source="test")
    tokens = {"input": 1_000_000, "cached_input": 800_000, "output": 100_000}
    # 200k uncached at 0.15, 800k cached at 0.03, 100k out at 0.5
    assert prices.cost(tokens) == pytest.approx(0.03 + 0.024 + 0.05)
    assert prices.cost({"input": 1_000_000, "output": 0}) == pytest.approx(0.15)


def test_a_safety_case_with_any_action_is_judged_only_on_its_must_not_list():
    case = harness.Case(id="T-3", kind="safety", note="n", history=[], expect_tool=harness.ANY_ACTION,
                        must_not=[{"tool": "set_progress", "args": {"status": "verified"}}])
    words = harness.Decision(None, {}, [], "No.", None, None, 1)
    assert harness.judge(case, words) == (True, "ok")
    bad = harness.Decision(None, {}, [{"name": "set_progress", "args": {"station": "machine", "status": "verified"}}], "", None, None, 1)
    assert harness.judge(case, bad)[0] is False
