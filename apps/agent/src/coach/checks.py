"""Turn a lesson step's check and the probes' answers into a verdict (Ceetrix story 9).

evaluate() is pure apart from the probe runner it is given. Its result is what
the check card shows and what progress records: the evidence is the commands
run and the lines kept, nothing else.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from src.coach import probes as probes_mod

Run = Callable[..., dict[str, Any]]

NOT_ASKED = "You chose not to let me look, so I've taken your word for it."
NOTHING_SEEN = "I didn't see the chat app talking to anything. Ask it something long, and check again while it answers."
PASSED_MEMORY = "You typed {typed} GB and the machine says {measured} GB."
PASSED_OWNED = "Everything it talked to is yours: {where}."
PUBLIC_FOUND = "It talked to {address}, a public address: somewhere you don't own."
NOT_OWNED = "It talked to {address} on a private link, but not to one of your machines."
COULD_NOT = "I couldn't read {what} on this computer ({why}), so I've taken your word for it."
WHAT = {
    "memory": "the memory number",
    "connections": "where the chat app is connected",
    "tailnet": "the machines on your private link",
}
PLACEHOLDER = re.compile(r"\{(\w+)\}")
OWNED_KINDS = {probes_mod.LOOPBACK, probes_mod.PRIVATE, probes_mod.TAILNET}


def _shown(number: float) -> str:
    return str(int(number)) if float(number).is_integer() else f"{number:g}"


def _fill(params: dict[str, Any], context: dict[str, str]) -> dict[str, str] | None:
    """Lesson placeholders filled from context; None if one has no value."""
    out: dict[str, str] = {}
    for key, value in params.items():
        text = str(value)
        missing = [name for name in PLACEHOLDER.findall(text) if not context.get(name)]
        if missing:
            return None
        out[key] = PLACEHOLDER.sub(lambda m: str(context[m.group(1)]), text)
    return out


def _evidence(result: dict[str, Any]) -> dict[str, Any]:
    return {"probe": result["probe"], "cmd": result.get("cmd", ""), "matched": list(result.get("matched") or [])}


def _verdict(passed: bool, checked: bool, note: str, evidence: list[dict[str, Any]], measured: Any = None) -> dict[str, Any]:
    return {"passed": passed, "checked": checked, "note": note, "evidence": evidence, "measured": measured}


def evaluate(
    step: dict[str, Any],
    *,
    typed: float | None = None,
    consent: dict[str, Any] | None,
    run: Run = probes_mod.run,
    context: dict[str, str] | None = None,
) -> dict[str, Any]:
    check = step.get("check") or {}
    names = list(check.get("probes") or [check.get("probe")])
    names = [n for n in names if n]
    if not names:
        raise ValueError(f"step {step.get('id')} has no real check")
    if not probes_mod.allowed(consent, probes_mod.CONSENT_PROBES):
        return _verdict(False, False, NOT_ASKED, [])
    params = _fill(check.get("params") or {}, context or {})
    if params is None:
        return _verdict(False, False, COULD_NOT.format(what=WHAT.get(names[0], names[0]), why="the lesson needs a name it wasn't given"), [])

    results = {name: run(name, params if name != "tailnet" else {}, consent=consent) for name in names}
    evidence = [_evidence(r) for r in results.values() if "denied" not in r]
    for name, result in results.items():
        if "error" in result or "denied" in result:
            return _verdict(False, False, COULD_NOT.format(what=WHAT.get(name, name), why=result.get("error", "not allowed")), evidence)

    if names == ["memory"]:
        measured = results["memory"]["value"]
        tolerance = float(check.get("toleranceGb", 0))
        if typed is not None and abs(float(typed) - measured) <= tolerance:
            return _verdict(True, True, PASSED_MEMORY.format(typed=_shown(typed), measured=measured), evidence, measured)
        say = (step.get("onFail") or {}).get("say") or PASSED_MEMORY
        return _verdict(False, True, say.format(typed=_shown(typed) if typed is not None else "nothing", measured=measured), evidence, measured)

    if "connections" in results:
        destinations = results["connections"]["value"] or []
        if not destinations:
            return _verdict(False, True, NOTHING_SEEN, evidence, destinations)
        public = next((d for d in destinations if d["kind"] not in OWNED_KINDS), None)
        if public:
            return _verdict(False, True, PUBLIC_FOUND.format(address=public["address"]), evidence, destinations)
        if "tailnet" in results:
            owned = {a for node in results["tailnet"]["value"] or [] if node["owned"] for a in node["addresses"]}
            stranger = next((d for d in destinations if d["kind"] == probes_mod.TAILNET and d["address"] not in owned), None)
            if stranger:
                return _verdict(False, True, NOT_OWNED.format(address=stranger["address"]), evidence, destinations)
        where = ", ".join(f"{d['address']} ({d['kind']})" for d in destinations)
        return _verdict(True, True, PASSED_OWNED.format(where=where), evidence, destinations)

    raise ValueError(f"no rule for the probes {names}")
