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


# ------------------------------------------------------------------ choices (story 11)

CHOICES_PASSED = "On your {room} GB: {results}."
CHOICES_NOT_YET = "Have another look at {label}. {hint}"
# True whichever way the answer was wrong, without the arithmetic and without talking down:
# memory holds the file and the model's working space (docs/design/20261105-what-fits-proposal.md).
CHOICES_HINT = "A model needs room in memory for the whole file and for its working space while it answers."


def _gb(value: float) -> str:
    return f"{value:g} GB"


def grade_choices(step: dict[str, Any], answers: list[str], room_gb: float) -> dict[str, Any]:
    """Mark a fits test in code, against the learner's own memory.

    grade "fit" (two options): a file fits when it is no bigger than the room.
    grade "band" (three options, fits / depends / doesn't): the wide rule of thumb,
    under half the room fits, bigger than the room doesn't, anything between depends
    (docs/design/20261105-pedagogical-flow-proposal.md, section 13, decision 6)."""
    choices = step["check"]["choices"]
    items, options, grade = choices["items"], choices["options"], choices.get("grade", "fit")
    if len(answers) != len(items) or any(a not in options for a in answers):
        raise ValueError(f"expected one of {options} for each of {len(items)} files")
    rule = BAND_RULES[grade]
    if len(options) != len(rule["words"]):
        raise ValueError(f"grade {grade!r} needs {len(rule['words'])} options, got {len(options)}")
    results = []
    for item, answer in zip(items, answers):
        verdict = rule["verdict"](item["gb"], room_gb)
        right = options[verdict]
        results.append({"label": item["label"], "answer": answer, "right": answer == right})
    room = _shown(room_gb)
    if all(r["right"] for r in results):
        said = ", ".join(f"{_gb(i['gb'])} {rule['words'][rule['verdict'](i['gb'], room_gb)]}" for i in items)
        note = CHOICES_PASSED.format(room=room, results=said)
        return {"passed": True, "checked": True, "note": note, "evidence": [], "measured": room_gb, "results": results}
    wrong = next(r for r in results if not r["right"])
    note = CHOICES_NOT_YET.format(label=wrong["label"], hint=CHOICES_HINT)
    return {"passed": False, "checked": True, "note": note, "evidence": [], "measured": room_gb, "results": results}


def fits_room(file_gb: float, room_gb: float) -> bool:
    """Fits at all: no bigger than the room."""
    return file_gb <= room_gb


# The wide rule of thumb: comfortably under this share of memory, it fits whatever the settings.
FITS_SHARE = 0.5
FITS, DEPENDS, DOESNT = 0, 1, 2
# The two-option fit grade has no middle: its second option is "doesn't fit".
FIT_DOESNT = 1


def band(file_gb: float, room_gb: float) -> int:
    """Which band a file is in: FITS under half the room, DOESNT bigger than the room, else DEPENDS."""
    if file_gb < room_gb * FITS_SHARE:
        return FITS
    if file_gb > room_gb:
        return DOESNT
    return DEPENDS


BAND_RULES = {
    "fit": {"verdict": lambda f, r: FITS if fits_room(f, r) else FIT_DOESNT, "words": ["fits", "doesn't fit"]},
    "band": {"verdict": band, "words": ["fits", "depends", "doesn't fit"]},
}
