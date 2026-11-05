"""The evidence collector (docs/design.md, "Evidence collector"; Ceetrix story 9).

PROBES is the allowlist: which probes exist, which values a lesson must supply
for each, and which consent key each needs. Below it, each probe is a fixed
argv list per platform and a parser that keeps the matched lines only. run()
is the one way to run one.

Rules, enforced here and not in any prompt:
- every command is subprocess.run(argv, capture_output=True, timeout=5,
  shell=False); the home folder is expanded in Python, never by a shell;
- nothing is written anywhere;
- only the lines a check needs are kept, never the raw output, and never the
  command lines of other programs.

This module must stay importable with the standard library alone:
curriculum/validate.py loads it by file path, and it runs as a script on a
machine without the coach (python3 probes.py memory), for verification:

    ssh host python3 - memory < apps/agent/src/coach/probes.py
"""

from __future__ import annotations

import ipaddress
import json
import os
import platform as _platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, TypedDict


class ProbeSpec(TypedDict):
    params: tuple[str, ...]
    consent: str
    platforms: tuple[str, ...]


CONSENT_PROBES = "probes"
CONSENT_HISTORY = "history"

MACOS = "macos"
LINUX = "linux"
BOTH = (MACOS, LINUX)

PROBES: dict[str, ProbeSpec] = {
    "memory": {"params": (), "consent": CONSENT_PROBES, "platforms": BOTH},
    "history_has": {"params": ("pattern",), "consent": CONSENT_HISTORY, "platforms": BOTH},
    "process": {"params": ("name",), "consent": CONSENT_PROBES, "platforms": BOTH},
    "listening": {"params": ("port",), "consent": CONSENT_PROBES, "platforms": BOTH},
    "model_file": {"params": (), "consent": CONSENT_PROBES, "platforms": BOTH},
    "connections": {"params": ("process",), "consent": CONSENT_PROBES, "platforms": BOTH},
    "tailnet": {"params": (), "consent": CONSENT_PROBES, "platforms": BOTH},
    "server_log": {"params": (), "consent": CONSENT_PROBES, "platforms": BOTH},
}


# ------------------------------------------------------------------ running

TIMEOUT_S = 5
GIB = 1024**3
KIB_PER_GIB = 1024 * 1024
HISTORY_LINES = 200
HISTORY_KEEP = 3
MODEL_FILES_KEEP = 10
MODEL_DEPTH = 4
PORT_MIN, PORT_MAX = 1, 65535
BAD_REQUEST = "bad request"
NOT_AVAILABLE = "not available"
DENIED = "consent"

# Model servers a learner might run; process only reports these, by name.
SERVER_NAMES = ("llama-server", "ollama", "lms", "LM Studio", "mlx_lm.server", "vllm")
# A chat app named in a lesson ({chat_app}): a plain program name.
PROCESS_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,39}$")
MODEL_DIRS = ("~/models", "~/.ollama", "~/.cache/lm-studio", "~/.lmstudio/models")
MODEL_SUFFIXES = (".gguf", ".safetensors")
HISTORY_FILES = ("~/.zsh_history", "~/.bash_history")
TAILSCALE_MAC_APP = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"

TAILNET_V4 = ipaddress.ip_network("100.64.0.0/10")
TAILNET_V6 = ipaddress.ip_network("fd7a:115c:a1e0::/48")
LOOPBACK, PRIVATE, TAILNET, PUBLIC = "loopback", "private", "tailnet", "public"

Runner = Callable[..., Any]


class Request(Exception):
    """A probe asked for with a name, parameter or platform it cannot run with."""


def this_platform() -> str | None:
    system = _platform.system()
    return {"Darwin": MACOS, "Linux": LINUX}.get(system)


def _home(path: str) -> str:
    return os.path.expanduser(path)


def _tilde(path: str) -> str:
    home = os.path.expanduser("~")
    return "~" + path[len(home):] if path.startswith(home + os.sep) else path


def _port(params: dict[str, str]) -> int:
    try:
        port = int(str(params.get("port", "")))
    except ValueError as exc:
        raise Request from exc
    if not PORT_MIN <= port <= PORT_MAX:
        raise Request
    return port


def _process(params: dict[str, str]) -> str:
    name = str(params.get("process", ""))
    if not PROCESS_NAME.fullmatch(name):
        raise Request
    return name


def classify(address: str) -> str:
    """loopback, private, tailnet or public, for one remote address."""
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return PUBLIC
    if ip.is_loopback:
        return LOOPBACK
    if (ip.version == 4 and ip in TAILNET_V4) or (ip.version == 6 and ip in TAILNET_V6):
        return TAILNET
    if ip.is_private or ip.is_link_local:
        return PRIVATE
    return PUBLIC


# ------------------------------------------------------------------ each probe: argv and parser


def _memory_argv(platform: str, params: dict[str, str]) -> list[str]:
    return ["sysctl", "-n", "hw.memsize"] if platform == MACOS else ["grep", "MemTotal", "/proc/meminfo"]


