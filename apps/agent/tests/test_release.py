"""The release: build, installer and launcher (Ceetrix story 6).

Unit cases run the real install.sh and launcher as subprocesses against a fake
release, fake Node and fake uv served from file:// URLs, with uname faked, so
they test the scripts' decisions without the network.

The end-to-end cases (COACH_RELEASE_E2E=1) build the real release, install it
into a temporary HOME with the real pinned Node and uv, start it and run the
Playwright suite against it. They download about 100 MB.
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
import tarfile
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
INSTALL = REPO / "install.sh"
LAUNCHER = REPO / "scripts" / "local-ai-coach"
BUILD = REPO / "scripts" / "build-release.sh"
NODE_VERSION = "24.22.2"
UV_VERSION = "0.13.7"
RUN_TIMEOUT = 60
VERSION = "9.9.9-test"
FAKE_SLEEP = 6017  # an unusual number, so the leftover-process check matches only our fakes

SUPPORTED = [
    ("Darwin", "arm64", "darwin-arm64", "aarch64-apple-darwin"),
    ("Darwin", "x86_64", "darwin-x64", "x86_64-apple-darwin"),
    ("Linux", "x86_64", "linux-x64", "x86_64-unknown-linux-gnu"),
    ("Linux", "aarch64", "linux-arm64", "aarch64-unknown-linux-gnu"),
]


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
    """A fake release, Node and uv laid out like their real download sites."""

    def __init__(self, root: Path, *, uv_sync_ok: bool = True, node_body: str = f"sleep {FAKE_SLEEP}", uv_run_body: str = f"sleep {FAKE_SLEEP}"):
        self.root = root
        self.release = root / "release"
        self.node = root / "node"
        self.uv = root / "uv"
        for d in (self.release, self.node / f"v{NODE_VERSION}", self.uv / UV_VERSION):
            d.mkdir(parents=True, exist_ok=True)

        tree = root / "tree"
        shutil.copy(LAUNCHER, (tree / "bin").mkdir(parents=True) or tree / "bin" / "local-ai-coach")
        (tree / "bin" / "local-ai-coach").chmod(0o755)
        (tree / "VERSION").write_text(VERSION + "\n")
        (tree / "apps" / "agent").mkdir(parents=True)
        (tree / "server" / "apps" / "app").mkdir(parents=True)
        (tree / "server" / "apps" / "app" / "server.js").write_text("// fake\n")
        tar_dir(tree, self.release / "local-ai-coach.tar.gz")
        self.write_release_sum()

        for _, _, node_platform, uv_target in SUPPORTED:
            ntree = root / f"node-tree-{node_platform}"
            write_exe(ntree / "bin" / "node", f"# fake-node marker\n{node_body}")
            name = f"node-v{NODE_VERSION}-{node_platform}.tar.gz"
            tar_dir(ntree, self.node / f"v{NODE_VERSION}" / name, top=f"node-v{NODE_VERSION}-{node_platform}")
            utree = root / f"uv-tree-{uv_target}"
            sync = "exit 0" if uv_sync_ok else "echo 'uv: failed to resolve' >&2; exit 1"
            write_exe(utree / "uv", f'case "$1" in sync) {sync} ;; run) {uv_run_body} ;; esac')
            uname = f"uv-{uv_target}.tar.gz"
            tar_dir(utree, self.uv / UV_VERSION / uname, top=f"uv-{uv_target}")
            (self.uv / UV_VERSION / f"{uname}.sha256").write_text(f"{sha256(self.uv / UV_VERSION / uname)}  {uname}\n")
        sums = [
            f"{sha256(p)}  {p.name}" for p in sorted((self.node / f"v{NODE_VERSION}").glob("*.tar.gz"))
        ]
        (self.node / f"v{NODE_VERSION}" / "SHASUMS256.txt").write_text("\n".join(sums) + "\n")

    def write_release_sum(self, value: str | None = None) -> None:
        archive = self.release / "local-ai-coach.tar.gz"
        (self.release / "local-ai-coach.tar.gz.sha256").write_text(f"{value or sha256(archive)}  local-ai-coach.tar.gz\n")

    def env(self, home: Path, *, os_name: str = "Darwin", cpu: str = "arm64") -> dict[str, str]:
        shim = self.root / "shim"
        write_exe(shim / "uname", f'case "$1" in -s) echo {os_name} ;; -m) echo {cpu} ;; *) echo {os_name} ;; esac')
        return {
            **os.environ,
            "HOME": str(home),
            "PATH": f"{shim}:{os.environ['PATH']}",
            "COACH_RELEASE_BASE": f"file://{self.release}",
            "COACH_NODE_BASE": f"file://{self.node}",
            "COACH_UV_BASE": f"file://{self.uv}",
        }


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


@pytest.mark.parametrize("os_name,cpu,node_platform,uv_target", SUPPORTED)
def test_tc01_plan_picks_the_assets_for_each_supported_system(tmp_path, home, os_name, cpu, node_platform, uv_target):
    fakes = Fakes(tmp_path)
    result = run(["sh", str(INSTALL), "--plan"], fakes.env(home, os_name=os_name, cpu=cpu))
    assert result.returncode == 0, result.stderr
    assert f"node-v{NODE_VERSION}-{node_platform}.tar.gz" in result.stdout
    assert f"{UV_VERSION}/uv-{uv_target}.tar.gz" in result.stdout
    assert "local-ai-coach.tar.gz" in result.stdout


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
    fakes.write_release_sum("0" * 64)
    result = install(fakes, home)
    assert result.returncode != 0
    assert "local-ai-coach.tar.gz could not be verified" in result.stderr
    assert snapshot_tree(home / ".local-ai-coach") == {}
    assert not (home / ".local" / "bin" / "local-ai-coach").exists()


def test_tc04_a_missing_download_leaves_the_earlier_install(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    before = snapshot_tree(home / ".local-ai-coach")
    (fakes.release / "local-ai-coach.tar.gz").unlink()
    result = install(fakes, home)
    assert result.returncode != 0
    assert "could not download" in result.stderr and "local-ai-coach.tar.gz" in result.stderr
    assert snapshot_tree(home / ".local-ai-coach") == before


def test_tc07_a_failed_agent_set_up_keeps_the_earlier_install(tmp_path, home):
    good = Fakes(tmp_path / "good")
    assert install(good, home).returncode == 0
    before = snapshot_tree(home / ".local-ai-coach")
    link_before = os.readlink(home / ".local-ai-coach" / "app")
    bad = Fakes(tmp_path / "bad", uv_sync_ok=False)
    result = install(bad, home)
    assert result.returncode != 0
    assert "setting up the coach's agent failed" in result.stderr
    assert os.readlink(home / ".local-ai-coach" / "app") == link_before
    assert snapshot_tree(home / ".local-ai-coach") == before
    assert len(list((home / ".local-ai-coach").glob("app-*"))) == 1


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


def test_unknown_option_is_refused(tmp_path, home):
    fakes = Fakes(tmp_path)
    assert install(fakes, home).returncode == 0
    result = run([command(home), "--frobnicate"], fakes.env(home))
    assert result.returncode != 0 and "unknown option" in result.stderr


# ------------------------------------------------------------------ build (unit)


@pytest.mark.parametrize("bad", ["server/node_modules/x/lib/thing.node", "apps/agent/.env", "server/.env.local"])
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


# ------------------------------------------------------------------ end to end (opt-in)

e2e = pytest.mark.skipif(os.environ.get("COACH_RELEASE_E2E") != "1", reason="set COACH_RELEASE_E2E=1 (builds and downloads about 100 MB)")
BUILD_TIMEOUT = 900
START_WAIT = 90


@pytest.fixture(scope="module")
def built_release() -> Path:
    result = subprocess.run(["bash", str(BUILD), VERSION], capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False)
    assert result.returncode == 0, result.stderr[-2000:]
    return REPO / "dist"


def real_install(dist: Path, home: Path) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "HOME": str(home), "COACH_RELEASE_BASE": f"file://{dist}"}
    return subprocess.run(["sh", str(INSTALL)], env=env, capture_output=True, text=True, timeout=BUILD_TIMEOUT, check=False)


@e2e
def test_tc05_archive_contents(built_release):
    with tarfile.open(built_release / "local-ai-coach.tar.gz") as tar:
        names = tar.getnames()
    for needed in ("./VERSION", "./bin/local-ai-coach", "./apps/agent/uv.lock", "./apps/agent/main.py", "./curriculum/stations.json", "./server/apps/app/server.js"):
        assert needed in names, needed
    assert any(n.startswith("./server/apps/app/.next/static/") for n in names)
    assert not [n for n in names if n.endswith(".node")]
    assert not [n for n in names if n.split("/")[-1] == ".env" or (n.split("/")[-1].startswith(".env.") and not n.endswith(".env.example"))]
    assert not [n for n in names if n.startswith(("./apps/agent/tests", "./apps/agent/.venv"))]
    assert not [n for n in names if n.split("/")[-1].startswith("._")], "macOS metadata files in the archive"
    assert (built_release / "local-ai-coach.tar.gz.sha256").read_text().split()[0] == sha256(built_release / "local-ai-coach.tar.gz")


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
    env.pop("COACH_CURRICULUM", None)  # the installed coach reads the curriculum it ships with
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

    # TC-14: reinstall keeps progress byte for byte.
    progress = home / ".local-ai-coach" / "progress.stub.json"
    before = progress.read_bytes()
    again = real_install(built_release, home)
    assert again.returncode == 0, again.stderr[-2000:]
    assert progress.read_bytes() == before
