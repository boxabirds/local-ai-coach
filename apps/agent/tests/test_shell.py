"""V1 step 2 shell checks: the agent binds to loopback and the demo is gone (TC-36, TC-37)."""

import json
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
APP_SRC = REPO / "apps" / "app" / "src"
LOOPBACK = "127.0.0.1"
ANY_ADDRESS = "0.0.0.0"

REMOVED = [
    "apps/app/src/components/demo-gallery",
    "apps/app/src/components/template-library",
    "apps/app/src/components/qr-modal",
    "apps/app/src/components/explainer-cards.tsx",
    "apps/app/src/components/desktop-tip-modal.tsx",
    "apps/app/src/components/example-layout",
    "apps/app/src/components/generative-ui/charts",
    "apps/app/src/components/generative-ui/meeting-time-picker.tsx",
    "apps/app/src/components/generative-ui/plan-card.tsx",
    "apps/app/src/app/pick",
    "apps/app/src/app/api/pick",
    "apps/app/src/app/posthog-analytics.tsx",
    "apps/app/src/hooks/use-generative-ui-examples.tsx",
    "apps/agent/src/query.py",
    "apps/agent/src/trip_images.py",
    "apps/agent/src/plan.py",
    "apps/agent/src/todos.py",
    "apps/agent/src/form.py",
    "apps/agent/src/templates.py",
    "apps/agent/src/db.csv",
    "apps/agent/skills/master-playbook",
    "docker",
    "render.yaml",
]


def test_tc36_agent_binds_loopback_in_main_and_dev_script():
    main = (REPO / "apps" / "agent" / "main.py").read_text()
    assert f'host="{LOOPBACK}"' in main
    assert ANY_ADDRESS not in main
    dev_agent = json.loads((REPO / "package.json").read_text())["scripts"]["dev:agent"]
    assert f"--host {LOOPBACK}" in dev_agent
    assert ANY_ADDRESS not in dev_agent


def test_story22_tc19_dev_reload_watches_the_agents_source_not_its_libraries():
    """uvicorn's stat reloader walks every .py under each watched folder; the default (the
    agent folder) includes .venv, thousands of files polled four times a second."""
    dev_agent = json.loads((REPO / "package.json").read_text())["scripts"]["dev:agent"]
    assert "--reload-dir src" in dev_agent
    assert f"--host {LOOPBACK}" in dev_agent


@pytest.mark.parametrize("path", REMOVED)
def test_tc37_demo_path_is_removed(path):
    assert not (REPO / path).exists(), path


def test_tc37_no_telemetry_or_analytics_imports_in_the_app():
    offenders = []
    for source in APP_SRC.rglob("*.ts*"):
        text = source.read_text().lower()
        if "posthog" in text or "launch-telemetry" in text or "telemetry.copilotkit.ai" in text:
            offenders.append(str(source.relative_to(REPO)))
    # Story 31: the inert stand-in went with the Next route that imported it.
    assert not (APP_SRC / "lib" / "launch-telemetry.ts").exists()
    assert offenders == []


def test_tc37_app_scripts_turn_off_runtime_telemetry():
    scripts = json.loads((REPO / "apps" / "app" / "package.json").read_text())["scripts"]
    assert scripts["dev"].startswith("DO_NOT_TRACK=1 ")
    assert scripts["start"].startswith("DO_NOT_TRACK=1 ")


# ------------------------------------------------------------------ story 5: reserved colours


def test_s5_tc13_criticality_colours_are_reserved():
    """The book's grey, amber and red are used only to show a station's criticality."""
    css = (APP_SRC / "components" / "coach" / "coach.css").read_text()
    rules = re.findall(r"([^{}]+)\{([^{}]*)\}", css)
    for selector, body in rules:
        if "var(--crit-" in body:
            assert "coach-crit" in selector, f"criticality colour used outside a .coach-crit rule: {selector.strip()}"
    # The old amber literal used for progress and "not yet" is gone everywhere.
    for source in APP_SRC.rglob("*"):
        if source.suffix in {".css", ".ts", ".tsx"}:
            assert "#d9a03f" not in source.read_text().lower(), source
