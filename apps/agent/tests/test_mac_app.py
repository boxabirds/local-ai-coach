"""Local AI Coach.app (Ceetrix story 35).

Integration cases (TC-B, TC-I, TC-M) build the app with scripts/build-mac-app.sh from fake
release trees laid out like the real one, whose launcher is a small bash script, and run the
real app executable. The end-to-end cases (COACH_RELEASE_E2E=1, run by make release-test)
build the real release tree for this Mac, sign the app with the Developer ID (hardened
runtime), and run the browser suite against the coach the app started.
Mac only: the app is a Mac app.
"""

from __future__ import annotations

import os
import plistlib
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="the app is a Mac app")
# Building the app and running it (its menu-bar icon, TC-I4's alert) is not for every pytest run:
# make mac-test and make release-test turn these on.
app_cases = pytest.mark.skipif(
    os.environ.get("COACH_MAC_APP") != "1" and os.environ.get("COACH_RELEASE_E2E") != "1",
    reason="set COACH_MAC_APP=1 (make mac-test) to build and run the app",
)

REPO = Path(__file__).resolve().parents[3]
BUILD_APP = REPO / "scripts" / "build-mac-app.sh"
BUILD_RELEASE = REPO / "scripts" / "build-release.sh"
VERSION = "9.9.9-test"
APP_NAME = "Local AI Coach.app"
# Permanent once testers install it: macOS treats another ID as another app.
BUNDLE_ID = "ai.sovereignlocal.coach"
READY = "The coach is running at "
ARCH = {"arm64": "arm64", "x86_64": "x64"}[os.uname().machine]
BUILD_TIMEOUT = 1200
START_WAIT = 90
STOP_WAIT = 20
FAKE_SLEEP = 6029  # an unusual number, so the leftover check matches only our fakes
LOGIN_BIN = "/fake/login/bin"
PATH_MARKER = "__LOCAL_AI_COACH_PATH__"
# What the app is started with: the few variables a Mac session always has, never the
# shell's own (it may hold keys, and pytest prints a failing test's arguments).
PASSED_ON = ("PATH", "TMPDIR", "USER", "LOGNAME", "LANG")

FAKE_LAUNCHER = f"""#!/bin/bash
# A stand-in for bin/local-ai-coach: records how it was started, prints the ready line, and
# stops its child on SIGTERM, as the real one does.
out="$COACH_HOME/fake"
mkdir -p "$out"
printf '%s\\n' "$@" > "$out/args"
printf '%s\\n' "$0" > "$out/self"
env > "$out/env"
if [ -n "${{FAKE_FAIL:-}}" ]; then echo "the agent would not start"; exit 1; fi
sleep {FAKE_SLEEP} &
child=$!
echo $$ > "$out/launcher.pid"
echo $child > "$out/child.pid"
trap 'kill $child; exit 0' TERM INT
echo "Starting the coach (version {VERSION})"
echo "{READY}http://127.0.0.1:$COACH_APP_PORT"
wait
"""

FAKE_SHELL = f"""#!/bin/sh
# A login shell whose PATH starts with a folder only it knows.
printf 'Welcome\\n{PATH_MARKER}%s{PATH_MARKER}' "{LOGIN_BIN}:/usr/bin"
"""


