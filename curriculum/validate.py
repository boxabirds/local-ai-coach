#!/usr/bin/env python3
"""Validate the curriculum folder against the V1 lesson contract.

Usage (from the repo root):
    uv run --directory apps/agent python ../../curriculum/validate.py

Rules and issue codes are listed in docs/design.md ("Curriculum and progress
on disk") and in the Ceetrix design for story 1. The validator only reads; it
never writes a file. It checks registered terms only: a technical word that is
not in map.json is invisible to it.
"""

from __future__ import annotations

import ast
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import yaml

ERROR = "error"
WARN = "warn"

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = REPO_ROOT / "curriculum"
DEFAULT_PROBES = REPO_ROOT / "apps" / "agent" / "src" / "coach" / "probes.py"
DEFAULT_STYLECHECK = REPO_ROOT / "panel" / "stylecheck.py"
# The app's map shows these names before the coach sends a snapshot; they must match stations.json.
DEFAULT_APP_STATIONS = REPO_ROOT / "apps" / "app" / "src" / "components" / "coach" / "tube-map.tsx"
APP_STATION = re.compile(r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)"')

STYLECHECK_TIMEOUT_S = 30

LESSON_STATUSES = {"final", "draft"}
WHERE_VALUES = {"sandbox", "real-terminal", "settings", "chat-app", "coach", "read"}
CHECK_FIELDS: dict[str, tuple[str, ...]] = {
    "sim": ("event", "match"),
    "real": (),  # needs probe or probes; handled separately
    "ask": ("question", "rubric"),
    "read": (),
}
DOIT_FIELDS: dict[str, tuple[str, ...]] = {
    "shell": ("cmd", "explain"),
    "sim": ("cmd",),
    "instructions": ("explain",),
}
COMMAND_KINDS = {"shell", "sim"}
PLACEHOLDERS = {"server", "server_name", "chat_app", "measured", "typed", "address"}
LESSON_REQUIRED = ("station", "status", "untested", "teaches", "previews", "why", "mnem", "steps", "recap")
STEP_REQUIRED = ("id", "text", "where", "hint", "doIt", "check")
MAP_REQUIRED = ("term", "forms", "definedIn", "firstAt", "gloss", "analogy", "recap", "station", "avoid")
CHAPTER_COMPARED = ("gloss", "analogy", "recap", "station")

UNSAFE_COMMAND: tuple[tuple[str, str], ...] = (
    (r"[\r\n]", "spans more than one line"),
    (r"\bsudo\b", "uses sudo"),
    (r"\brm\b", "deletes files (rm)"),
    (r"\|", "pipes or chains commands (|)"),
    (r";", "chains commands (;)"),
    (r"&", "chains or backgrounds commands (&)"),
    (r"`", "uses command substitution (backtick)"),
    (r"\$\(", "uses command substitution ($( ))"),
    (r">", "redirects output (>)"),
    (r"<", "redirects input (<)"),
)

DASH_RE = re.compile("[–—]")
CODE_SPAN_RE = re.compile(r"`[^`]*`")
PLACEHOLDER_RE = re.compile(r"\{([A-Za-z_]+)\}")
AVOID_HITS_PREFIX = "avoid-list hits:"
DASH_PATTERNS = {"—", "–"}
FRONT_MATTER_FENCE = "---"
AVOID_QUALIFIERS = ("(", " as a ")


@dataclass(frozen=True)
class Issue:
    level: str
    code: str
    where: str
    message: str

    def __str__(self) -> str:
        return f"{self.level:5s} {self.code:22s} {self.where}: {self.message}"


class Report:
    def __init__(self) -> None:
        self.issues: list[Issue] = []

    def error(self, code: str, where: str, message: str) -> None:
        self.issues.append(Issue(ERROR, code, where, message))

    def warn(self, code: str, where: str, message: str) -> None:
        self.issues.append(Issue(WARN, code, where, message))


# ---------------------------------------------------------------- loading


def _load_json(path: Path, rel: str, report: Report) -> Any | None:
    if not path.is_file():
        report.error("FILE_MISSING", rel, "file not found")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.error("FILE_PARSE", rel, f"invalid JSON: {exc}")
        return None


def _load_probes(path: Path, report: Report) -> dict[str, Any] | None:
    if not path.is_file():
        report.error("FILE_MISSING", str(path), "probe allowlist not found")
        return None
    spec = importlib.util.spec_from_file_location("coach_probes_allowlist", path)
    if spec is None or spec.loader is None:
        report.error("FILE_PARSE", str(path), "cannot load probe allowlist")
        return None
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # noqa: BLE001 - any failure means no allowlist
        report.error("FILE_PARSE", str(path), f"cannot import probe allowlist: {exc}")
        return None
    probes = getattr(module, "PROBES", None)
    if not isinstance(probes, dict):
        report.error("FILE_PARSE", str(path), "PROBES is missing or not a dict")
        return None
    return probes


def _front_matter(path: Path, rel: str, report: Report) -> dict[str, Any] | None:
    if not path.is_file():
        report.error("FILE_MISSING", rel, "file not found")
        return None
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != FRONT_MATTER_FENCE:
        report.error("FILE_PARSE", rel, "no YAML front-matter fence on the first line")
        return None
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == FRONT_MATTER_FENCE)
    except StopIteration:
        report.error("FILE_PARSE", rel, "front-matter is not closed")
        return None
    try:
        data = yaml.safe_load("\n".join(lines[1:end]))
    except yaml.YAMLError as exc:
        report.error("FILE_PARSE", rel, f"invalid YAML front-matter: {exc}")
        return None
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------- text helpers


def _fold(text: Any) -> str:
    return " ".join(str(text).split()) if text is not None else ""


def _form_re(form: str) -> re.Pattern[str]:
    return re.compile(r"(?<!\w)" + re.escape(form) + r"(?!\w)", re.IGNORECASE)


