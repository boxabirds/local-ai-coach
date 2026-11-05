"""Shared test set-up: no test may read or write the real ~/.local-ai-coach, and no
test reads the real curriculum.

Each test starts with COACH_HOME pointing at its own empty temp folder, and with
COACH_CURRICULUM pointing at the tests' frozen copy, fixtures/curriculum (story 13),
so editing the book never changes a test result. A test that sets either itself
(monkeypatch) overrides this.
"""

import os
from pathlib import Path

import pytest

FIXTURE_CURRICULUM = Path(__file__).resolve().parents[3] / "fixtures" / "curriculum"
# Set before any test module is imported, because some read a lesson at import time.
os.environ["COACH_CURRICULUM"] = str(FIXTURE_CURRICULUM)


@pytest.fixture(autouse=True)
def _coach_home(tmp_path_factory, monkeypatch):
    monkeypatch.setenv("COACH_HOME", str(tmp_path_factory.mktemp("coach-home")))
    monkeypatch.setenv("COACH_CURRICULUM", str(FIXTURE_CURRICULUM))
