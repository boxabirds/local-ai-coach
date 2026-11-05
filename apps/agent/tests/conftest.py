"""Shared test set-up: no test may read or write the real ~/.local-ai-coach.

Each test starts with COACH_HOME pointing at its own empty temp folder; a test
that sets COACH_HOME itself (monkeypatch.setenv) overrides this.
"""

import pytest


@pytest.fixture(autouse=True)
def _coach_home(tmp_path_factory, monkeypatch):
    monkeypatch.setenv("COACH_HOME", str(tmp_path_factory.mktemp("coach-home")))
