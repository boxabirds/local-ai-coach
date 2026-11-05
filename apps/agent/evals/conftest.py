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


GB = 1024**3
EVAL_MEMORY_GB = 16  # the memory every case's learner typed or has


@pytest.fixture(autouse=True)
def _a_16_gb_machine(monkeypatch):
    """Checks run for real in a turn; the machine they look at is a fixed 16 GB one, so every
    run sees the same evidence wherever the suite runs."""
    from src.coach import tools

    def run(name, params=None, **kwargs):
        if name == "memory":
            return {"probe": name, "cmd": "sysctl -n hw.memsize", "matched": [str(EVAL_MEMORY_GB * GB)], "value": EVAL_MEMORY_GB}
        return {"probe": name, "cmd": name, "matched": [], "value": None}

    monkeypatch.setattr(tools, "RUN", run)
