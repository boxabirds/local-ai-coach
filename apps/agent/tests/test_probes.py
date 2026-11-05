"""The evidence collector's probes (Ceetrix story 9, TC-01 to TC-14).

Fixtures are real output captured on a Mac and a Linux machine, with every
name, address and path replaced by made-up ones of the same shape: the repo is
public, and the parsers only care about the shape.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from src.coach import probes

PROBES_FILE = Path(probes.__file__)
ALL = {"probes": True, "history": True, "doIt": False}
PROBES_ONLY = {"probes": True, "history": False, "doIt": False}

LSOF_ESTABLISHED = """COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
curl      41001 learner    5u  IPv4 0x1111111111111111      0t0  TCP 192.168.1.20:53001->100.70.1.2:11434 (ESTABLISHED)
curl      41001 learner    6u  IPv6 0x2222222222222222      0t0  TCP [fd7a:115c:a1e0::1]:53002->[fd7a:115c:a1e0::2]:11434 (ESTABLISHED)
curl      41001 learner    7u  IPv4 0x3333333333333333      0t0  TCP 127.0.0.1:53003->127.0.0.1:8080 (ESTABLISHED)
curl      41001 learner    8u  IPv4 0x4444444444444444      0t0  TCP 127.0.0.1:53003->127.0.0.1:8080 (ESTABLISHED)
"""
SS_ESTABLISHED = """Recv-Q Send-Q Local Address:Port     Peer Address:PortProcess
0      0       192.168.5.25:35196    192.168.4.26:80   users:(("power-collector",pid=1230,fd=13))
0      0       192.168.5.25:53880   176.58.92.144:443
0      0       192.168.5.25:41000   100.70.1.2:11434  users:(("chatapp",pid=777,fd=9))
0      0       [::1]:41002           [::1]:8080        users:(("chatapp",pid=777,fd=10))
"""
LSOF_LISTEN = """COMMAND  PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
llama-ser 2617 learner   12u  IPv4 0x61ed5fe8616766e8      0t0  TCP 127.0.0.1:8080 (LISTEN)
"""
SS_LISTEN = """State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 0      4096         0.0.0.0:8080      0.0.0.0:*    users:(("llama-server",pid=5150,fd=3))
LISTEN 0      128             [::]:22           [::]:*
"""
TAILSCALE = {
    "Self": {"HostName": "laptop", "TailscaleIPs": ["100.70.0.1", "fd7a:115c:a1e0::1"], "UserID": 11, "Online": True},
    "Peer": {
        "nodekey:a": {"HostName": "backroom", "TailscaleIPs": ["100.70.1.2", "fd7a:115c:a1e0::2"], "UserID": 11, "Online": True},
        "nodekey:b": {"HostName": "old-box", "TailscaleIPs": ["100.70.1.3"], "UserID": 11, "Online": False},
        "nodekey:c": {"HostName": "friends-pc", "TailscaleIPs": ["100.70.9.9"], "UserID": 22, "Online": True},
    },
}
ZSH_HISTORY = """: 1793335666:0;cd projects
: 1793335688:0;curl http://backroom:8080/v1/models
: 1793335690:0;export OPENAI_API_KEY=sk-not-a-real-key
: 1793335700:0;curl -s http://backroom:8080/v1/models
"""


class Machine:
    """A stand-in for subprocess.run that answers with recorded output."""

    def __init__(self, stdout: str = "", returncode: int = 0, raises: BaseException | None = None):
        self.stdout, self.returncode, self.raises = stdout, returncode, raises
        self.calls: list[tuple[list[str], dict]] = []

    def __call__(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if self.raises:
            raise self.raises
        return subprocess.CompletedProcess(argv, self.returncode, stdout=self.stdout, stderr="")


def run(name, params=None, *, out="", platform="macos", consent=ALL, **kw):
    machine = Machine(out, **kw)
    return probes.run(name, params, consent=consent, platform=platform, runner=machine), machine


# ------------------------------------------------------------------ each probe


def test_tc01_memory_macos():
    result, machine = run("memory", out="17179869184\n")
    assert result == {"probe": "memory", "cmd": "sysctl -n hw.memsize", "matched": ["17179869184"], "value": 16}
    assert machine.calls[0][0] == ["sysctl", "-n", "hw.memsize"]


def test_tc02_memory_linux():
    result, machine = run("memory", out="MemTotal:       65647868 kB\n", platform="linux")
    assert result["value"] == 63 and result["matched"] == ["MemTotal:       65647868 kB"]
    assert machine.calls[0][0] == ["grep", "MemTotal", "/proc/meminfo"]


def test_tc03_process_keeps_pid_and_name_only():
    result, _ = run("process", {"name": "llama-server"}, out="5150 /opt/bin/llama-server --api-key secret-value -m model.gguf\n")
    assert result["matched"] == ["5150 llama-server"]
    assert "secret" not in json.dumps(result)


def test_tc03_process_name_not_on_the_list_runs_nothing():
    result, machine = run("process", {"name": "bash"})
    assert result["error"] == probes.BAD_REQUEST and machine.calls == []


def test_tc04_listening_macos_and_linux():
    mac, machine = run("listening", {"port": "8080"}, out=LSOF_LISTEN)
    assert mac["matched"] == ["llama-ser 2617 127.0.0.1:8080"]
    assert machine.calls[0][0] == ["lsof", "-nP", "-iTCP:8080", "-sTCP:LISTEN"]
    linux, machine = run("listening", {"port": "8080"}, out=SS_LISTEN, platform="linux")
    assert linux["matched"] == ["llama-server 5150 0.0.0.0:8080", "[::]:22"]
    assert machine.calls[0][0] == ["ss", "-ltnp", "sport = :8080"]


@pytest.mark.parametrize("port", ["0", "70000", "80; rm -rf ~", ""])
def test_tc04_a_port_that_is_not_a_port_runs_nothing(port):
    result, machine = run("listening", {"port": port})
    assert result["error"] == probes.BAD_REQUEST and machine.calls == []


def test_tc04_nothing_listening_is_an_empty_answer():
    result, _ = run("listening", {"port": "8080"}, out="", returncode=1)
    assert result["matched"] == [] and result["value"] == [] and "error" not in result


def test_tc05_model_files_with_tilde_sizes_and_at_most_ten(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    models = tmp_path / "models"
    models.mkdir()
    paths = []
    for i in range(12):
        path = models / f"model-{i:02}.gguf"
        path.write_bytes(b"x" * 1024)
        paths.append(str(path))
    result, machine = run("model_file", out="\n".join(paths) + "\n")
    assert len(result["matched"]) == probes.MODEL_FILES_KEEP
    assert result["matched"][0] == "~/models/model-00.gguf 0.0 GB"
    assert str(tmp_path) not in json.dumps(result)
    argv = machine.calls[0][0]
    assert argv[:2] == ["find", str(models)] and "-maxdepth" in argv


def test_tc05_no_model_folder_runs_nothing(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    result, machine = run("model_file")
    assert "error" in result and machine.calls == []


def test_tc06_connections_macos_classes_each_address_once():
    result, machine = run("connections", {"process": "curl"}, out=LSOF_ESTABLISHED)
    assert result["matched"] == ["100.70.1.2:11434 tailnet", "fd7a:115c:a1e0::2:11434 tailnet", "127.0.0.1:8080 loopback"]
    assert machine.calls[0][0] == ["lsof", "-nP", "-iTCP", "-sTCP:ESTABLISHED", "-a", "-c", "curl"]


def test_tc07_connections_linux_keeps_only_the_named_program():
    result, _ = run("connections", {"process": "chatapp"}, out=SS_ESTABLISHED, platform="linux")
    assert result["matched"] == ["100.70.1.2:11434 tailnet", "::1:8080 loopback"]
    assert "power-collector" not in json.dumps(result) and "176.58.92.144" not in json.dumps(result)


@pytest.mark.parametrize("name", ["", "a;b", "$(id)", "x" * 41, "-rf"])
def test_tc07_a_program_name_that_is_not_a_name_runs_nothing(name):
    result, machine = run("connections", {"process": name})
    assert result["error"] == probes.BAD_REQUEST and machine.calls == []


@pytest.mark.parametrize(
    "address, kind",
    [
        ("127.0.0.1", "loopback"), ("::1", "loopback"),
        ("10.0.0.1", "private"), ("172.16.0.1", "private"), ("192.168.1.1", "private"),
        ("fe80::1%en0", "private"), ("fd00::1", "private"),
        ("100.64.0.1", "tailnet"), ("100.127.255.254", "tailnet"), ("fd7a:115c:a1e0::5", "tailnet"),
        ("100.63.255.255", "public"), ("100.128.0.0", "public"), ("8.8.8.8", "public"), ("2606:4700::1", "public"),
        ("not-an-address", "public"),
    ],
)
def test_tc08_classify(address, kind):
    assert probes.classify(address) == kind


def test_tc09_tailnet_owned_means_same_user():
    result, _ = run("tailnet", out=json.dumps(TAILSCALE))
    nodes = {n["name"]: n for n in result["value"]}
    assert nodes["laptop"]["owned"] and nodes["backroom"]["owned"] and nodes["old-box"]["owned"]
    assert not nodes["friends-pc"]["owned"]
    assert nodes["old-box"]["online"] is False
    assert "friends-pc 100.70.9.9 online not yours" in result["matched"]


def test_tc09_tailscale_not_running_is_an_error():
    result, _ = run("tailnet", out="", returncode=1)
    assert "error" in result


def test_tc10_history_keeps_matching_commands_only(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / ".zsh_history").write_text(ZSH_HISTORY)
    result, machine = run("history_has", {"pattern": r"^curl .*/v1/models$"}, out=ZSH_HISTORY)
    assert result["matched"] == ["curl http://backroom:8080/v1/models", "curl -s http://backroom:8080/v1/models"]
    assert "sk-not-a-real-key" not in json.dumps(result)
    assert machine.calls[0][0] == ["tail", "-n", "200", str(tmp_path / ".zsh_history")]


def test_tc10_history_keeps_at_most_three(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / ".bash_history").write_text("ls\n" * 5)
    result, _ = run("history_has", {"pattern": "^ls$"}, out="ls\n" * 5)
    assert result["matched"] == ["ls", "ls", "ls"]


def test_tc10_history_needs_its_own_consent(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / ".zsh_history").write_text(ZSH_HISTORY)
    result, machine = run("history_has", {"pattern": "curl"}, consent=PROBES_ONLY)
    assert result == {"probe": "history_has", "denied": "consent"} and machine.calls == []


@pytest.mark.parametrize("consent", [None, {}, {"probes": False}, {"probes": "yes"}])
def test_tc11_without_consent_nothing_runs(consent):
    result, machine = run("memory", consent=consent)
    assert result == {"probe": "memory", "denied": "consent"} and machine.calls == []


@pytest.mark.parametrize(
    "raises, error",
    [(subprocess.TimeoutExpired(["sysctl"], 5), "took longer than 5 seconds"), (FileNotFoundError(), "sysctl is not on this computer")],
)
def test_tc12_timeout_and_missing_command(raises, error):
    result, _ = run("memory", raises=raises)
    assert result["error"] == error and result["cmd"] == "sysctl -n hw.memsize" and result["matched"] == []


def test_tc12_non_zero_exit_with_nothing_usable():
    result, _ = run("memory", out="", returncode=1)
    assert result["error"] == "the command did not give an answer"


@pytest.mark.parametrize("name, error", [("memory", "not supported on windows"), ("server_log", probes.NOT_AVAILABLE), ("nope", probes.BAD_REQUEST)])
def test_tc12_nothing_runs_for_an_unsupported_system_or_probe(name, error):
    result, machine = run(name, platform="windows")
    assert result["error"] == error and machine.calls == []


def test_tc13_every_command_is_an_argv_list_without_a_shell(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / "models").mkdir()
    (tmp_path / ".zsh_history").write_text(ZSH_HISTORY)
    cases = [("memory", {}), ("process", {"name": "ollama"}), ("listening", {"port": "8080"}), ("model_file", {}),
             ("connections", {"process": "curl"}), ("tailnet", {}), ("history_has", {"pattern": "curl"})]
    for platform in ("macos", "linux"):
        for name, params in cases:
            _, machine = run(name, params, platform=platform)
            argv, kwargs = machine.calls[0]
            assert isinstance(argv, list) and all(isinstance(a, str) for a in argv)
            assert kwargs["shell"] is False and kwargs["timeout"] == probes.TIMEOUT_S
    assert set(probes.COMMANDS) | {"server_log"} == set(probes.PROBES)


# ------------------------------------------------------------------ on this machine (integration)


@pytest.mark.skipif(probes.this_platform() is None, reason="macOS or Linux only")
def test_tc14_real_memory_matches_the_system():
    result = probes.run("memory", consent=PROBES_ONLY)
    if probes.this_platform() == "macos":
        raw = int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, check=True).stdout)
        assert result["value"] == round(raw / probes.GIB)
    else:
        kb = int(Path("/proc/meminfo").read_text().split("MemTotal:")[1].split()[0])
        assert result["value"] == round(kb / probes.KIB_PER_GIB)


@pytest.mark.skipif(probes.this_platform() is None, reason="macOS or Linux only")
def test_tc14_script_mode_prints_json_with_nothing_but_the_standard_library():
    # -I: isolated, so nothing from the agent's environment is importable.
    done = subprocess.run([sys.executable, "-I", str(PROBES_FILE), "memory"], capture_output=True, text=True, timeout=30, check=False, env={"PATH": os.environ["PATH"], "HOME": os.environ["HOME"]})
    assert done.returncode == 0, done.stderr
    assert json.loads(done.stdout)["probe"] == "memory"