def write_exe(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    path.chmod(0o755)


def fake_tree(dist: Path, arch: str = ARCH, version: str = VERSION) -> Path:
    """A release tree with the real layout; only the launcher does anything."""
    tree = dist / f"release-darwin-{arch}"
    write_exe(tree / "bin" / "local-ai-coach", FAKE_LAUNCHER)
    (tree / "VERSION").write_text(version + "\n")
    (tree / "web").mkdir(parents=True)
    (tree / "web" / "index.html").write_text("<!doctype html><title>made up</title>")
    write_exe(tree / "python" / "bin" / "python3.12", "#!/bin/sh\nexit 0\n")
    (tree / "python" / "bin" / "python3").symlink_to("python3.12")
    return tree


def build(dist: Path, *mode: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "COACH_MAC_DIST": str(dist)}
    return subprocess.run(["bash", str(BUILD_APP), VERSION, *mode], env=env, capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False)


def snapshot(path: Path) -> dict[str, tuple[int, int]]:
    return {str(p.relative_to(path)): (p.stat().st_size, p.stat().st_mtime_ns) for p in sorted(path.rglob("*")) if p.is_file()}


class RunningApp:
    """The app's own executable, started as Finder would, with its output read line by line."""

    def __init__(self, app: Path, env: dict[str, str]):
        self.lines: list[str] = []
        self.process = subprocess.Popen(
            [str(app / "Contents" / "MacOS" / "LocalAICoach"), "--no-open"],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        assert self.process.stdout
        for line in self.process.stdout:
            self.lines.append(line.rstrip("\n"))

    def ready(self, timeout: float = START_WAIT) -> str:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for line in self.lines:
                if line.startswith(READY):
                    return line[len(READY):]
            if self.process.poll() is not None:
                break
            time.sleep(0.2)
        pytest.fail("the app never said the coach was running:\n" + "\n".join(self.lines[-30:]))

    def quit(self) -> int:
        if self.process.poll() is None:
            self.process.send_signal(signal.SIGTERM)
        return self.process.wait(timeout=STOP_WAIT)


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def wait_gone(pid: int, timeout: float = STOP_WAIT) -> bool:
    deadline = time.monotonic() + timeout
    while alive(pid) and time.monotonic() < deadline:
        time.sleep(0.1)
    return not alive(pid)


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> Path:
    dist = tmp_path_factory.mktemp("dist")
    fake_tree(dist)
    result = build(dist)
    assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-2000:]
    return dist / APP_NAME


def session_env() -> dict[str, str]:
    return {k: os.environ[k] for k in PASSED_ON if k in os.environ}


@pytest.fixture
def app_env(tmp_path) -> dict[str, str]:
    home = tmp_path / "home"
    home.mkdir()
    shell = tmp_path / "login-shell"
    write_exe(shell, FAKE_SHELL)
    return {**session_env(), "HOME": str(home), "COACH_HOME": str(home / ".local-ai-coach"), "SHELL": str(shell)}


def fake_out(env: dict[str, str]) -> Path:
    return Path(env["COACH_HOME"]) / "fake"


def launcher_env(env: dict[str, str]) -> dict[str, str]:
    return dict(line.split("=", 1) for line in (fake_out(env) / "env").read_text().splitlines() if "=" in line)


# TC-B1
@app_cases
def test_tcb1_the_app_holds_this_macs_tree_its_icon_and_runs_on_both_kinds_of_mac(built):
    info = plistlib.loads((built / "Contents" / "Info.plist").read_bytes())
    assert info["CFBundleShortVersionString"] == VERSION and info["CFBundleVersion"] == VERSION
    assert info["LSUIElement"] is True
    assert info["LSMinimumSystemVersion"] == "13.0"
    assert info["CFBundleName"] == "Local AI Coach"
    assert info["CFBundleIdentifier"] == BUNDLE_ID
    resources = built / "Contents" / "Resources"
    assert (resources / f"coach-{ARCH}" / "bin" / "local-ai-coach").is_file()
    assert (resources / "AppIcon.icns").stat().st_size > 0
    archs = subprocess.run(["lipo", "-archs", str(built / "Contents" / "MacOS" / "LocalAICoach")], capture_output=True, text=True, check=True).stdout.split()
    assert sorted(archs) == ["arm64", "x86_64"]


# TC-B2
@app_cases
def test_tcb2_no_release_tree_builds_nothing(tmp_path):
    result = build(tmp_path)
    assert result.returncode == 1
    assert "release-darwin-" in result.stderr
    assert not (tmp_path / APP_NAME).exists()


# TC-B3
@app_cases
def test_tcb3_a_tree_of_another_version_builds_nothing(tmp_path):
    fake_tree(tmp_path, version="0.0.1")
    result = build(tmp_path)
    assert result.returncode == 1
    assert "0.0.1" in result.stderr and VERSION in result.stderr
    assert not (tmp_path / APP_NAME).exists()


# TC-B4
@app_cases
def test_tcb4_the_built_app_has_a_valid_signature(built):
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(built)], check=True, capture_output=True)