def _strip_code(text: str) -> str:
    return CODE_SPAN_RE.sub(" ", text)


def _literal_avoid(phrase: str) -> bool:
    """Avoid entries with a qualifier ("the model (when the file is meant)",
    "RAM as a different thing from memory") describe a usage, not a string,
    so they cannot be matched mechanically and are left to a human read."""
    return bool(phrase.strip()) and not any(q in phrase for q in AVOID_QUALIFIERS)


def lesson_texts(lesson: dict[str, Any]) -> list[tuple[str, str]]:
    """Learner-facing strings of a lesson as (location, text) pairs."""
    out: list[tuple[str, str]] = []
    for key in ("why", "mnem", "stands"):
        if isinstance(lesson.get(key), str):
            out.append((key, lesson[key]))
    for i, line in enumerate(lesson.get("recap") or []):
        if isinstance(line, str):
            out.append((f"recap[{i}]", line))
    for step in lesson.get("steps") or []:
        if not isinstance(step, dict):
            continue
        sid = str(step.get("id", "?"))
        for key in ("text", "hint"):
            if isinstance(step.get(key), str):
                out.append((f"{sid}.{key}", step[key]))
        on_fail = step.get("onFail")
        if isinstance(on_fail, dict) and isinstance(on_fail.get("say"), str):
            out.append((f"{sid}.onFail.say", on_fail["say"]))
        do_it = step.get("doIt")
        if isinstance(do_it, dict) and isinstance(do_it.get("explain"), str):
            out.append((f"{sid}.doIt.explain", do_it["explain"]))
        check = step.get("check")
        if isinstance(check, dict) and isinstance(check.get("question"), str):
            out.append((f"{sid}.check.question", check["question"]))
        choices = check.get("choices") if isinstance(check, dict) else None
        if isinstance(choices, dict):
            out += [(f"{sid}.choices.item", i["label"]) for i in choices.get("items") or [] if isinstance(i, dict) and isinstance(i.get("label"), str)]
            out += [(f"{sid}.choices.option", o) for o in choices.get("options") or [] if isinstance(o, str)]
    return out


