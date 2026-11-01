"""The evidence collector's allowlist.

Build step 1 defines only the table: which probes exist, which values a lesson
must supply for each, and which consent key each needs. Nothing here runs a
command yet; step 3 adds the argv lists, parsers and runner (docs/design.md,
"Evidence collector").

This module must stay importable with the standard library alone, because
curriculum/validate.py loads it by file path to check that every lesson names
an allowlisted probe.
"""

from __future__ import annotations

from typing import TypedDict


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