# TC-I1, TC-B5
@app_cases
def test_tci1_the_app_starts_the_trees_launcher_with_free_ports_and_the_login_path(built, app_env):
    tree = built / "Contents" / "Resources" / f"coach-{ARCH}"
    before = snapshot(built)
    app = RunningApp(built, app_env)
    try:
        address = app.ready()
        env = launcher_env(app_env)
        assert (fake_out(app_env) / "args").read_text().split() == ["--no-open"]
        assert address == f"http://127.0.0.1:{env['COACH_APP_PORT']}"
        ports = {int(env["COACH_APP_PORT"]), int(env["COACH_AGENT_PORT"])}
        assert len(ports) == 2
        path = env["PATH"].split(":")
        assert path[0] == LOGIN_BIN, path
        assert "/opt/homebrew/bin" in path and "/usr/local/bin" in path
        # shared_home: the learner's own COACH_HOME (here the test's) reaches the launcher unchanged.
        assert env["COACH_HOME"] == app_env["COACH_HOME"]
        assert (fake_out(app_env) / "self").read_text().strip() == str(tree / "bin" / "local-ai-coach")
    finally:
        assert app.quit() == 0
    # TC-B5: running it changed nothing inside the app.
    assert snapshot(built) == before


# TC-I2
@app_cases
def test_tci2_a_busy_port_gets_a_free_one(built, app_env):
    held = socket.socket()
    held.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    try:
        try:
            held.bind(("127.0.0.1", 3000))
            held.listen(1)
        except OSError:
            pass  # something else already holds it, which is the same case
        app = RunningApp(built, app_env)
        try:
            app.ready()
            assert launcher_env(app_env)["COACH_APP_PORT"] != "3000"
        finally:
            app.quit()
    finally:
        held.close()


# TC-I3
@app_cases
def test_tci3_quitting_the_app_stops_the_launcher_and_what_it_started(built, app_env):
    app = RunningApp(built, app_env)
    app.ready()
    launcher = int((fake_out(app_env) / "launcher.pid").read_text())
    child = int((fake_out(app_env) / "child.pid").read_text())
    assert alive(launcher) and alive(child)
    assert app.quit() == 0
    assert wait_gone(launcher) and wait_gone(child)


# TC-I4
@app_cases
def test_tci4_a_coach_that_cannot_start_leaves_the_app_up_until_quit(built, app_env):
    app = RunningApp(built, {**app_env, "FAKE_FAIL": "1"})
    deadline = time.monotonic() + START_WAIT
    while not any("would not start" in line for line in app.lines) and time.monotonic() < deadline:
        time.sleep(0.2)
    assert any("would not start" in line for line in app.lines), app.lines
    time.sleep(1)
    assert app.process.poll() is None, "the app crashed instead of showing the alert"
    assert app.quit() == 0


# TC-B6: not gated, so a plain pytest catches a changed ID before any build.
def test_tcb6_the_app_is_identified_by_the_projects_domain():
    info = plistlib.loads((REPO / "apps" / "mac" / "Info.plist").read_bytes())
    assert info["CFBundleIdentifier"] == BUNDLE_ID


# TC-M1
def test_tcm1_publish_builds_the_notarised_app_after_the_release_and_uploads_the_disk_image(tmp_path):
    notes = tmp_path / "notes.md"
    notes.write_text("made up")
    dry = subprocess.run(["make", "-n", "publish", f"VERSION={VERSION}", "TITLE=made up", f"NOTES={notes}"], cwd=REPO, capture_output=True, text=True, check=False)
    lines = dry.stdout.splitlines()

    def first(fragment: str) -> int:
        return next(i for i, line in enumerate(lines) if fragment in line)

    tested, released = first("test_release.py"), first("build-release.sh")
    mac, upload = first("build-mac-app.sh"), first("gh release create")
    assert tested < released < mac < upload, dry.stdout
    assert "--notarize" in lines[mac]
    assert "Local-AI-Coach-" in lines[upload] and ".dmg" in lines[upload]
    assert first("test_mac_app.py") < released


