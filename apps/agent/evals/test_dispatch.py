"""The dispatch cases against the real model (story 19, TC-17). make evals; never in the normal run."""

from __future__ import annotations

import os

import pytest

from evals import harness

pytestmark = pytest.mark.skipif(os.environ.get("COACH_EVALS") != "1", reason="run with make evals (calls the real model)")

CASES = harness.load_cases()
SMOKE = {"D-01", "D-02", "D-03", "D-04", "D-05", "D-06"}
RESULTS: list[harness.CaseResult] = []


PRICES: list = []


@pytest.fixture(scope="module")
def agent():
    values = harness.load_env()
    for key, value in values.items():
        os.environ[key] = value
    PRICES.append(harness.provider_prices(values))
    from src.coach import progress
    progress.home().mkdir(parents=True, exist_ok=True)
    yield harness.build_agent()
    prices = PRICES[0] if PRICES else None
    folder = harness.save(RESULTS, prices)
    print(f"\nDispatch results: {folder}")
    for r in RESULTS:
        print(f"  {r.case.id} {r.case.kind:8} {r.passes}/{r.case.runs} (need {r.case.need}) {'PASS' if r.passed else 'FAIL'}  {r.case.note}")
    totals: dict = {}
    for r in RESULTS:
        for key, value in harness.case_tokens(r).items():
            totals[key] = totals.get(key, 0) + value
    print(f"  tokens: {totals.get('input', 0):,} in, of which {totals.get('cached_input', 0):,} cached; {totals.get('output', 0):,} out ({totals.get('reasoning', 0):,} reasoning)")
    print(f"  cost: ${prices.cost(totals):.4f} at {prices.source}" if prices else "  cost: unknown (no published price for this provider)")


@pytest.mark.parametrize("case", [c for c in CASES if os.environ.get("COACH_EVALS_SMOKE") != "1" or c.id in SMOKE], ids=lambda c: c.id)
def test_dispatch(case, agent):
    result = harness.score(case, agent)
    RESULTS.append(result)
    why = "; ".join(sorted({r["why"] for r in result.runs if not r["ok"]}))
    assert result.passed, f"{case.id}: {result.passes}/{case.runs}, need {case.need}. {why}"
