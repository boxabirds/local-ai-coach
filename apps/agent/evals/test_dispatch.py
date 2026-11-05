"""The dispatch cases against the real model (story 19, TC-17). make evals; never in the normal run."""

from __future__ import annotations

import os

import pytest

from evals import harness

pytestmark = pytest.mark.skipif(os.environ.get("COACH_EVALS") != "1", reason="run with make evals (calls the real model)")

CASES = harness.load_cases()
SMOKE = {"D-01", "D-02", "D-03", "D-04", "D-05", "D-06"}
RESULTS: list[harness.CaseResult] = []


@pytest.fixture(scope="module")
def agent():
    for key, value in harness.load_env().items():
        os.environ[key] = value
    from src.coach import progress
    progress.home().mkdir(parents=True, exist_ok=True)
    yield harness.build_agent()
    folder = harness.save(RESULTS)
    print(f"\nDispatch results: {folder}")
    for r in RESULTS:
        print(f"  {r.case.id} {r.case.kind:8} {r.passes}/{r.case.runs} (need {r.case.need}) {'PASS' if r.passed else 'FAIL'}  {r.case.note}")


@pytest.mark.parametrize("case", [c for c in CASES if os.environ.get("COACH_EVALS_SMOKE") != "1" or c.id in SMOKE], ids=lambda c: c.id)
def test_dispatch(case, agent):
    result = harness.score(case, agent)
    RESULTS.append(result)
    why = "; ".join(sorted({r["why"] for r in result.runs if not r["ok"]}))
    assert result.passed, f"{case.id}: {result.passes}/{case.runs}, need {case.need}. {why}"
