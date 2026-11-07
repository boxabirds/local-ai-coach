"""The release: build, installer and launcher (Ceetrix stories 6, 31 and 32).

Unit cases run the real install.sh and launcher as subprocesses against a fake
release (one archive per platform, its page server and its bundled Python fake
executables) served from file:// URLs, with uname faked, so they test the
scripts' decisions without the network.

The end-to-end cases (COACH_RELEASE_E2E=1) build the real release for this
machine, install it into a temporary HOME, start it and run the Playwright
suite against it. The build downloads its pinned inputs (CPython, uv and the
agent's wheels) once into its cache; the install downloads nothing but the
archive. COACH_RELEASE_ALL_PLATFORMS=1 also builds and inspects all four.
"""

from __future__ import annotations

import hashlib
import os
import pty
import select
import signal
import shutil
import socket
import subprocess
import sys
import tarfile
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
INSTALL = REPO / "install.sh"
LAUNCHER = REPO / "scripts" / "local-ai-coach"
BUILD = REPO / "scripts" / "build-release.sh"
RUN_TIMEOUT = 60
VERSION = "9.9.9-test"
FAKE_SLEEP = 6017  # an unusual number, so the leftover-process check matches only our fakes

SUPPORTED = [
    ("Darwin", "arm64", "darwin-arm64"),
    ("Darwin", "x86_64", "darwin-x64"),
    ("Linux", "x86_64", "linux-x64"),
    ("Linux", "aarch64", "linux-arm64"),
]
BUNDLED_PYTHON = Path("python") / "bin" / "python3"

# The platform the fakes' default uname (Darwin arm64) asks for.
HERE_PLATFORM = "darwin-arm64"


def archive_name(platform: str) -> str:
    return f"local-ai-coach-{platform}.tar.gz"