def map_texts(terms: list[dict[str, Any]]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for entry in terms:
        name = str(entry.get("term", "?"))
        for key in ("gloss", "analogy", "recap"):
            if isinstance(entry.get(key), str) and entry[key]:
                out.append((f"{name}.{key}", entry[key]))
    return out


# ---------------------------------------------------------------- graph


def check_graph(stations: list[dict[str, Any]], report: Report, rel: str) -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for st in stations:
        sid = st.get("id")
        if sid in by_id:
            report.error("GRAPH_DUPLICATE", rel, f"station id {sid!r} appears more than once")
        by_id[sid] = st
    for sid, st in by_id.items():
        for field in ("needs", "betterWith"):
            for ref in st.get(field) or []:
                if ref not in by_id:
                    report.error("GRAPH_UNRESOLVED", f"{rel}#{sid}", f"{field} names unknown station {ref!r}")

    white, grey, black = 0, 1, 2
    colour = {sid: white for sid in by_id}
    reported: set[frozenset[str]] = set()
    for start in by_id:
        if colour[start] != white:
            continue
        stack: list[tuple[str, Iterable[str]]] = [(start, iter(by_id[start].get("needs") or []))]
        path = [start]
        colour[start] = grey
        while stack:
            node, children = stack[-1]
            nxt = next((c for c in children if c in by_id), None)
            if nxt is None:
                colour[node] = black
                stack.pop()
                path.pop()
                continue
            if colour[nxt] == grey:
                cycle = frozenset(path[path.index(nxt):])
                if cycle not in reported:
                    reported.add(cycle)
                    report.error("GRAPH_CYCLE", f"{rel}#{nxt}", f"needs form a loop through {' -> '.join(path[path.index(nxt):] + [nxt])}")
            elif colour[nxt] == white:
                colour[nxt] = grey
                path.append(nxt)
                stack.append((nxt, iter(by_id[nxt].get("needs") or [])))
    return by_id


# ---------------------------------------------------------------- scope


def check_scope(scope: dict[str, Any], stations: dict[str, dict[str, Any]] | None, root: Path, report: Report) -> list[dict[str, Any]]:
    rel = "scope.json"
    order = scope.get("readingOrder")
    if not isinstance(order, list) or not order:
        report.error("SCOPE_FIELD", rel, "readingOrder must be a non-empty list")
        return []
    assumed = scope.get("assumed") or {}
    shown = scope.get("shownOnMap") or {}
    if not isinstance(shown, dict):
        report.error("SCOPE_FIELD", rel, "shownOnMap must be an object of station id to a note")
        shown = {}
    if stations is not None:
        for sid in assumed:
            if sid not in stations:
                report.error("SCOPE_UNKNOWN_STATION", f"{rel}#assumed", f"assumed station {sid!r} is not in stations.json")
        for sid in shown:
            if sid not in stations:
                report.error("SCOPE_UNKNOWN_STATION", f"{rel}#shownOnMap", f"station {sid!r} shown on the map is not in stations.json")
    seen_ids: set[str] = set()
    earlier_stations: set[str] = set()
    items: list[dict[str, Any]] = []
    for item in order:
        iid = item.get("id")
        where = f"{rel}#{iid}"
        if iid in seen_ids:
            report.error("SCOPE_FIELD", where, "reading-order id repeated")
        seen_ids.add(iid)
        kind = item.get("kind")
        if kind not in ("story", "lesson"):
            report.error("SCOPE_FIELD", where, f"kind must be story or lesson, not {kind!r}")
        sid = item.get("station")
        if stations is not None and sid not in stations:
            report.error("SCOPE_UNKNOWN_STATION", where, f"station {sid!r} is not in stations.json")
        elif stations is not None:
            if kind == "story" and not stations[sid].get("destination"):
                report.error("STORY_NOT_DESTINATION", where, f"story is attached to {sid!r}, which is not a destination")
            if kind == "lesson":
                for need in stations[sid].get("needs") or []:
                    if need not in earlier_stations and need not in assumed:
                        report.error("SCOPE_ORDER", where, f"{sid!r} needs {need!r}, which is neither earlier in the reading order nor assumed")
        for key in ("file", "chapter"):
            if key in item and not (root / item[key]).is_file():
                report.error("FILE_MISSING", f"{rel}#{iid}", f"{key} {item[key]!r} not found")
        if kind == "lesson" and sid:
            earlier_stations.add(sid)
        items.append(item)
    return items


# ---------------------------------------------------------------- lessons


def _placeholders(text: str, where: str, report: Report) -> None:
    for name in PLACEHOLDER_RE.findall(text):
        if name not in PLACEHOLDERS:
            report.error("PLACEHOLDER_UNKNOWN", where, f"{{{name}}} is not a fill-in value the coach knows")


def _check_command(cmd: str, where: str, report: Report) -> None:
    for pattern, reason in UNSAFE_COMMAND:
        if re.search(pattern, cmd):
            report.error("DOIT_UNSAFE", where, f"command {reason}")


def _check_real(check: dict[str, Any], where: str, probes: dict[str, Any] | None, report: Report) -> None:
    has_one, has_many = "probe" in check, "probes" in check
    if has_one == has_many:
        report.error("CHECK_FIELD", where, "a real check needs exactly one of probe or probes")
        return
    names = [check["probe"]] if has_one else check["probes"]
    if not isinstance(names, list) or not names or not all(isinstance(n, str) for n in names):
        report.error("CHECK_FIELD", where, "probes must be a non-empty list of names")
        return
    params = check.get("params") or {}
    if not isinstance(params, dict):
        report.error("CHECK_FIELD", where, "params must be an object")
        return
    for value in params.values():
        if isinstance(value, str):
            _placeholders(value, where, report)
    if probes is None:
        return
    for name in names:
        spec = probes.get(name)
        if spec is None:
            report.error("PROBE_UNKNOWN", where, f"probe {name!r} is not on the allowlist in probes.py")
            continue
        for needed in spec.get("params", ()):
            if needed not in params:
                report.error("PROBE_PARAM", where, f"probe {name!r} needs param {needed!r}")


# Number of options each grade needs: fit is fits / doesn't; band is fits / depends / doesn't.
CHOICE_GRADES = {"fit": 2, "band": 3}
MIN_OPTIONS = 2


def _check_choices(check: dict[str, Any], kind: str, where: str, report: Report) -> None:
    """A check's choices (story 11): rows the learner answers with buttons, marked in code."""
    choices = check["choices"]
    ok = (
        kind == "ask"
        and isinstance(choices, dict)
        and isinstance(choices.get("items"), list) and choices["items"]
        and all(isinstance(i, dict) and isinstance(i.get("label"), str) and i["label"]
                and isinstance(i.get("gb"), (int, float)) and not isinstance(i["gb"], bool) and i["gb"] > 0
                for i in choices["items"])
        and isinstance(choices.get("options"), list) and len(choices["options"]) >= MIN_OPTIONS
        and all(isinstance(o, str) and o for o in choices["options"])
        and choices.get("grade") in CHOICE_GRADES
        and len(choices["options"]) == CHOICE_GRADES[choices["grade"]]
    )
    if not ok:
        report.error("CHECK_FIELD", where, "choices need an ask check, items with a label and a positive gb, and grade fit (two options) or band (three: fits, depends, doesn't)")


def check_step(step: Any, station: str, seen: set[str], rel: str, probes: dict[str, Any] | None, report: Report) -> None:
    if not isinstance(step, dict):
        report.error("STEP_FIELD", rel, "a step must be an object")
        return
    sid = step.get("id")
    where = f"{rel}#{sid}"
    for key in STEP_REQUIRED:
        if key not in step or step[key] in (None, ""):
            report.error("STEP_FIELD", where, f"step has no {key}")
    if isinstance(sid, str):
        if not re.fullmatch(rf"{re.escape(station)}\.\d+", sid):
            report.error("STEP_ID", where, f"step id must be {station}.<number>")
        if sid in seen:
            report.error("STEP_ID", where, "step id repeated")
        seen.add(sid)
    if "where" in step and step["where"] not in WHERE_VALUES:
        report.error("STEP_WHERE", where, f"where {step['where']!r} is not one of {sorted(WHERE_VALUES)}")

    do_it = step.get("doIt")
    if isinstance(do_it, dict):
        kind = do_it.get("kind")
        if kind not in DOIT_FIELDS:
            report.error("DOIT_KIND", where, f"doIt kind {kind!r} is not one of {sorted(DOIT_FIELDS)}")
        else:
            for key in DOIT_FIELDS[kind]:
                if not do_it.get(key):
                    report.error("DOIT_FIELD", where, f"doIt {kind} needs {key}")
            if kind in COMMAND_KINDS and isinstance(do_it.get("cmd"), str):
                _check_command(do_it["cmd"], where, report)
                _placeholders(do_it["cmd"], where, report)
    elif "doIt" in step:
        report.error("DOIT_KIND", where, "doIt must be an object")

    check = step.get("check")
    if isinstance(check, dict):
        kind = check.get("kind")
        if kind not in CHECK_FIELDS:
            report.error("CHECK_KIND", where, f"check kind {kind!r} is not one of {sorted(CHECK_FIELDS)}")
        else:
            for key in CHECK_FIELDS[kind]:
                if not check.get(key):
                    report.error("CHECK_FIELD", where, f"check {kind} needs {key}")
            if kind == "real":
                _check_real(check, where, probes, report)
            if "answeredByClaim" in check and (kind != "ask" or not isinstance(check["answeredByClaim"], bool)):
                report.error("CHECK_FIELD", where, "answeredByClaim is a true or false on an ask check only")
            if "choices" in check:
                _check_choices(check, kind, where, report)
    elif "check" in step:
        report.error("CHECK_KIND", where, "check must be an object")

    on_fail = step.get("onFail")
    if on_fail is not None and not (isinstance(on_fail, dict) and on_fail.get("pattern") and on_fail.get("say")):
        report.error("STEP_FIELD", where, "onFail needs pattern and say")


def check_lesson(lesson: Any, item: dict[str, Any], stations: dict[str, dict[str, Any]] | None, probes: dict[str, Any] | None, report: Report) -> None:
    rel = item["file"]
    if not isinstance(lesson, dict):
        report.error("LESSON_FIELD", rel, "a lesson must be an object")
        return
    for key in LESSON_REQUIRED:
        if key not in lesson:
            report.error("LESSON_FIELD", rel, f"lesson has no {key}")
    station = lesson.get("station")
    if stations is not None and station not in stations:
        report.error("LESSON_STATION_UNKNOWN", rel, f"station {station!r} is not in stations.json")
    if station != item.get("station"):
        report.error("LESSON_STATION_MISMATCH", rel, f"lesson station {station!r} differs from scope.json {item.get('station')!r}")
    if Path(rel).stem != station:
        report.error("LESSON_FILE_NAME", rel, f"file name must be {station}.json")
    if lesson.get("status") not in LESSON_STATUSES:
        report.error("LESSON_FIELD", rel, f"status must be one of {sorted(LESSON_STATUSES)}")
    if lesson.get("status") == "draft" and not lesson.get("untested"):
        report.error("DRAFT_UNTESTED", rel, "a draft lesson must list what is untested")
    for key in ("why", "mnem"):
        if key in lesson and not (isinstance(lesson[key], str) and lesson[key].strip()):
            report.error("LESSON_FIELD", rel, f"{key} must be non-empty text")
    if "stands" in lesson and lesson["stands"] is not None and not isinstance(lesson["stands"], str):
        report.error("LESSON_FIELD", rel, "stands must be text or null")
    steps = lesson.get("steps")
    if "steps" in lesson and not (isinstance(steps, list) and steps):
        report.error("LESSON_FIELD", rel, "steps must be a non-empty list")
        steps = []
    if "recap" in lesson and not (isinstance(lesson["recap"], list) and lesson["recap"]):
        report.error("LESSON_FIELD", rel, "recap must be a non-empty list")
    seen: set[str] = set()
    for step in steps or []:
        check_step(step, str(station), seen, rel, probes, report)
    for where, text in lesson_texts(lesson):
        _placeholders(text, f"{rel}#{where}", report)


# ---------------------------------------------------------------- terms


def check_map(terms: Any, order_ids: list[str], stations: dict[str, dict[str, Any]] | None, report: Report) -> list[dict[str, Any]]:
    rel = "map.json"
    if not isinstance(terms, list):
        report.error("MAP_FIELD", rel, "terms must be a list")
        return []
    good: list[dict[str, Any]] = []
    names: set[str] = set()
    for entry in terms:
        name = entry.get("term") if isinstance(entry, dict) else None
        where = f"{rel}#{name}"
        if not isinstance(entry, dict):
            report.error("MAP_FIELD", rel, "a term entry must be an object")
            continue
        missing = [k for k in MAP_REQUIRED if k not in entry]
        for key in missing:
            report.error("MAP_FIELD", where, f"term has no {key}")
        if missing:
            continue
        if name in names:
            report.error("MAP_FIELD", where, "term repeated")
        names.add(name)
        if not (isinstance(entry["forms"], list) and entry["forms"] and all(isinstance(f, str) and f for f in entry["forms"])):
            report.error("MAP_FIELD", where, "forms must be a non-empty list of text")
            continue
        for key in ("gloss", "recap", "definedIn"):
            if not (isinstance(entry[key], str) and entry[key].strip()):
                report.error("MAP_FIELD", where, f"{key} must be non-empty text")
        if entry["firstAt"] is not None and entry["firstAt"] not in order_ids:
            report.error("MAP_FIRSTAT", where, f"firstAt {entry['firstAt']!r} is not a reading-order id in scope.json")
            continue
        if stations is not None and entry["station"] is not None and entry["station"] not in stations:
            report.error("MAP_FIELD", where, f"station {entry['station']!r} is not in stations.json")
        good.append(entry)
    return good


def check_terms(
    items: list[dict[str, Any]],
    lessons: dict[str, dict[str, Any]],
    terms: list[dict[str, Any]],
    root: Path,
    report: Report,
) -> None:
    index = {item["id"]: i for i, item in enumerate(items)}
    by_name = {t["term"]: t for t in terms}
    patterns = {t["term"]: [_form_re(f) for f in t["forms"]] for t in terms}

    for i, item in enumerate(items):
        iid = item["id"]
        if item.get("kind") == "story":
            path = root / item["file"]
            if not path.is_file():
                continue
            story = path.read_text(encoding="utf-8")
            for t in terms:
                if t["firstAt"] == iid and not any(p.search(story) for p in patterns[t["term"]]):
                    report.error("STORY_TERM_ABSENT", item["file"], f"{t['term']!r} is said to be defined here but does not appear")
            continue

        lesson = lessons.get(iid)
        if lesson is None:
            continue
        rel = item["file"]
        teaches = set(lesson.get("teaches") or [])
        previews = set(lesson.get("previews") or [])
        for name in teaches:
            t = by_name.get(name)
            if t is None:
                report.error("TEACHES_UNKNOWN", rel, f"teaches {name!r}, which is not in map.json")
            elif t["firstAt"] != iid:
                report.error("TEACHES_UNKNOWN", rel, f"teaches {name!r}, but map.json says it is first defined at {t['firstAt']!r}")
        for name in previews:
            if name not in by_name:
                report.error("PREVIEW_UNKNOWN", rel, f"previews {name!r}, which is not in map.json")
        for t in terms:
            if t["firstAt"] == iid and t["term"] not in teaches:
                report.error("TEACHES_MISSING", rel, f"map.json defines {t['term']!r} here but the lesson does not list it in teaches")

        flagged: set[tuple[str, str]] = set()
        for where, text in lesson_texts(lesson):
            plain = _strip_code(text)
            for t in terms:
                name = t["term"]
                if not any(p.search(plain) for p in patterns[name]) or name in previews:
                    continue
                first = index.get(t["firstAt"]) if t["firstAt"] is not None else None
                key = (name, where)
                if key in flagged:
                    continue
                if first is None or first > i:
                    flagged.add(key)
                    report.error("TERM_EARLY", f"{rel}#{where}", f"uses {name!r} before it is defined ({t['definedIn']})")
                elif first == i and name not in teaches:
                    flagged.add(key)
                    report.error("TERM_NOT_TAUGHT", f"{rel}#{where}", f"uses {name!r}, defined in this lesson, but teaches does not list it")
            for t in terms:
                for phrase in t["avoid"]:
                    if not _literal_avoid(phrase):
                        continue
                    if _form_re(phrase).search(plain):
                        report.warn("AVOID_SYNONYM", f"{rel}#{where}", f"{phrase!r} is on the avoid list for {t['term']!r}")

        chapter = item.get("chapter")
        if chapter:
            check_chapter(chapter, root, iid, index, lesson, by_name, report)


def check_chapter(rel: str, root: Path, iid: str, index: dict[str, int], lesson: dict[str, Any], by_name: dict[str, dict[str, Any]], report: Report) -> None:
    fm = _front_matter(root / rel, rel, report)
    if fm is None:
        return
    stations = [s.get("id") for s in fm.get("stations") or [] if isinstance(s, dict)]
    if lesson.get("station") not in stations:
        report.error("CHAPTER_STATION", rel, f"front-matter stations {stations} do not include {lesson.get('station')!r}")
    for entry in fm.get("terms") or []:
        name = entry.get("term")
        t = by_name.get(name)
        if t is None:
            report.error("CHAPTER_TERM_MISSING", rel, f"front-matter term {name!r} is not in map.json")
            continue
        if t["firstAt"] != iid:
            report.error("CHAPTER_TERM_MISMATCH", rel, f"{name!r}: map.json firstAt is {t['firstAt']!r}, the chapter is {iid!r}")
        for key in CHAPTER_COMPARED:
            if _fold(entry.get(key)) != _fold(t.get(key)):
                report.error("CHAPTER_TERM_MISMATCH", rel, f"{name!r}: {key} differs between front-matter and map.json")
    for entry in fm.get("reEntry") or []:
        name = entry.get("term")
        t = by_name.get(name)
        first = index.get(t["firstAt"]) if t and t["firstAt"] is not None else None
        if t is None or first is None or first >= index[iid]:
            report.error("REENTRY_UNKNOWN", rel, f"re-entry term {name!r} is not defined earlier in map.json")


# ---------------------------------------------------------------- figures (Ceetrix story 7)

FIGURES_FILE = "figures.json"
FIGURES_DIR = "figures"
FIGURE_MARKER = re.compile(r"^<!-- figure: (\S+) -->$", re.M)
SVG_NS = "http://www.w3.org/2000/svg"
UNSAFE_TAGS = {"script", "foreignObject", "style", "iframe", "image", "use", "a"}
# The book's station colours, from stations.json inYourHead (the same mapping as src/coach/curriculum.py).
CRITICALITY = {"press go": "grey", "know what it does": "amber", "must understand": "red"}
CRIT_CLASS = re.compile(r"\bcoach-crit--(\w+)\b")
# The chapter 1 rule of thumb, kept here apart from the figure generator so a mistake there is caught.
HALF = 0.5
FIT_WORDS = {"fits": "Fits", "depends": "Depends", "no": "Doesn't fit"}
STORED = "stored"
PLACE_DRIVE = "drive"


def fit_verdict(file_gb: float, room_gb: float) -> str:
    if file_gb > room_gb:
        return "no"
    if file_gb >= HALF * room_gb:
        return "depends"
    return "fits"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _when(node: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in (node.get("data-when") or "").split():
        key, _, value = part.partition("=")
        out[key] = value
    return out


def _visible_tree(node: Any, state: dict[str, str]) -> Any | None:
    """The node as drawn in this state: (tag, attributes without data-when, text, children), or None."""
    if any(state.get(k, "") != v for k, v in _when(node).items()):
        return None
    attrs = tuple(sorted((k, v) for k, v in node.attrib.items() if k != "data-when"))
    children = tuple(t for t in (_visible_tree(c, state) for c in node) if t is not None)
    return (_local(node.tag), attrs, (node.text or "").strip(), children)


def _drawn(root: Any, state: dict[str, str]) -> list[Any]:
    """Every element drawn in this state (its own and its ancestors' conditions all hold)."""
    out: list[Any] = []

    def walk(node: Any) -> None:
        if any(state.get(k, "") != v for k, v in _when(node).items()):
            return
        out.append(node)
        for child in node:
            walk(child)

    walk(root)
    return out


def _states(controls: list[dict[str, Any]]) -> list[dict[str, str]]:
    states: list[dict[str, str]] = [{}]
    for control in controls:
        values = [str(o.get("value")) for o in control.get("options") or []]
        if control.get("default", None) == "":
            values = ["", *values]
        states = [{**s, control["name"]: v} for s in states for v in values]
    return states


def _gb(entry: dict[str, Any], state: dict[str, str], role: str) -> float | None:
    fixed = (entry.get("fixed") or {}).get(role)
    if fixed is not None:
        return float(fixed)
    for control in entry.get("controls") or []:
        if control.get("role") == role:
            option = next((o for o in control["options"] if str(o["value"]) == state.get(control["name"])), None)
            return float(option["gb"]) if option and "gb" in option else None
    return None


def _paragraph_before(text: str, at: int) -> str:
    before = text[:at].rstrip()
    para = before.rsplit("\n\n", 1)[-1]
    return " ".join(para.split())


def figure_texts(entry: dict[str, Any], svg_root: Any | None) -> list[tuple[str, str]]:
    fid = entry.get("id", "?")
    texts = [(f"{fid}.{key}", entry[key]) for key in ("title", "alt", "caption") if isinstance(entry.get(key), str)]
    for control in entry.get("controls") or []:
        texts.append((f"{fid}.{control.get('name')}.label", str(control.get("label", ""))))
        texts += [(f"{fid}.{control.get('name')}.{o.get('value')}", str(o.get("label", ""))) for o in control.get("options") or []]
    if svg_root is not None:
        seen: set[str] = set()
        for node in svg_root.iter():
            words = (node.text or "").strip()
            if _local(node.tag) in ("text", "title") and words and words not in seen:
                seen.add(words)
                texts.append((f"{fid}.svg", words))
    return texts


def check_figures(
    root: Path,
    items: list[dict[str, Any]],
    lessons: dict[str, dict[str, Any]],
    stations: dict[str, dict[str, Any]] | None,
    terms: list[dict[str, Any]],
    report: Report,
) -> list[tuple[str, str]]:
    """Placement, safety, states, arithmetic, colours, print drawings and words of every figure."""
    import xml.etree.ElementTree as ET

    rel = FIGURES_FILE
    doc = _load_json(root / rel, rel, report)
    if not isinstance(doc, dict) or not isinstance(doc.get("figures"), list):
        if doc is not None:
            report.error("FIGURE_PARSE", rel, "expected an object with a figures list")
        return []
    entries = {e.get("id"): e for e in doc["figures"] if isinstance(e, dict)}
    index = {item["id"]: i for i, item in enumerate(items)}
    item_files = {item["id"]: [f for f in (item.get("file") if item.get("kind") == "story" else None, item.get("chapter")) if f] for item in items}

    # Where each figure is placed: markers in the book files, figure fields on lesson steps.
    markers: dict[str, list[tuple[str, int, str]]] = {}
    for files in item_files.values():
        for book_rel in files:
            path = root / book_rel
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            for m in FIGURE_MARKER.finditer(text):
                fid = m.group(1)
                if fid not in entries:
                    report.error("FIGURE_UNKNOWN", book_rel, f"marker names {fid!r}, which is not in {rel}")
                    continue
                markers.setdefault(fid, []).append((book_rel, m.start(), _paragraph_before(text, m.start())))
    step_uses: dict[str, list[str]] = {}
    for lesson in lessons.values():
        for step in lesson.get("steps") or []:
            fid = step.get("figure") if isinstance(step, dict) else None
            if fid is None:
                continue
            if fid not in entries:
                report.error("FIGURE_UNKNOWN", f"{lesson.get('station')}#{step.get('id')}", f"step names figure {fid!r}, which is not in {rel}")
                continue
            step_uses.setdefault(fid, []).append(str(step.get("id")))

    texts: list[tuple[str, str]] = []
    patterns = {t["term"]: [_form_re(f) for f in t["forms"]] for t in terms}
    for fid, entry in entries.items():
        where = f"{rel}#{fid}"
        item = entry.get("item")
        book = entry.get("book") or {}
        coach = entry.get("coach") or {}
        if item not in index:
            report.error("FIGURE_PLACEMENT", where, f"item {item!r} is not in the reading order")
            continue

        # Book: exactly one marker, in the item's own file, after the named sentence.
        found = markers.get(fid, [])
        if len(found) != 1 or found[0][0] != book.get("file") or book.get("file") not in item_files[item]:
            report.error("FIGURE_PLACEMENT", where, f"needs exactly one marker in {book.get('file')!r} (a file of {item!r}); found {[f for f, _, _ in found]}")
        elif not found[0][2].endswith(" ".join(str(book.get("after", "")).split())) or not book.get("after"):
            report.error("FIGURE_AFTER", where, f"the marker follows {found[0][2][-60:]!r}, not {book.get('after')!r}")

        # Coach: the story's own marker, or exactly one lesson step at or after the item.
        uses = step_uses.get(fid, [])
        if "story" in coach:
            story_item = next((i for i in items if i["id"] == coach["story"] and i.get("kind") == "story"), None)
            if story_item is None or story_item.get("file") != book.get("file") or uses:
                report.error("FIGURE_PLACEMENT", where, "a story figure is shown where its marker is, and on no lesson step")
        elif "step" in coach:
            station = str(coach["step"]).split(".")[0]
            if uses != [coach["step"]] or index.get(station, -1) < index[item]:
                report.error("FIGURE_PLACEMENT", where, f"needs exactly one lesson step, {coach['step']!r}, at or after {item!r}; found {uses}")
        else:
            report.error("FIGURE_PLACEMENT", where, "coach must name a story or a step")

        # The drawing.
        svg_path = root / FIGURES_DIR / f"{fid}.svg"
        try:
            svg = ET.parse(svg_path).getroot()
        except (OSError, ET.ParseError) as exc:
            report.error("FIGURE_PARSE", f"{FIGURES_DIR}/{fid}.svg", f"cannot read the drawing: {exc}")
            texts += figure_texts(entry, None)
            continue
        for node in svg.iter():
            tag = _local(node.tag)
            if tag in UNSAFE_TAGS:
                report.error("FIGURE_UNSAFE", f"{FIGURES_DIR}/{fid}.svg", f"<{tag}> is not allowed in a figure")
            for key, value in node.attrib.items():
                name = _local(key)
                if name.lower().startswith("on"):
                    report.error("FIGURE_UNSAFE", f"{FIGURES_DIR}/{fid}.svg", f"event attribute {name!r} is not allowed")
                if name == "href" and not value.startswith("#"):
                    report.error("FIGURE_UNSAFE", f"{FIGURES_DIR}/{fid}.svg", f"href {value!r} points outside the figure")
                if "url(" in value and not re.fullmatch(r"url\(#[\w-]+\)", value):
                    report.error("FIGURE_UNSAFE", f"{FIGURES_DIR}/{fid}.svg", f"{name}={value!r} points outside the figure")

        # States: every condition names a choice that exists.
        controls = entry.get("controls") or []
        allowed = {c["name"]: {str(o["value"]) for o in c.get("options") or []} | ({""} if c.get("default") == "" else set()) for c in controls}
        for node in svg.iter():
            for key, value in _when(node).items():
                if key not in allowed or value not in allowed[key]:
                    report.error("FIGURE_WHEN", f"{FIGURES_DIR}/{fid}.svg", f"data-when {key}={value} is not a choice of this figure")
        for control in controls:
            if control.get("default") not in allowed[control["name"]]:
                report.error("FIGURE_WHEN", where, f"default {control.get('default')!r} of {control['name']!r} is not one of its choices")
        print_state = {c["name"]: c.get("default", "") for c in controls} | {k: str(v) for k, v in (entry.get("print") or {}).items()}
        if any(k not in allowed or v not in allowed[k] for k, v in print_state.items()):
            report.error("FIGURE_WHEN", where, f"print state {entry.get('print')} is not a combination of choices")

        # Each combination of choices draws exactly one result, and a fit result obeys the rule.
        check = entry.get("check")
        for state in _states(controls):
            results = [n for n in _drawn(svg, state) if "fig-result" in (n.get("class") or "").split()]
            label = " ".join(f"{k}={v}" for k, v in state.items())
            if len(results) != 1:
                report.error("FIGURE_VERDICT", where, f"{label or 'the drawing'} shows {len(results)} results, not one")
                continue
            if check != "fit":
                continue
            place = next((state[c["name"]] for c in controls if c.get("role") == "place"), None)
            file_gb, room_gb = _gb(entry, state, "file"), _gb(entry, state, "room")
            if place == PLACE_DRIVE:
                expected = STORED
            elif file_gb is None or room_gb is None:
                report.error("FIGURE_VERDICT", where, f"{label}: cannot tell the file and room sizes")
                continue
            else:
                expected = fit_verdict(file_gb, room_gb)
            got, words = results[0].get("data-verdict"), (results[0].text or "").strip()
            if got != expected or (expected in FIT_WORDS and not words.startswith(FIT_WORDS[expected])):
                report.error("FIGURE_VERDICT", where, f"{label}: shows {words!r}, but the rule says {FIT_WORDS.get(expected, expected)!r}")

        # Station colours match the station graph.
        if stations is not None:
            # A station may be drawn once per state; a wrong colour is one fault, reported once.
            wrong: dict[str, str] = {}
            for node in svg.iter():
                sid = node.get("data-station")
                if not sid:
                    continue
                m = CRIT_CLASS.search(node.get("class") or "")
                want = CRITICALITY.get((stations.get(sid) or {}).get("inYourHead", ""))
                if (m is None or m.group(1) != want) and sid not in wrong:
                    wrong[sid] = f"station {sid!r} is drawn {m.group(1) if m else 'without a colour'}; stations.json says {want}"
            for message in wrong.values():
                report.error("FIGURE_CRIT", where, message)

        # The print drawing is the source in its print state.
        print_rel = f"{FIGURES_DIR}/print/{fid}.svg"
        try:
            printed = ET.parse(root / print_rel).getroot()
        except (OSError, ET.ParseError) as exc:
            report.error("FIGURE_PARSE", print_rel, f"cannot read the print drawing: {exc}")
        else:
            if _visible_tree(printed, {}) != _visible_tree(svg, print_state):
                report.error("FIGURE_PRINT", print_rel, f"differs from {fid}.svg in its print state; run curriculum/figures/make_figures.py")

        # Words: defined before use at the figure's place in the reading order.
        own = figure_texts(entry, svg)
        texts += own
        for text_where, words in own:
            for t in terms:
                first = index.get(t["firstAt"]) if t["firstAt"] is not None else None
                if any(p.search(words) for p in patterns[t["term"]]) and (first is None or first > index[item]):
                    report.error("TERM_EARLY", f"{rel}#{text_where}", f"uses {t['term']!r} before it is defined ({t['definedIn']})")

    for fid in entries:
        if not isinstance(fid, str) or not re.fullmatch(r"[a-z0-9-]{1,64}", fid):
            report.error("FIGURE_PARSE", rel, f"figure id {fid!r} must be lower-case letters, digits and hyphens")
    return texts


# ---------------------------------------------------------------- voice


def check_voice(blocks: list[tuple[str, list[tuple[str, str]]]], stylecheck: Path, report: Report) -> None:
    for rel, texts in blocks:
        for where, text in texts:
            if DASH_RE.search(text):
                report.error("STYLE_DASH", f"{rel}#{where}", "contains an em or en dash")
        if not texts:
            continue
        if not stylecheck.is_file():
            report.error("STYLE_TOOL", rel, f"style script not found at {stylecheck}")
            continue
        with tempfile.NamedTemporaryFile("w", suffix=".txt", encoding="utf-8", delete=False) as tmp:
            tmp.write("\n\n".join(text for _, text in texts))
            tmp_path = Path(tmp.name)
        try:
            run = subprocess.run(
                [sys.executable, str(stylecheck), "--book", str(tmp_path)],
                capture_output=True, text=True, timeout=STYLECHECK_TIMEOUT_S, check=False,
            )
        finally:
            tmp_path.unlink(missing_ok=True)
        line = next((ln for ln in run.stdout.splitlines() if ln.startswith(AVOID_HITS_PREFIX)), None)
        if run.returncode != 0 or line is None:
            report.error("STYLE_TOOL", rel, f"style script failed: {run.stderr.strip()[-200:]}")
            continue
        value = line[len(AVOID_HITS_PREFIX):].strip()
        if value == "none":
            continue
        for pattern, count in ast.literal_eval(value):
            if pattern in DASH_PATTERNS:
                continue  # reported per string by STYLE_DASH
            report.error("STYLE_AVOID", rel, f"avoid-list pattern {pattern!r} matched {count} time(s)")


# ---------------------------------------------------------------- entry points


def check_app_names(stations: dict[str, dict[str, Any]], tsx: Path, report: Report) -> None:
    """The station names written into the app (its map before a snapshot) are the curriculum's."""
    try:
        source = tsx.read_text(encoding="utf-8")
    except OSError:
        report.error("FILE_MISSING", str(tsx), "the app's default station list was not found")
        return
    for sid, name in APP_STATION.findall(source):
        want = (stations.get(sid) or {}).get("name")
        if want is None:
            report.error("APP_STATION_NAME", tsx.name, f"station {sid!r} is not in stations.json")
        elif name != want:
            report.error("APP_STATION_NAME", tsx.name, f"{sid!r} is shown as {name!r}; stations.json says {want!r}")


def validate(root: Path = DEFAULT_ROOT, probes_path: Path = DEFAULT_PROBES, stylecheck_path: Path = DEFAULT_STYLECHECK,
             app_stations: Path | None = None) -> list[Issue]:
    """app_stations: the app file whose default station names must match; checked for the real
    curriculum by default, and for another root only when passed (the tests' frozen copy has old names)."""
    report = Report()
    root = Path(root)
    if app_stations is None and root.resolve() == DEFAULT_ROOT.resolve():
        app_stations = DEFAULT_APP_STATIONS

    stations_doc = _load_json(root / "stations.json", "stations.json", report)
    stations: dict[str, dict[str, Any]] | None = None
    if isinstance(stations_doc, dict) and isinstance(stations_doc.get("stations"), list):
        stations = check_graph(stations_doc["stations"], report, "stations.json")
    elif stations_doc is not None:
        report.error("FILE_PARSE", "stations.json", "expected an object with a stations list")

    probes = _load_probes(Path(probes_path), report)
    if app_stations is not None and stations is not None:
        check_app_names(stations, Path(app_stations), report)

    scope = _load_json(root / "scope.json", "scope.json", report)
    items = check_scope(scope, stations, root, report) if isinstance(scope, dict) else []
    order_ids = [item.get("id") for item in items]

    lessons: dict[str, dict[str, Any]] = {}
    for item in items:
        if item.get("kind") != "lesson" or not (root / item.get("file", "")).is_file():
            continue
        lesson = _load_json(root / item["file"], item["file"], report)
        if lesson is None:
            continue
        check_lesson(lesson, item, stations, probes, report)
        if isinstance(lesson, dict):
            lessons[item["id"]] = lesson

    map_doc = _load_json(root / "map.json", "map.json", report)
    terms = check_map(map_doc.get("terms") if isinstance(map_doc, dict) else None, order_ids, stations, report) if map_doc is not None else []
    if items:
        check_terms(items, lessons, terms, root, report)

    figure_words = check_figures(root, items, lessons, stations, terms, report) if items else []

    blocks = [(item["file"], lesson_texts(lessons[item["id"]])) for item in items if item["id"] in lessons]
    blocks.append(("map.json", map_texts(terms)))
    blocks.append((FIGURES_FILE, figure_words))
    check_voice(blocks, Path(stylecheck_path), report)
    return report.issues


def summary(root: Path = DEFAULT_ROOT) -> dict[str, int]:
    """Counts for the success line. Assumes the tree has already validated."""
    stations = json.loads((root / "stations.json").read_text(encoding="utf-8"))["stations"]
    scope = json.loads((root / "scope.json").read_text(encoding="utf-8"))
    lessons = [json.loads((root / i["file"]).read_text(encoding="utf-8")) for i in scope["readingOrder"] if i["kind"] == "lesson"]
    terms = json.loads((root / "map.json").read_text(encoding="utf-8"))["terms"]
    return {
        "stations": len(stations),
        "lessons": len(lessons),
        "steps": sum(len(lesson["steps"]) for lesson in lessons),
        "terms": len(terms),
    }


def untested(root: Path = DEFAULT_ROOT) -> list[tuple[str, str, list[str]]]:
    scope = json.loads((root / "scope.json").read_text(encoding="utf-8"))
    out = []
    for item in scope["readingOrder"]:
        if item["kind"] != "lesson":
            continue
        lesson = json.loads((root / item["file"]).read_text(encoding="utf-8"))
        if lesson.get("untested"):
            out.append((item["file"], lesson.get("status", "?"), lesson["untested"]))
    return out


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    root = Path(args[0]) if args else DEFAULT_ROOT
    issues = validate(root)
    for issue in issues:
        print(issue)
    errors = sum(1 for i in issues if i.level == ERROR)
    warnings = len(issues) - errors
    if errors:
        print(f"\n{errors} error(s), {warnings} warning(s). The curriculum is not valid.")
        return 1
    counts = summary(root)
    for rel, status, notes in untested(root):
        print(f"\nuntested in {rel} ({status}):")
        for note in notes:
            print(f"  - {note}")
    print(
        f"\nThe curriculum is valid: {counts['stations']} stations, {counts['lessons']} lessons, "
        f"{counts['steps']} steps, {counts['terms']} terms. {warnings} warning(s)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
