"""The dispatch suite runs only with COACH_EVALS=1 (make evals), on the tests' frozen curriculum,
in a temp coach folder, with the test keys from apps/agent/.env.test."""

import os
from pathlib import Path

import pytest

FIXTURE_CURRICULUM = Path(__file__).resolve().parents[3] / "fixtures" / "curriculum"


@pytest.fixture(autouse=True)
def _isolated(tmp_path_factory, monkeypatch):
    monkeypatch.setenv("COACH_HOME", str(tmp_path_factory.mktemp("coach-home")))
    monkeypatch.setenv("COACH_KEYCHAIN_SERVICE", "local-ai-coach-evals-empty")
    if os.environ.get("COACH_EVALS_REAL_CURRICULUM") != "1":
        monkeypatch.setenv("COACH_CURRICULUM", str(FIXTURE_CURRICULUM))