def _memory_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    line = next((ln.strip() for ln in out.splitlines() if ln.strip()), "")
    if platform == MACOS:
        if not line.isdigit():
            return [], None
        return [line], round(int(line) / GIB)
    m = re.match(r"MemTotal:\s+(\d+)\s+kB", line)
    return ([line], round(int(m.group(1)) / KIB_PER_GIB)) if m else ([], None)


def _process_argv(platform: str, params: dict[str, str]) -> list[str]:
    name = str(params.get("name", ""))
    if name not in SERVER_NAMES:
        raise Request
    return ["pgrep", "-fl", name] if platform == MACOS else ["pgrep", "-a", name]


def _process_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    name = str(params.get("name", ""))
    found = []
    for line in out.splitlines():
        pid, _, command = line.strip().partition(" ")
        program = os.path.basename(command.split(" ", 1)[0]) if command else ""
        if pid.isdigit() and (program == name or command.startswith(name)):
            found.append(f"{pid} {name}")  # never the command line: it can hold secrets
    return found, [{"pid": int(f.split()[0]), "name": name} for f in found]


def _listening_argv(platform: str, params: dict[str, str]) -> list[str]:
    port = _port(params)
    if platform == MACOS:
        return ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"]
    return ["ss", "-ltnp", f"sport = :{port}"]


SS_USERS = re.compile(r'users:\(\("([^"]+)",pid=(\d+)')


def _listening_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    found = []
    for line in out.splitlines()[1:]:
        cols = line.split()
        if platform == MACOS and len(cols) >= 9 and cols[-1] == "(LISTEN)":
            found.append({"name": cols[0], "pid": int(cols[1]), "address": cols[-2]})
        elif platform == LINUX and len(cols) >= 4 and cols[0] == "LISTEN":
            user = SS_USERS.search(line)
            found.append({"name": user.group(1) if user else "", "pid": int(user.group(2)) if user else None, "address": cols[3]})
    return [" ".join(str(v) for v in f.values() if v not in ("", None)) for f in found], found


def _model_file_argv(platform: str, params: dict[str, str]) -> list[str]:
    dirs = [d for d in (_home(p) for p in MODEL_DIRS) if os.path.isdir(d)]
    if not dirs:
        raise Request("none of the usual model folders exist")
    names: list[str] = []
    for suffix in MODEL_SUFFIXES:
        names += ["-o", "-name", f"*{suffix}"] if names else ["-name", f"*{suffix}"]
    return ["find", *dirs, "-maxdepth", str(MODEL_DEPTH), "-type", "f", "(", *names, ")"]


def _model_file_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    found = []
    for path in sorted(p for p in out.splitlines() if p.strip())[:MODEL_FILES_KEEP]:
        try:
            size = round(os.stat(path).st_size / GIB, 1)
        except OSError:
            continue
        found.append({"path": _tilde(path), "gb": size})
    return [f"{f['path']} {f['gb']} GB" for f in found], found


def _connections_argv(platform: str, params: dict[str, str]) -> list[str]:
    name = _process(params)
    if platform == MACOS:
        return ["lsof", "-nP", "-iTCP", "-sTCP:ESTABLISHED", "-a", "-c", name]
    return ["ss", "-tnp", "state", "established"]


LSOF_PEER = re.compile(r"->(\[[^\]]+\]|[^:\s]+):(\d+)")


def _split_host_port(text: str) -> tuple[str, int] | None:
    host, _, port = text.rpartition(":")
    if not port.isdigit():
        return None
    return host.strip("[]"), int(port)


def _connections_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    name = str(params.get("process", ""))
    seen: dict[tuple[str, int], dict[str, Any]] = {}
    for line in out.splitlines()[1:]:
        if platform == MACOS:
            m = LSOF_PEER.search(line)
            peer = (m.group(1).strip("[]"), int(m.group(2))) if m else None
        else:
            user = SS_USERS.search(line)
            cols = line.split()
            if not user or user.group(1) != name or len(cols) < 4:
                continue  # another program's connection: not kept
            peer = _split_host_port(cols[3])
        if peer and peer not in seen:
            seen[peer] = {"address": peer[0], "port": peer[1], "kind": classify(peer[0])}
    found = list(seen.values())
    return [f"{f['address']}:{f['port']} {f['kind']}" for f in found], found


def _tailscale() -> str:
    if shutil.which("tailscale"):
        return "tailscale"
    if os.path.exists(TAILSCALE_MAC_APP):
        return TAILSCALE_MAC_APP
    return "tailscale"


def _tailnet_argv(platform: str, params: dict[str, str]) -> list[str]:
    return [_tailscale(), "status", "--json"]


def _tailnet_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    try:
        status = json.loads(out)
    except ValueError:
        return [], None
    me = status.get("Self") or {}
    owner = me.get("UserID")
    nodes = []
    for node in [me, *(status.get("Peer") or {}).values()]:
        nodes.append({
            "name": str(node.get("HostName", "")),
            "addresses": [str(a) for a in node.get("TailscaleIPs") or []],
            "online": bool(node.get("Online")),
            "owned": owner is not None and node.get("UserID") == owner,
        })
    lines = [f"{n['name']} {' '.join(n['addresses'])} {'online' if n['online'] else 'offline'}{'' if n['owned'] else ' not yours'}" for n in nodes]
    return lines, nodes