# ---------------------------------------------------------------- end to end
e2e = pytest.mark.skipif(os.environ.get("COACH_RELEASE_E2E") != "1", reason="set COACH_RELEASE_E2E=1 (builds the release and signs the app)")


def signing_identity() -> bool:
    found = subprocess.run(["security", "find-identity", "-v", "-p", "codesigning"], capture_output=True, text=True, check=False).stdout
    return "Developer ID Application" in found


@pytest.fixture(scope="module")
def signed_app() -> Path:
    env = {**os.environ, "COACH_RELEASE_PLATFORMS": f"darwin-{ARCH}"}
    release = subprocess.run(["bash", str(BUILD_RELEASE), VERSION], env=env, capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False)
    assert release.returncode == 0, release.stderr[-2000:]
    mode = ["--sign"] if signing_identity() else []
    result = build(REPO / "dist", *mode)
    assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-2000:]
    return REPO / "dist" / APP_NAME


def listeners(pids: set[int]) -> list[str]:
    out = subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], capture_output=True, text=True, check=False).stdout
    return [line for line in out.splitlines()[1:] if int(line.split()[1]) in pids]


def tree_pids(root: int) -> set[int]:
    found, todo = set(), [root]
    while todo:
        pid = todo.pop()
        found.add(pid)
        out = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True, check=False).stdout
        todo += [int(p) for p in out.split()]
    return found


# TC-E1, TC-E2
@e2e
def test_tce1_e2_the_signed_app_runs_the_coach_the_browser_suite_passes_and_quit_leaves_nothing(signed_app, tmp_path):
    if signing_identity():
        detail = subprocess.run(["codesign", "-dvv", str(signed_app)], capture_output=True, text=True, check=False).stderr
        assert "Developer ID Application" in detail and "runtime" in detail, detail
    home = tmp_path / "home"
    home.mkdir()
    env = {**session_env(), "HOME": str(home), "COACH_HOME": str(home / ".local-ai-coach")}
    # The browser suite is written against the tests' frozen curriculum (story 13), as in test_release.py.
    env["COACH_CURRICULUM"] = str(REPO / "fixtures" / "curriculum")
    app = RunningApp(signed_app, env)
    try:
        address = app.ready()
        pids = tree_pids(app.process.pid)
        mine = listeners(pids)
        assert len(mine) >= 2 and all("127.0.0.1:" in line for line in mine), mine
        browse = subprocess.run(
            ["npx", "playwright", "test"], cwd=REPO / "apps" / "app",
            env={**os.environ, "E2E_BASE_URL": address, "COACH_E2E_HOME": str(home / ".local-ai-coach")},
            capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False,
        )
        if browse.returncode != 0:
            (Path(os.environ.get("TMPDIR", "/tmp")) / "mac-app-browse.out").write_text(browse.stdout + browse.stderr)
        assert browse.returncode == 0, browse.stdout[-3000:]
    finally:
        pids = tree_pids(app.process.pid)
        assert app.quit() == 0
    # TC-E2: nothing the app started is left, and its ports are free again.
    assert all(wait_gone(pid) for pid in pids), [p for p in pids if alive(p)]
    port = int(address.rsplit(":", 1)[1])
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", port))


def test_tcm1_make_can_run_the_build_script_itself():
    """make runs scripts/build-mac-app.sh directly, not through bash (found when v0.1.10's publish stopped)."""
    assert os.access(BUILD_APP, os.X_OK)
    mode = subprocess.run(["git", "ls-files", "-s", str(BUILD_APP)], cwd=REPO, capture_output=True, text=True, check=True).stdout.split()[0]
    assert mode == "100755", mode
