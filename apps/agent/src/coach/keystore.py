"""The learner's two API keys, kept on their own computer (Ceetrix story 16).

On a Mac the keys go in the login Keychain through /usr/bin/security. A key is written
with `security -i`, which reads its command line from stdin, so a key never appears in any
process's argument list. Every write is read back and compared; if anything fails, both
entries are removed, so the coach never holds one key without the other.

Elsewhere (Linux is Ceetrix story 17, Windows story 18) `where()` is None and nothing is
stored: the app keeps the keys for the session only, as before.

Nothing here logs, prints or returns a key except `load()` and `cached()`, which the
agent's StoredKeys middleware uses to add the keys to requests from the app's own server.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable

SECURITY = Path("/usr/bin/security")
SERVICE_ENV = "COACH_KEYCHAIN_SERVICE"
DEFAULT_SERVICE = "local-ai-coach"
ACCOUNTS = ("openai", "jev")
KEYCHAIN = "keychain"
TIMEOUT_S = 5
MAX_KEY_CHARS = 4096
# What both providers issue: printable ASCII with no spaces or quotes. Anything else is
# refused before the Keychain is touched (and can't break the stdin command line).
KEY_SHAPE = re.compile(rf"^[!#-&(-\[\]-~]{{1,{MAX_KEY_CHARS}}}$")

# Learner-facing, in the coach's voice; never contains a key.
NOT_HERE = "This computer can't remember keys yet, so I'll keep them for this session only."
NOT_A_KEY = "That doesn't look like an API key. Paste it again, with nothing before or after it."
DIDNT_SAVE = "Your Keychain didn't save the keys, so I'll keep them for this session only."

Runner = Callable[..., subprocess.CompletedProcess]
# Swappable in tests, like probes.RUN.
RUN: Runner = subprocess.run

_cache: tuple[str, str] | None = None
_cache_loaded = False


class StoreError(Exception):
    """Why the keys weren't saved, in words the learner can read."""


def service() -> str:
    return os.environ.get(SERVICE_ENV, "").strip() or DEFAULT_SERVICE


def where() -> str | None:
    """Where saved keys go on this computer: "keychain" on a Mac, else None (session only)."""
    return KEYCHAIN if sys.platform == "darwin" and SECURITY.is_file() else None


def _security(args: list[str], run: Runner, stdin: str | None = None) -> subprocess.CompletedProcess:
    return run([str(SECURITY), *args], shell=False, timeout=TIMEOUT_S, capture_output=True, text=True, input=stdin)


def _read(account: str, run: Runner) -> str | None:
    try:
        done = _security(["find-generic-password", "-s", service(), "-a", account, "-w"], run)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if done.returncode != 0:
        return None
    return done.stdout.rstrip("\n")


def _delete(account: str, run: Runner) -> None:
    try:
        _security(["delete-generic-password", "-s", service(), "-a", account], run)
    except (OSError, subprocess.TimeoutExpired):
        pass


def save(openai: str, jev: str, *, run: Runner | None = None) -> None:
    """Store both keys, read them back, and compare. On any failure, store neither."""
    run = run or RUN
    global _cache, _cache_loaded
    if where() is None:
        raise StoreError(NOT_HERE)
    keys = dict(zip(ACCOUNTS, (openai, jev)))
    if not all(KEY_SHAPE.match(value) for value in keys.values()):
        raise StoreError(NOT_A_KEY)
    lines = "".join(f'add-generic-password -U -s {service()} -a {account} -w "{value}"\n' for account, value in keys.items())
    try:
        written = _security(["-i"], run, stdin=lines)
        ok = written.returncode == 0 and all(_read(account, run) == value for account, value in keys.items())
    except (OSError, subprocess.TimeoutExpired):
        ok = False
    if not ok:
        for account in ACCOUNTS:
            _delete(account, run)
        _cache, _cache_loaded = None, True
        raise StoreError(DIDNT_SAVE)
    _cache, _cache_loaded = (openai, jev), True


def load(*, run: Runner | None = None) -> tuple[str, str] | None:
    """Both saved keys, or None if either is missing or this computer can't store them."""
    run = run or RUN
    if where() is None:
        return None
    values = [_read(account, run) for account in ACCOUNTS]
    if any(not value for value in values):
        return None
    return values[0], values[1]  # type: ignore[return-value]


def forget(*, run: Runner | None = None) -> None:
    """Remove both keys; missing entries are fine."""
    run = run or RUN
    global _cache, _cache_loaded
    if where() is not None:
        for account in ACCOUNTS:
            _delete(account, run)
    _cache, _cache_loaded = None, True


def cached(*, run: Runner | None = None) -> tuple[str, str] | None:
    """The saved keys, read from the Keychain at most once until the next save or forget."""
    run = run or RUN
    global _cache, _cache_loaded
    if not _cache_loaded:
        _cache, _cache_loaded = load(run=run), True
    return _cache


def saved() -> bool:
    return cached() is not None


def reset_cache() -> None:
    """For tests: forget what was read, so the next call reads again."""
    global _cache, _cache_loaded
    _cache, _cache_loaded = None, False