def _history_argv(platform: str, params: dict[str, str]) -> list[str]:
    pattern = str(params.get("pattern", ""))
    try:
        re.compile(pattern)
    except re.error as exc:
        raise Request from exc
    path = next((p for p in (_home(h) for h in HISTORY_FILES) if os.path.isfile(p)), None)
    if not path or not pattern:
        raise Request("no shell history file")
    return ["tail", "-n", str(HISTORY_LINES), path]


ZSH_EXTENDED = re.compile(r"^: \d+:\d+;")


def _history_parse(platform: str, out: str, params: dict[str, str]) -> tuple[list[str], Any]:
    pattern = re.compile(str(params.get("pattern", "")))
    commands = [ZSH_EXTENDED.sub("", line).strip() for line in out.splitlines()]
    hits = [c for c in commands if c and pattern.search(c)][-HISTORY_KEEP:]
    return hits, len(hits)


class Probe(TypedDict):
    argv: Callable[[str, dict[str, str]], list[str]]
    parse: Callable[[str, str, dict[str, str]], tuple[list[str], Any]]


COMMANDS: dict[str, Probe] = {
    "memory": {"argv": _memory_argv, "parse": _memory_parse},
    "process": {"argv": _process_argv, "parse": _process_parse},
    "listening": {"argv": _listening_argv, "parse": _listening_parse},
    "model_file": {"argv": _model_file_argv, "parse": _model_file_parse},
    "connections": {"argv": _connections_argv, "parse": _connections_parse},
    "tailnet": {"argv": _tailnet_argv, "parse": _tailnet_parse},
    "history_has": {"argv": _history_argv, "parse": _history_parse},
}


def allowed(consent: dict[str, Any] | None, key: str) -> bool:
    return isinstance(consent, dict) and consent.get(key) is True


def _shown(argv: list[str]) -> str:
    """The command as the learner reads it: home shown as ~, arguments with spaces quoted."""
    return " ".join(f"'{a}'" if " " in a or a in ("(", ")") else _tilde(a) for a in argv)


def run(
    name: str,
    params: dict[str, Any] | None = None,
    *,
    consent: dict[str, Any] | None,
    platform: str | None = None,
    runner: Runner = subprocess.run,
) -> dict[str, Any]:
    """Run one allowlisted probe. Never raises; the result says what happened."""
    params = {k: str(v) for k, v in (params or {}).items()}
    spec = PROBES.get(name)
    if spec is None:
        return {"probe": name, "cmd": "", "matched": [], "error": BAD_REQUEST}
    if not allowed(consent, spec["consent"]):
        return {"probe": name, "denied": DENIED}
    if name not in COMMANDS:
        return {"probe": name, "cmd": "", "matched": [], "error": NOT_AVAILABLE}
    platform = platform or this_platform()
    if platform not in spec["platforms"]:
        return {"probe": name, "cmd": "", "matched": [], "error": f"not supported on {platform or 'this system'}"}
    try:
        argv = COMMANDS[name]["argv"](platform, params)
    except Request as exc:
        return {"probe": name, "cmd": "", "matched": [], "error": str(exc) or BAD_REQUEST}
    cmd = _shown(argv)
    try:
        done = runner(argv, capture_output=True, text=True, timeout=TIMEOUT_S, shell=False, check=False)
    except FileNotFoundError:
        return {"probe": name, "cmd": cmd, "matched": [], "error": f"{argv[0]} is not on this computer"}
    except subprocess.TimeoutExpired:
        return {"probe": name, "cmd": cmd, "matched": [], "error": f"took longer than {TIMEOUT_S} seconds"}
    except OSError as exc:
        return {"probe": name, "cmd": cmd, "matched": [], "error": exc.strerror or "could not run"}
    out = done.stdout or ""
    matched, value = COMMANDS[name]["parse"](platform, out, params)
    if done.returncode != 0 and not matched:
        # lsof, pgrep and grep exit 1 when they find nothing: that is an empty answer, not a failure.
        if out.strip() == "" and name in ("process", "listening", "connections") :
            return {"probe": name, "cmd": cmd, "matched": [], "value": []}
        return {"probe": name, "cmd": cmd, "matched": [], "error": "the command did not give an answer"}
    return {"probe": name, "cmd": cmd, "matched": matched, "value": value}


def main(argv: list[str]) -> int:
    """python3 probes.py <name> [key=value ...]: run one probe with consent, print JSON."""
    if len(argv) < 2:
        print(f"usage: probes.py <{'|'.join(PROBES)}> [key=value ...]", file=sys.stderr)
        return 2
    params = dict(arg.split("=", 1) for arg in argv[2:] if "=" in arg)
    result = run(argv[1], params, consent={"probes": True, "history": True})
    print(json.dumps(result, indent=2))
    return 0 if "error" not in result else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