# ------------------------------------------------------------------ fakes


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_exe(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/bin/sh\n" + body + "\n")
    path.chmod(0o755)


def tar_dir(src: Path, out: Path, top: str | None = None) -> None:
    with tarfile.open(out, "w:gz") as tar:
        if top:
            tar.add(src, arcname=top)
        else:
            for child in src.iterdir():
                tar.add(child, arcname=child.name)


class Fakes:
    """A fake release (one archive per platform), laid out like its real download site.

    Each archive's bundled Python is a script that logs its arguments to python_log and
    either serves (for -m uvicorn) or answers the installer's check (exit 0 or 1)."""

    def __init__(self, root: Path, *, agent_check_ok: bool = True, server_body: str = f"sleep {FAKE_SLEEP}", agent_body: str = f"sleep {FAKE_SLEEP}"):
        self.root = root
        self.release = root / "release"
        self.release.mkdir(parents=True, exist_ok=True)
        self.python_log = root / "python-args.log"
        check = "exit 0" if agent_check_ok else "echo 'ImportError: this computer is too old' >&2; exit 1"

        for _, _, platform in SUPPORTED:
            tree = root / f"tree-{platform}"
            shutil.copy(LAUNCHER, (tree / "bin").mkdir(parents=True) or tree / "bin" / "local-ai-coach")
            (tree / "bin" / "local-ai-coach").chmod(0o755)
            write_exe(tree / "bin" / "coach-web", f"# fake page server for {platform}\n{server_body}")
            (tree / "VERSION").write_text(VERSION + "\n")
            (tree / "apps" / "agent").mkdir(parents=True)
            (tree / "apps" / "agent" / "main.py").write_text("app = None\n")
            write_exe(
                tree / BUNDLED_PYTHON,
                f'printf "%s\\n" "$*" >> "{self.python_log}"\ncase "$*" in *"-m uvicorn"*) {agent_body} ;; *) {check} ;; esac',
            )
            (tree / "python" / "lib" / "python3.12" / "site-packages").mkdir(parents=True)
            (tree / "web").mkdir()
            (tree / "web" / "index.html").write_text("<!doctype html>\n")
            tar_dir(tree, self.release / archive_name(platform))
            self.write_release_sum(platform)

    def write_release_sum(self, platform: str = HERE_PLATFORM, value: str | None = None) -> None:
        archive = self.release / archive_name(platform)
        (self.release / f"{archive.name}.sha256").write_text(f"{value or sha256(archive)}  {archive.name}\n")

    def env(self, home: Path, *, os_name: str = "Darwin", cpu: str = "arm64") -> dict[str, str]:
        shim = self.root / "shim"
        write_exe(shim / "uname", f'case "$1" in -s) echo {os_name} ;; -m) echo {cpu} ;; *) echo {os_name} ;; esac')
        return {
            **os.environ,
            "HOME": str(home),
            "PATH": f"{shim}:{os.environ['PATH']}",
            "COACH_RELEASE_BASE": f"file://{self.release}",
        }

    def python_calls(self) -> list[str]:
        return self.python_log.read_text().splitlines() if self.python_log.exists() else []


def run(cmd: list[str], env: dict[str, str], timeout: int = RUN_TIMEOUT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=timeout, check=False)


def install(fakes: Fakes, home: Path, **kw) -> subprocess.CompletedProcess[str]:
    return run(["sh", str(INSTALL)], fakes.env(home, **kw))


def snapshot_tree(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return {str(p.relative_to(path)): sha256(p) for p in sorted(path.rglob("*")) if p.is_file() and not p.is_symlink()}


@pytest.fixture
def home(tmp_path: Path) -> Path:
    h = tmp_path / "home"
    h.mkdir()
    return h


# ------------------------------------------------------------------ installer (unit)


@pytest.mark.parametrize("os_name,cpu,platform", SUPPORTED)
def test_tc01_plan_picks_the_assets_for_each_supported_system(tmp_path, home, os_name, cpu, platform):
    fakes = Fakes(tmp_path)
    result = run(["sh", str(INSTALL), "--plan"], fakes.env(home, os_name=os_name, cpu=cpu))
    assert result.returncode == 0, result.stderr
    # Stories 31 and 32: the page's server and the agent's Python are in the archive, so it is the only download.
    assert result.stdout.strip().splitlines() == [f"release file://{fakes.release}/{archive_name(platform)}"]
    assert "node" not in result.stdout.lower() and "uv" not in result.stdout.lower()


@pytest.mark.parametrize("os_name,cpu,platform", SUPPORTED)
def test_s32_tc16_install_fetches_only_the_archive_and_sets_up_no_python(tmp_path, home, os_name, cpu, platform):
    fakes = Fakes(tmp_path)
    env = fakes.env(home, os_name=os_name, cpu=cpu)
    fetched = tmp_path / "fetched.log"
    write_exe(fakes.root / "shim" / "curl", f'printf "%s\\n" "$*" >> "{fetched}"\nexec {shutil.which("curl")} "$@"')
    result = run(["sh", str(INSTALL)], env)
    assert result.returncode == 0, result.stderr
    urls = [arg for line in fetched.read_text().splitlines() for arg in line.split() if arg.startswith("file://")]
    assert urls == [f"file://{fakes.release}/{archive_name(platform)}", f"file://{fakes.release}/{archive_name(platform)}.sha256"]
    out = result.stdout + result.stderr
    assert "uv" not in out.lower() and "Checking the coach runs on this computer" in out
    root = home / ".local-ai-coach"
    assert not (root / "python").exists() and not (root / "app" / "uv").exists()
    # The check ran the platform's own bundled Python, isolated, on the agent.
    assert len(fakes.python_calls()) == 1 and fakes.python_calls()[0].startswith("-I -B")
    assert (root / "app" / "release" / BUNDLED_PYTHON).exists()


def test_s32_tc16b_an_install_tidies_the_python_older_installs_kept(tmp_path, home):
    """Installs before story 32 had uv put a Python in ~/.local-ai-coach/python."""
    fakes = Fakes(tmp_path)
    old_python = home / ".local-ai-coach" / "python" / "cpython-3.12-macos" / "bin" / "python3"
    old_python.parent.mkdir(parents=True)
    old_python.write_text("x")
    progress = home / ".local-ai-coach" / "progress.json"
    progress.write_text("{}")
    assert install(fakes, home).returncode == 0
    assert not (home / ".local-ai-coach" / "python").exists()
    assert progress.read_text() == "{}"


@pytest.mark.parametrize("os_name,cpu,platform", SUPPORTED)
def test_s31_tc11_install_unpacks_this_machines_server_and_downloads_no_node(tmp_path, home, os_name, cpu, platform):
    fakes = Fakes(tmp_path)
    result = install(fakes, home, os_name=os_name, cpu=cpu)
    assert result.returncode == 0, result.stderr
    assert "node" not in (result.stdout + result.stderr).lower()
    server = home / ".local-ai-coach" / "app" / "release" / "bin" / "coach-web"
    assert f"fake page server for {platform}" in server.read_text()
    assert not (home / ".local-ai-coach" / "app" / "node").exists()


@pytest.mark.parametrize("os_name,cpu", [("MINGW64_NT-10.0", "x86_64"), ("Darwin", "ppc"), ("FreeBSD", "amd64")])
def test_tc02_unsupported_system_stops_before_downloading(tmp_path, home, os_name, cpu):
    fakes = Fakes(tmp_path)
    result = install(fakes, home, os_name=os_name, cpu=cpu)
    assert result.returncode != 0
    assert "not supported" in result.stderr and "macOS" in result.stderr and "Linux" in result.stderr
    assert "Downloading" not in result.stdout
    assert not (home / ".local-ai-coach").exists()


def test_tc03_a_checksum_mismatch_installs_nothing(tmp_path, home):
    fakes = Fakes(tmp_path)
    fakes.write_release_sum(value="0" * 64)
    result = install(fakes, home)
    assert result.returncode != 0
    assert f"{archive_name(HERE_PLATFORM)} could not be verified" in result.stderr
    assert snapshot_tree(home / ".local-ai-coach") == {}
    assert not (home / ".local" / "bin" / "local-ai-coach").exists()


def test_tc04_a_missing_download_leaves_the_earlier_install(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    before = snapshot_tree(home / ".local-ai-coach")
    (fakes.release / archive_name(HERE_PLATFORM)).unlink()
    result = install(fakes, home)
    assert result.returncode != 0
    assert "could not download" in result.stderr and archive_name(HERE_PLATFORM) in result.stderr
    assert snapshot_tree(home / ".local-ai-coach") == before


def test_tc07_an_agent_that_cannot_run_here_keeps_the_earlier_install(tmp_path, home):
    good = Fakes(tmp_path / "good")
    assert install(good, home).returncode == 0
    before = snapshot_tree(home / ".local-ai-coach")
    link_before = os.readlink(home / ".local-ai-coach" / "app")
    bad = Fakes(tmp_path / "bad", agent_check_ok=False)
    result = install(bad, home)
    assert result.returncode != 0
    assert "the coach's agent could not run on this computer" in result.stderr
    assert "Any earlier install was kept" in result.stderr
    assert "this computer is too old" in result.stderr  # the reason is passed on
    assert os.readlink(home / ".local-ai-coach" / "app") == link_before
    assert snapshot_tree(home / ".local-ai-coach") == before
    assert len(list((home / ".local-ai-coach").glob("app-*"))) == 1


def test_s32_tc07b_an_agent_that_cannot_run_here_installs_nothing(tmp_path, home):
    bad = Fakes(tmp_path, agent_check_ok=False)
    result = install(bad, home)
    assert result.returncode != 0
    assert "the coach's agent could not run on this computer" in result.stderr
    assert not (home / ".local-ai-coach" / "app").exists()
    assert list((home / ".local-ai-coach").glob("app-*")) == []
    assert not (home / ".local" / "bin" / "local-ai-coach").exists()


def test_install_links_the_command_and_a_reinstall_replaces_the_version(tmp_path, home):
    fakes = Fakes(tmp_path)
    first = install(fakes, home)
    assert first.returncode == 0, first.stderr
    assert f"Installed version {VERSION}" in first.stdout
    link = home / ".local" / "bin" / "local-ai-coach"
    assert link.is_symlink()
    old_target = os.readlink(home / ".local-ai-coach" / "app")
    assert install(fakes, home).returncode == 0
    new_target = os.readlink(home / ".local-ai-coach" / "app")
    assert new_target != old_target and not Path(old_target).exists()
    assert len(list((home / ".local-ai-coach").glob("app-*"))) == 1


# ------------------------------------------------------------------ launcher (unit)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def launcher_env(fakes: Fakes, home: Path, **extra: str) -> dict[str, str]:
    env = fakes.env(home)
    env.update({"COACH_APP_PORT": str(free_port()), "COACH_AGENT_PORT": str(free_port()), "COACH_HOME": str(home / ".local-ai-coach")})
    env.update(extra)
    env.pop("COACH_CURRICULUM", None)  # the installed coach reads the curriculum it ships with
    return env


def command(home: Path) -> str:
    return str(home / ".local" / "bin" / "local-ai-coach")


def fake_processes_running() -> bool:
    return subprocess.run(["pgrep", "-f", f"sleep {FAKE_SLEEP}"], capture_output=True, check=False).returncode == 0


@pytest.mark.parametrize("busy", ["COACH_APP_PORT", "COACH_AGENT_PORT"])
def test_tc08_a_busy_port_is_named_and_nothing_starts(tmp_path, home, busy):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        result = run([command(home), "--no-open"], launcher_env(fakes, home, **{busy: str(port)}))
    assert result.returncode != 0
    assert f"port {port} is already in use" in result.stderr and busy in result.stderr
    assert "Starting the coach" not in result.stdout


def test_tc09_a_coach_that_never_starts_is_stopped_at_the_timeout(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    started = time.monotonic()
    result = run([command(home), "--no-open"], launcher_env(fakes, home, COACH_START_TIMEOUT="2"))
    took = time.monotonic() - started
    assert result.returncode != 0
    assert "did not start within 2s" in result.stderr
    assert 2 <= took < 20
    time.sleep(0.5)
    assert not fake_processes_running(), "a fake server was left running"


CTRL_C = b"\x03"
STOP_TIMEOUT = 10
SETTLE = 2.5  # seconds: long enough that the stop lands inside the launcher's wait loop
# Apple's bash 3.2 is what testers have; a newer bash may come first on a developer's PATH.
BASHES = [b for b in ("/bin/bash", shutil.which("bash")) if b and Path(b).exists()]
BASHES = sorted(set(BASHES), key=BASHES.index)


def start_in_terminal(argv: list[str], env: dict[str, str], ready: bytes, timeout: int = RUN_TIMEOUT) -> tuple[int, int, bytes]:
    """Start argv on a pseudo-terminal, as a tester's Terminal window does, and read until ready."""
    pid, fd = pty.fork()
    if pid == 0:  # pragma: no cover - the child process
        os.execve(argv[0], argv, env)
    out, end = b"", time.monotonic() + timeout
    while ready not in out and time.monotonic() < end:
        try:
            if select.select([fd], [], [], 1)[0]:
                out += os.read(fd, 4096)
        except OSError:
            break
    return pid, fd, out


def wait_for_exit(pid: int, fd: int) -> tuple[int | None, bytes]:
    out, end = b"", time.monotonic() + STOP_TIMEOUT
    while time.monotonic() < end:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            return os.waitstatus_to_exitcode(status), out
        try:
            if select.select([fd], [], [], 0.2)[0]:
                out += os.read(fd, 4096)
        except OSError:
            pass
    os.kill(pid, signal.SIGKILL)
    os.waitpid(pid, 0)
    subprocess.run(["pkill", "-f", f"sleep {FAKE_SLEEP}"], check=False)  # so one failure does not fail the next case
    return None, out


def healthy_env(fakes: Fakes, home: Path) -> dict[str, str]:
    """The launcher's environment with a curl that reports both parts healthy."""
    env = launcher_env(fakes, home)
    write_exe(fakes.root / "shim" / "curl", "exit 0")
    return env


@pytest.mark.parametrize("bash", BASHES)
@pytest.mark.parametrize("stop", ["ctrl-c", "close-window"])
def test_tc15_stopping_from_the_terminal_is_clean(tmp_path, home, stop, bash):
    """Ctrl-C (SIGINT to the terminal's foreground group) and closing the window (SIGHUP) stop everything, with no error."""
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    pid, fd, out = start_in_terminal([bash, command(home), "--no-open"], healthy_env(fakes, home), b"Press Ctrl-C")
    assert b"The coach is running at" in out, out
    time.sleep(SETTLE)
    if stop == "ctrl-c":
        os.write(fd, CTRL_C)
    else:
        os.kill(pid, signal.SIGHUP)
    code, rest = wait_for_exit(pid, fd)
    os.close(fd)
    assert code is not None, "the launcher was still running after the stop"
    assert b"stopped unexpectedly" not in rest, rest
    if stop == "ctrl-c":
        assert code == 0, rest
    time.sleep(0.5)
    assert not fake_processes_running(), "a fake server was left running"


def test_s32_tc17_the_launcher_runs_the_bundled_python_isolated(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    env = healthy_env(fakes, home)
    pid, fd, out = start_in_terminal(["/bin/bash", command(home), "--no-open"], env, b"Press Ctrl-C")
    try:
        assert b"The coach is running at" in out, out
        release = home / ".local-ai-coach" / "app" / "release"  # through the app link, as the command finds it
        agent_call = [c for c in fakes.python_calls() if "-m uvicorn" in c]
        assert agent_call == [f"-I -B -m uvicorn --app-dir {release}/apps/agent main:app --host 127.0.0.1 --port {env['COACH_AGENT_PORT']}"]
    finally:
        os.write(fd, CTRL_C)
        wait_for_exit(pid, fd)
        os.close(fd)


def test_tc10_version(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    result = run([command(home), "--version"], fakes.env(home))
    assert result.returncode == 0 and result.stdout.strip() == VERSION


def test_tc11_uninstall_keeps_progress(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    progress = home / ".local-ai-coach" / "progress.stub.json"
    progress.write_text('{"stations": {"machine": {"status": "reported"}}}')
    before = progress.read_bytes()
    result = run([command(home), "uninstall"], fakes.env(home))
    assert result.returncode == 0
    assert "progress is still in" in result.stdout
    assert not (home / ".local-ai-coach" / "app").exists()
    assert list((home / ".local-ai-coach").glob("app-*")) == []
    assert not (home / ".local" / "bin" / "local-ai-coach").exists()
    assert progress.read_bytes() == before


def test_s32_uninstall_also_removes_the_python_older_installs_kept(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    (home / ".local-ai-coach" / "python").mkdir()
    assert run([command(home), "uninstall"], fakes.env(home)).returncode == 0
    assert not (home / ".local-ai-coach" / "python").exists()


def test_unknown_option_is_refused(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    result = run([command(home), "--frobnicate"], fakes.env(home))
    assert result.returncode != 0 and "unknown option" in result.stderr


# ------------------------------------------------------------------ build (unit)


@pytest.mark.parametrize("bad", ["web/node_modules/x/lib/thing.node", "apps/agent/.env", "web/.env.local"])
def test_tc06_check_tree_refuses_native_modules_and_env_files(tmp_path, bad):
    tree = tmp_path / "tree"
    (tree / bad).parent.mkdir(parents=True)
    (tree / bad).write_text("x")
    (tree / ".env.example").write_text("OPENAI_API_KEY=\n")
    result = subprocess.run(["bash", str(BUILD), "--check-tree", str(tree)], capture_output=True, text=True, check=False)
    assert result.returncode != 0
    assert bad.split("/")[-1] in result.stderr


def test_tc06b_check_tree_accepts_a_clean_tree_with_an_env_template(tmp_path):
    tree = tmp_path / "tree"
    tree.mkdir()
    (tree / ".env.example").write_text("OPENAI_API_KEY=\n")
    result = subprocess.run(["bash", str(BUILD), "--check-tree", str(tree)], capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr


def fetch_pinned(url: str, file: Path, want: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["bash", str(BUILD), "--fetch-pinned", url, str(file), want], capture_output=True, text=True, check=False)


def test_s32_tc18_a_build_input_with_the_wrong_fingerprint_is_refused(tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "cpython.tar.gz").write_bytes(b"not the pinned build")
    target = tmp_path / "cache" / "cpython.tar.gz"
    target.parent.mkdir()
    result = fetch_pinned(f"file://{site}/cpython.tar.gz", target, hashlib.sha256(b"the pinned build").hexdigest())
    assert result.returncode != 0
    assert "cpython.tar.gz could not be verified" in result.stderr
    assert list(target.parent.iterdir()) == []  # nothing kept, not even the partial download


def test_s32_tc18b_a_corrupt_cached_input_is_fetched_again(tmp_path):
    good = b"the pinned build"
    site = tmp_path / "site"
    site.mkdir()
    (site / "cpython.tar.gz").write_bytes(good)
    target = tmp_path / "cpython.tar.gz"
    target.write_bytes(b"truncated")
    result = fetch_pinned(f"file://{site}/cpython.tar.gz", target, hashlib.sha256(good).hexdigest())
    assert result.returncode == 0, result.stderr
    assert target.read_bytes() == good


def test_s32_tc18c_a_good_cached_input_is_used_without_downloading(tmp_path):
    good = b"the pinned build"
    target = tmp_path / "cpython.tar.gz"
    target.write_bytes(good)
    result = fetch_pinned(f"file://{tmp_path}/nowhere/cpython.tar.gz", target, hashlib.sha256(good).hexdigest())
    assert result.returncode == 0, result.stderr
    assert target.read_bytes() == good


def test_s32_a_fresh_dist_survives_a_folder_that_cannot_be_emptied(tmp_path):
    """Bug, 2026-11-07: the build failed with "rm: dist/...: Directory not empty" when Finder
    wrote a .DS_Store into dist while it was being deleted. Here a folder inside the old dist
    cannot be emptied (no write permission), which fails a plain rm -rf the same way."""
    dist = tmp_path / "dist"
    stuck = dist / "release-darwin-arm64" / "python"
    stuck.mkdir(parents=True)
    (stuck / ".DS_Store").write_text("x")
    (dist / "local-ai-coach-darwin-arm64.tar.gz").write_text("old")
    stuck.chmod(0o500)
    try:
        result = subprocess.run(["bash", str(BUILD), "--fresh-dist", str(dist)], capture_output=True, text=True, check=False)
        assert result.returncode == 0, result.stderr
        assert dist.is_dir() and list(dist.iterdir()) == []
    finally:
        for p in tmp_path.rglob("*"):
            if p.is_dir():
                p.chmod(0o700)


def test_s32_tc18d_the_build_stops_before_building_when_an_input_fails(tmp_path):
    site = tmp_path / "site" / "0.13.7"
    site.mkdir(parents=True)
    for name in ("uv-aarch64-apple-darwin.tar.gz", "uv-x86_64-apple-darwin.tar.gz", "uv-x86_64-unknown-linux-gnu.tar.gz", "uv-aarch64-unknown-linux-gnu.tar.gz"):
        (site / name).write_bytes(b"tampered")
    env = {**os.environ, "COACH_RELEASE_CACHE": str(tmp_path / "cache"), "COACH_UV_BASE": f"file://{tmp_path / 'site'}", "COACH_RELEASE_PLATFORMS": "linux-x64"}
    result = subprocess.run(["bash", str(BUILD), VERSION], env=env, capture_output=True, text=True, timeout=RUN_TIMEOUT, check=False)
    assert result.returncode != 0
    assert "could not be verified" in result.stderr and "uv-" in result.stderr
    assert "Building the stub coach's page" not in result.stdout


# ------------------------------------------------------------------ end to end (opt-in)

e2e = pytest.mark.skipif(os.environ.get("COACH_RELEASE_E2E") != "1", reason="set COACH_RELEASE_E2E=1 (builds; downloads the pinned inputs once)")
all_platforms = pytest.mark.skipif(
    os.environ.get("COACH_RELEASE_E2E") != "1" or os.environ.get("COACH_RELEASE_ALL_PLATFORMS") != "1",
    reason="set COACH_RELEASE_E2E=1 and COACH_RELEASE_ALL_PLATFORMS=1 (builds all four archives)",
)
BUNDLED_VERSION = "3.12.16"
BUILD_TIMEOUT = 900
# What a reinstall must leave alone: the learner's record, Restart coach's archive and ratings.
LEARNER_OWNS = ("progress.stub.json", "consent.json", "old", "ratings")
START_WAIT = 90


def this_platform() -> str:
    system = {"Darwin": "darwin", "Linux": "linux"}[os.uname().sysname]
    cpu = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64"}[os.uname().machine]
    return f"{system}-{cpu}"


@pytest.fixture(scope="module")
def built_release() -> Path:
    env = {**os.environ, "COACH_RELEASE_PLATFORMS": this_platform()}
    result = subprocess.run(["bash", str(BUILD), VERSION], env=env, capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False)
    assert result.returncode == 0, result.stderr[-2000:]
    return REPO / "dist"


def real_install(dist: Path, home: Path) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "HOME": str(home), "COACH_RELEASE_BASE": f"file://{dist}"}
    return subprocess.run(["sh", str(INSTALL)], env=env, capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False)


@e2e
def test_tc05_archive_contents(built_release):
    archive = built_release / archive_name(this_platform())
    with tarfile.open(archive) as tar:
        names = tar.getnames()
    for needed in ("./VERSION", "./bin/local-ai-coach", "./bin/coach-web", "./web/index.html", "./apps/agent/main.py", "./curriculum/stations.json", f"./{BUNDLED_PYTHON}"):
        assert needed in names, needed
    # Story 32: the agent's packages are installed and compiled, and no uv comes along.
    assert any(n.startswith("./python/lib/python3.12/site-packages/fastapi/") for n in names)
    assert any(n.startswith("./apps/agent/__pycache__/main.cpython-312") for n in names)
    assert not [n for n in names if n.split("/")[-1] in ("uv", "uvx")]
    assert any(n.endswith(".js") and n.startswith("./web/") for n in names)
    assert not [n for n in names if n.endswith(".map")], "source maps in the archive"
    assert not [n for n in names if n.endswith(".node")]
    assert not [n for n in names if n.split("/")[-1] == ".env" or (n.split("/")[-1].startswith(".env.") and not n.endswith(".env.example"))]
    assert not [n for n in names if n.startswith(("./apps/agent/tests", "./apps/agent/.venv"))]
    assert not [n for n in names if n.split("/")[-1].startswith("._")], "macOS metadata files in the archive"
    assert (built_release / f"{archive.name}.sha256").read_text().split()[0] == sha256(archive)


def unpacked(dist: Path, platform: str, into: Path) -> Path:
    with tarfile.open(dist / archive_name(platform)) as tar:
        tar.extractall(into, filter="tar")
    return into


def locked_pins() -> dict[str, str]:
    """name -> version for every package uv.lock installs for the agent (no dev group) on
    this computer: a package whose marker excludes it here (pywin32 on Windows only) is left out."""
    from packaging.requirements import Requirement

    out = subprocess.run(["uv", "export", "--frozen", "--no-dev", "--no-emit-project", "--no-hashes", "--format", "requirements-txt"],
                         cwd=REPO / "apps" / "agent", capture_output=True, text=True, check=True).stdout
    pins = {}
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-")):
            continue
        req = Requirement(line)
        if req.marker is None or req.marker.evaluate():
            pins[req.name.lower().replace("_", "-")] = str(req.specifier).removeprefix("==")
    return pins


@e2e
def test_s32_tc20_the_bundled_packages_are_the_locked_ones(built_release, tmp_path):
    tree = unpacked(built_release, this_platform(), tmp_path / "tree")
    listing = subprocess.run(
        [str(tree / BUNDLED_PYTHON), "-I", "-B", "-c",
         "import importlib.metadata as m, platform; print(platform.python_version()); "
         "[print(d.metadata['Name'], d.version) for d in m.distributions()]"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    assert listing[0] == BUNDLED_VERSION
    bundled = {name.lower().replace("_", "-"): version for name, version in (line.rsplit(" ", 1) for line in listing[1:])}
    pins = locked_pins()
    # Every locked package is bundled at its locked version; nothing else is, apart from CPython's own pip.
    assert {n: bundled.get(n) for n in pins} == pins
    assert set(bundled) - set(pins) <= {"pip"}, sorted(set(bundled) - set(pins))


@e2e
def test_s32_tc21_the_environment_cannot_change_what_the_bundled_python_loads(built_release, tmp_path):
    tree = unpacked(built_release, this_platform(), tmp_path / "tree")
    planted = tmp_path / "planted"
    (planted / "fastapi").mkdir(parents=True)
    (planted / "fastapi" / "__init__.py").write_text("raise SystemExit('planted fastapi loaded')\n")
    env = {**os.environ, "PYTHONPATH": str(planted), "PYTHONHOME": str(planted), "PYTHONSTARTUP": str(planted / "fastapi" / "__init__.py")}
    # The launcher's flags, run from a folder that also holds the planted package.
    result = subprocess.run([str(tree / BUNDLED_PYTHON), "-I", "-B", "-c", "import fastapi; print(fastapi.__file__)"],
                            cwd=planted, env=env, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip().startswith(str(tree.resolve() / "python")), result.stdout


@e2e
def test_s32_tc07c_a_real_bundle_that_cannot_import_the_agent_is_refused(built_release, tmp_path):
    """The real check with the real bundled Python: an archive missing one of the agent's
    packages is refused, and the earlier (good) install stays in place and runs."""
    home = tmp_path / "home"
    home.mkdir()
    assert real_install(built_release, home).returncode == 0
    link_before = os.readlink(home / ".local-ai-coach" / "app")

    broken = tmp_path / "broken-site"
    broken.mkdir()
    tree = unpacked(built_release, this_platform(), tmp_path / "tree")
    shutil.rmtree(tree / "python" / "lib" / "python3.12" / "site-packages" / "fastapi")
    name = archive_name(this_platform())
    with tarfile.open(broken / name, "w:gz") as tar:
        for child in tree.iterdir():
            tar.add(child, arcname=f"./{child.name}")
    (broken / f"{name}.sha256").write_text(f"{sha256(broken / name)}  {name}\n")

    result = real_install(broken, home)
    assert result.returncode != 0
    assert "the coach's agent could not run on this computer" in result.stderr
    assert "fastapi" in result.stderr  # Python's own reason is passed on
    assert os.readlink(home / ".local-ai-coach" / "app") == link_before
    assert len(list((home / ".local-ai-coach").glob("app-*"))) == 1
    assert run([command(home), "--version"], {**os.environ, "HOME": str(home)}).stdout.strip() == VERSION


# What `file` says a native extension built for each platform is.
NATIVE_KIND = {
    "darwin-arm64": ("Mach-O", "arm64"),
    "darwin-x64": ("Mach-O", "x86_64"),
    "linux-x64": ("ELF", "x86-64"),
    "linux-arm64": ("ELF", "aarch64"),
}


@pytest.fixture(scope="module")
def all_built(tmp_path_factory) -> Path:
    env = {**os.environ, "COACH_RELEASE_PLATFORMS": " ".join(NATIVE_KIND)}
    result = subprocess.run(["bash", str(BUILD), VERSION], env=env, capture_output=True, text=True, timeout=BUILD_TIMEOUT * 4, check=False)
    assert result.returncode == 0, result.stderr[-2000:]
    return REPO / "dist"


@all_platforms
@pytest.mark.parametrize("platform", list(NATIVE_KIND))
def test_s32_tc22_each_archive_bundles_its_own_platforms_python(all_built, platform, tmp_path):
    tree = unpacked(all_built, platform, tmp_path / platform)
    natives = sorted((tree / "python").rglob("*.so")) + [tree / BUNDLED_PYTHON.parent / "python3.12"]
    assert len(natives) > 1
    fmt, cpu = NATIVE_KIND[platform]
    # One file at a time: a universal Mac binary (wheels built as universal2) prints a line per CPU.
    kinds = {p: subprocess.run(["file", "-bL", str(p)], capture_output=True, text=True, check=True).stdout for p in natives}
    wrong = [f"{p.name}: {k}" for p, k in kinds.items() if fmt not in k or cpu not in k]
    assert not wrong, wrong[:5]


@e2e
def test_tc12_to_tc14_install_run_browse_reinstall(built_release, tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    first = real_install(built_release, home)
    assert first.returncode == 0, first.stderr[-2000:]

    app_port, agent_port = free_port(), free_port()
    # The installed coach keeps progress in its default place, ~/.local-ai-coach under this HOME,
    # which is where the browser suite looks; the test-wide COACH_HOME must not leak in.
    env = {**os.environ, "HOME": str(home), "COACH_HOME": str(home / ".local-ai-coach"), "COACH_APP_PORT": str(app_port), "COACH_AGENT_PORT": str(agent_port)}
    # The browser suite is written against the tests' frozen curriculum (story 13), as it is
    # when it starts its own servers; that the release ships the real one is TC-05's check.
    env["COACH_CURRICULUM"] = str(REPO / "fixtures" / "curriculum")
    coach = subprocess.Popen([command(home), "--no-open"], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        deadline = time.monotonic() + START_WAIT
        # Wait for both parts, as the launcher does before it opens the browser:
        # the agent's first start after an install is slower than the page server's.
        urls = [f"http://127.0.0.1:{app_port}/api/health", f"http://127.0.0.1:{agent_port}/health"]
        while time.monotonic() < deadline:
            ok = all(subprocess.run(["curl", "-fs", "-o", "/dev/null", url], check=False).returncode == 0 for url in urls)
            if ok:
                break
            time.sleep(1)
        else:
            pytest.fail("installed coach did not start")

        # TC-12: both parts listen on loopback only.
        listeners = subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], capture_output=True, text=True, check=False).stdout
        mine = [line for line in listeners.splitlines() if f":{app_port} " in line + " " or f":{agent_port} " in line + " "]
        assert mine and all("127.0.0.1:" in line for line in mine), mine

        # TC-13: the browser suite against the installed coach.
        browse = subprocess.run(
            ["npx", "playwright", "test"],
            cwd=REPO / "apps" / "app",
            env={**os.environ, "E2E_BASE_URL": f"http://127.0.0.1:{app_port}", "COACH_E2E_HOME": str(home / ".local-ai-coach")},
            capture_output=True,
            text=True,
            timeout=BUILD_TIMEOUT,
            check=False,
        )
        if browse.returncode != 0:
            (Path(os.environ.get("TMPDIR", "/tmp")) / "release-browse.out").write_text(browse.stdout + browse.stderr)
        assert browse.returncode == 0, browse.stdout[-3000:]
    finally:
        coach.terminate()
        coach.wait(timeout=30)

    # TC-14: reinstall keeps everything the learner owns byte for byte. The suite's Restart
    # coach case moves progress into old/<stamp>/, so the learner's files are compared whole.
    learner = home / ".local-ai-coach"
    (learner / "progress.stub.json").write_text('{"stations": {"machine": {"status": "reported"}}}')
    owned = lambda: {k: v for k, v in snapshot_tree(learner).items() if k.split("/")[0] in LEARNER_OWNS or k in LEARNER_OWNS}
    before = owned()
    assert "progress.stub.json" in before and any(k.startswith("old/") for k in before) and any(k.startswith("ratings/") for k in before), sorted(before)
    again = real_install(built_release, home)
    assert again.returncode == 0, again.stderr[-2000:]
    assert owned() == before
