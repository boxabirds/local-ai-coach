"""Generate the curriculum's figures (Ceetrix story 7).

    python3 curriculum/figures/make_figures.py           write every figure and its print drawing
    python3 curriculum/figures/make_figures.py --check   write nothing; exit 1 naming each stale file

Each figure is one SVG. Its states are elements carrying data-when="key=value ...":
an element is drawn when every condition matches the learner's current choices,
and always when it has none. The registry (curriculum/figures.json) names the
choices. The print drawing (print/<id>.svg) is the same SVG with every element
whose conditions fail the registry's print state removed, so the book shows one
state and the coach shows them all from the same file.

The drawings use presentation attributes and class names only: no <style>, no
script, no external references, every word in a <text>. The coach restyles the
classes for its themes; the attributes are the print colours. The words and the
fit arithmetic are checked by curriculum/validate.py, which has its own copy of
the rule, so a mistake here is caught there.
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
REGISTRY = HERE.parent / "figures.json"
PRINT_DIR = HERE / "print"

SVG_NS = "http://www.w3.org/2000/svg"
WIDTH = 640
FONT = "system-ui, -apple-system, Segoe UI, sans-serif"
SIZE_TEXT = 15
SIZE_SMALL = 13
SIZE_TITLE = 16

# Print colours (the coach's light theme). The coach restyles these classes.
INK = "#1c1c28"
MUTED = "#55556a"
LINE = "#8b8ba3"
PAPER = "#ffffff"
SOFT = "#dbe6ff"
ACCENT = "#1d4ed8"
CODE = "#f2f2f4"
CRIT = {"grey": "#6b7280", "amber": "#b45309", "red": "#b91c1c"}

THREE_QUARTERS = 0.75
FITS, SQUEEZE, NO = "fits", "squeeze", "no"
STORED = "stored"
VERDICT_WORDS = {FITS: "Fits", SQUEEZE: "A squeeze", NO: "Doesn't run"}


def fit(file_gb: float, room_gb: float) -> str:
    """The chapter 1 rule of thumb: over the room, no; over three quarters, a squeeze."""
    if file_gb > room_gb:
        return NO
    if file_gb > THREE_QUARTERS * room_gb:
        return SQUEEZE
    return FITS


def gb(value: float) -> str:
    return f"{value:g} GB"


# ---------------------------------------------------------------- drawing helpers


class Svg:
    def __init__(self, fid: str, height: int, title: str):
        self.fid = fid
        self.root = ET.Element("svg", {
            "xmlns": SVG_NS, "viewBox": f"0 0 {WIDTH} {height}", "width": str(WIDTH), "height": str(height),
            "font-family": FONT, "class": "fig", "data-figure": fid,
        })
        ET.SubElement(self.root, "title").text = title

    def el(self, tag: str, attrs: dict[str, Any], when: str | None = None, parent: ET.Element | None = None, text: str | None = None) -> ET.Element:
        clean = {k: (f"{v:g}" if isinstance(v, float) else str(v)) for k, v in attrs.items()}
        if when:
            clean["data-when"] = when
        node = ET.SubElement(self.root if parent is None else parent, tag, clean)
        if text is not None:
            node.text = text
        return node

    def group(self, when: str | None = None, **attrs: Any) -> ET.Element:
        return self.el("g", attrs, when)

    def rect(self, x: float, y: float, w: float, h: float, *, cls: str, fill: str = "none", stroke: str = "none", when: str | None = None, parent: ET.Element | None = None, **extra: Any) -> ET.Element:
        return self.el("rect", {"x": x, "y": y, "width": w, "height": h, "class": cls, "fill": fill, "stroke": stroke, **extra}, when, parent)

    def line(self, x1: float, y1: float, x2: float, y2: float, *, cls: str, stroke: str = LINE, when: str | None = None, parent: ET.Element | None = None, **extra: Any) -> ET.Element:
        return self.el("line", {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "class": cls, "stroke": stroke, **extra}, when, parent)

    def text(self, x: float, y: float, words: str, *, size: int = SIZE_TEXT, anchor: str = "start", weight: str = "normal", cls: str = "fig-ink", fill: str = INK, when: str | None = None, parent: ET.Element | None = None, **extra: Any) -> ET.Element:
        attrs = {"x": x, "y": y, "font-size": size, "text-anchor": anchor, "class": cls, "fill": fill, **extra}
        if weight != "normal":
            attrs["font-weight"] = weight
        return self.el("text", attrs, when, parent, words)

    def result(self, x: float, y: float, words: str, *, when: str | None, verdict: str | None = None, anchor: str = "start") -> ET.Element:
        """The one line that says what the drawing shows. Exactly one is drawn per state."""
        extra = {"data-verdict": verdict} if verdict else {}
        return self.text(x, y, words, size=SIZE_TEXT, weight="bold", cls="fig-ink fig-result", anchor=anchor, when=when, **extra)

    def arrow(self, x1: float, y1: float, x2: float, y2: float, *, when: str | None = None, cls: str = "fig-accent-stroke", stroke: str = ACCENT) -> None:
        g = self.group(when)
        self.line(x1, y1, x2, y2, cls=cls, stroke=stroke, parent=g, **{"stroke-width": 3})
        head = 10
        dx, dy = x2 - x1, y2 - y1
        length = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / length, dy / length
        px, py = -uy, ux
        points = f"{x2:g},{y2:g} {x2 - ux * head + px * head / 2:g},{y2 - uy * head + py * head / 2:g} {x2 - ux * head - px * head / 2:g},{y2 - uy * head - py * head / 2:g}"
        self.el("polygon", {"points": points, "class": cls.replace("stroke", "fill"), "fill": stroke}, parent=g)

    def laptop(self, x: float, y: float, label: str, *, w: float = 120, h: float = 76) -> None:
        self.rect(x, y, w, h, cls="fig-paper fig-line-stroke", fill=PAPER, stroke=LINE, rx=6, **{"stroke-width": 2})
        self.rect(x - 12, y + h, w + 24, 10, cls="fig-line-fill", fill=LINE, rx=3)
        self.text(x + w / 2, y + h + 30, label, size=SIZE_SMALL, anchor="middle", cls="fig-muted", fill=MUTED)

    def box(self, x: float, y: float, label: str, *, w: float = 96, h: float = 44, when: str | None = None, sub: str | None = None) -> None:
        g = self.group(when)
        self.rect(x, y, w, h, cls="fig-code fig-line-stroke", fill=CODE, stroke=LINE, rx=6, parent=g, **{"stroke-width": 2})
        self.text(x + w / 2, y + h / 2 + 5, label, size=SIZE_SMALL, anchor="middle", weight="bold", parent=g)
        if sub:
            self.text(x + w / 2, y + h + 18, sub, size=SIZE_SMALL, anchor="middle", cls="fig-muted", fill=MUTED, parent=g)

    def tostring(self) -> str:
        ET.indent(self.root, space="  ")
        return ET.tostring(self.root, encoding="unicode") + "\n"


def hatch(svg: Svg) -> str:
    """A diagonal hatch for the part of a file that does not fit. Its id is per figure."""
    pid = f"{svg.fid}-over"
    defs = svg.el("defs", {})
    pat = svg.el("pattern", {"id": pid, "width": 8, "height": 8, "patternUnits": "userSpaceOnUse", "patternTransform": "rotate(45)"}, parent=defs)
    svg.line(0, 0, 0, 8, cls="fig-ink-stroke", stroke=INK, parent=pat, **{"stroke-width": 3})
    return f"url(#{pid})"


# ---------------------------------------------------------------- the figures


def where_words_go(entry: dict[str, Any]) -> Svg:
    svg = Svg(entry["id"], 300, entry["title"])
    last, tues = "when=last-year", "when=tuesday"
    # Her network: last year the laptop and the printer; on Tuesday the box too.
    svg.rect(20, 40, 330, 200, cls="fig-line-stroke", stroke=LINE, rx=14, when=last, **{"stroke-dasharray": "6 6", "stroke-width": 2})
    svg.rect(20, 40, 450, 200, cls="fig-line-stroke", stroke=LINE, rx=14, when=tues, **{"stroke-dasharray": "6 6", "stroke-width": 2})
    svg.text(36, 64, "Priya's network", size=SIZE_SMALL, cls="fig-muted", fill=MUTED)
    svg.laptop(60, 92, "Priya's laptop")
    svg.text(120, 112, "Chatting with:", size=SIZE_SMALL, anchor="middle", cls="fig-muted", fill=MUTED)
    svg.text(120, 136, "a company", anchor="middle", weight="bold", when=last)
    svg.text(120, 136, "backroom", anchor="middle", weight="bold", when=tues)
    svg.box(230, 180, "printer", w=90, h=36)
    svg.box(350, 96, "backroom", when=tues, sub="the box on the shelf")
    # Far away: a company's computers, outside her network.
    svg.rect(500, 80, 120, 80, cls="fig-code fig-line-stroke", fill=CODE, stroke=LINE, rx=6, **{"stroke-width": 2})
    svg.text(560, 112, "A company's", size=SIZE_SMALL, anchor="middle", weight="bold")
    svg.text(560, 130, "computers,", size=SIZE_SMALL, anchor="middle", weight="bold")
    svg.text(560, 148, "far away", size=SIZE_SMALL, anchor="middle", weight="bold")
    svg.arrow(185, 128, 494, 120, when=last)
    svg.arrow(185, 128, 344, 118, when=tues)
    svg.result(20, 280, "Last year: the letter left her network.", when=last)
    svg.result(20, 280, "Tuesday: the letter stays on her network.", when=tues)
    return svg


SPOT_ROWS = [("Chat app", "backroom"), ("Printer app", "printer"), ("Chat app", "a company's computers, far away")]
SPOT_WRONG = 3
SPOT_SAYS = {
    "": "Which line shouldn't be there? Pick one.",
    "1": "Not that one. backroom is the box on her shelf.",
    "2": "Not that one. The printer is on her network.",
    "3": "That one. Her letter is going somewhere she doesn't own, and nothing beeped.",
}


def spot_the_line(entry: dict[str, Any]) -> Svg:
    svg = Svg(entry["id"], 290, entry["title"])
    svg.rect(20, 20, 600, 210, cls="fig-paper fig-line-stroke", fill=PAPER, stroke=LINE, rx=8, **{"stroke-width": 2})
    svg.rect(20, 20, 600, 34, cls="fig-code", fill=CODE, rx=8)
    svg.text(36, 42, "Where each program is sending data", weight="bold")
    svg.text(604, 42, "Sample", size=SIZE_SMALL, anchor="end", cls="fig-muted", fill=MUTED)
    svg.text(56, 82, "Program", size=SIZE_SMALL, cls="fig-muted", fill=MUTED)
    svg.text(220, 82, "Sending to", size=SIZE_SMALL, cls="fig-muted", fill=MUTED)
    for n, (program, dest) in enumerate(SPOT_ROWS, start=1):
        y = 92 + (n - 1) * 44
        svg.rect(28, y, 584, 38, cls="fig-soft", fill=SOFT, rx=4, when=f"pick={n}")
        svg.text(36, y + 25, str(n), size=SIZE_SMALL, cls="fig-muted", fill=MUTED)
        svg.text(56, y + 25, program)
        svg.text(220, y + 25, dest, weight="bold" if n == SPOT_WRONG else "normal")
    for pick, words in SPOT_SAYS.items():
        svg.result(20, 268, words, when=f"pick={pick}")
    return svg


STATION_TEST = {
    "grey": "Grey: it ran.",
    "amber": "Amber: you can say in a sentence what it did.",
    "red": "Red: you can say what it looks like when it goes wrong.",
}


def station_glyph(svg: Svg, x: float, y: float, colour: str, station: str) -> None:
    attrs = {"class": f"fig-crit coach-crit--{colour}", "fill": CRIT[colour], "data-station": station}
    r = 18
    if colour == "grey":
        svg.el("circle", {"cx": x, "cy": y, "r": r, **attrs})
    elif colour == "amber":
        svg.el("polygon", {"points": f"{x:g},{y - r:g} {x + r:g},{y:g} {x:g},{y + r:g} {x - r:g},{y:g}", **attrs})
    else:
        svg.el("polygon", {"points": f"{x:g},{y - r:g} {x + r:g},{y + r * 0.8:g} {x - r:g},{y + r * 0.8:g}", **attrs})
        svg.text(x, y + 9, "!", size=SIZE_TEXT, anchor="middle", weight="bold", cls="fig-on-crit", fill=PAPER)


def three_stations(entry: dict[str, Any]) -> Svg:
    svg = Svg(entry["id"], 230, entry["title"])
    options = entry["controls"][0]["options"]
    xs = [110, 320, 530]
    svg.line(xs[0], 90, xs[-1], 90, cls="fig-line-stroke", stroke=LINE, **{"stroke-width": 8, "stroke-linecap": "round"})
    for x, option in zip(xs, options):
        sid = option["value"]
        colour = entry["crit"][sid]
        svg.el("circle", {"cx": x, "cy": 90, "r": 30, "class": "fig-accent-stroke", "fill": "none", "stroke": ACCENT, "stroke-width": 3}, when=f"station={sid}")
        station_glyph(svg, x, 90, colour, sid)
        svg.text(x, 150, option["label"], size=SIZE_SMALL, anchor="middle", weight="bold")
        svg.text(x, 170, colour.capitalize(), size=SIZE_SMALL, anchor="middle", cls="fig-muted", fill=MUTED)
        svg.result(WIDTH / 2, 212, STATION_TEST[colour], when=f"station={sid}", anchor="middle")
    svg.text(WIDTH / 2, 36, "Priya's week, on the map", anchor="middle", cls="fig-muted", fill=MUTED, size=SIZE_SMALL)
    return svg


def options_of(entry: dict[str, Any], name: str) -> list[dict[str, Any]]:
    return next(c for c in entry["controls"] if c["name"] == name)["options"]


ROOM_X = 40
ROOM_W = 440
OVER_MAX = 1.25  # how far past the room an overflowing file is drawn, as a share of the room
LABEL_INSIDE = 0.3  # a file bar at least this share of the room holds its own label


def file_bar(svg: Svg, y: float, h: float, file_gb: float, room_gb: float, over: str, when: str) -> None:
    g = svg.group(when)
    share = file_gb / room_gb
    inside = min(share, 1.0) * ROOM_W
    svg.rect(ROOM_X, y, max(inside, 4), h, cls="fig-accent-fill", fill=ACCENT, parent=g, rx=3)
    if share > 1:
        spill = (min(share, OVER_MAX) - 1) * ROOM_W
        svg.rect(ROOM_X + ROOM_W, y, spill, h, cls="fig-ink-stroke", fill=over, stroke=INK, parent=g, **{"stroke-dasharray": "4 3"})
        svg.text(ROOM_X + ROOM_W + 6, y - 6, "no room", size=SIZE_SMALL, cls="fig-muted", fill=MUTED, parent=g)


def room(svg: Svg, y: float, h: float, label_when: list[tuple[str, str]]) -> None:
    svg.rect(ROOM_X, y, ROOM_W, h, cls="fig-paper fig-ink-stroke", fill=PAPER, stroke=INK, rx=4, **{"stroke-width": 2})
    tq = ROOM_X + THREE_QUARTERS * ROOM_W
    svg.line(tq, y - 8, tq, y + h + 8, cls="fig-ink-stroke", stroke=INK, **{"stroke-dasharray": "3 3", "stroke-width": 1.5})
    svg.text(tq, y + h + 24, "three quarters", size=SIZE_SMALL, anchor="middle", cls="fig-muted", fill=MUTED)
    for words, when in label_when:
        svg.text(ROOM_X, y - 12, words, size=SIZE_SMALL, weight="bold", when=when)


def explain(file_gb: float, room_gb: float) -> str:
    verdict = fit(file_gb, room_gb)
    if verdict == NO:
        return f"Doesn't run: {gb(file_gb)} is bigger than {gb(room_gb)}."
    if verdict == SQUEEZE:
        return f"A squeeze: {gb(file_gb)} is over three quarters of {gb(room_gb)}."
    return f"Fits: {gb(file_gb)} is under three quarters of {gb(room_gb)}."


def will_it_fit(entry: dict[str, Any]) -> Svg:
    svg = Svg(entry["id"], 172, entry["title"])
    over = hatch(svg)
    rooms = options_of(entry, "memory")
    files = options_of(entry, "file")
    room(svg, 36, 56, [(f"Your memory: {gb(r['gb'])}", f"memory={r['value']}") for r in rooms])
    for r in rooms:
        for f in files:
            when = f"memory={r['value']} file={f['value']}"
            file_bar(svg, 48, 32, f["gb"], r["gb"], over, when)
            if f["gb"] / r["gb"] >= LABEL_INSIDE:
                svg.text(ROOM_X + 8, 69, f"model file, {gb(f['gb'])}", size=SIZE_SMALL, cls="fig-on-accent", fill=PAPER, when=when)
            else:
                svg.text(ROOM_X + 8 + max(f["gb"] / r["gb"] * ROOM_W, 4), 69, f"model file, {gb(f['gb'])}", size=SIZE_SMALL, when=when)
            svg.result(ROOM_X, 152, explain(f["gb"], r["gb"]), when=when, verdict=fit(f["gb"], r["gb"]))
    return svg


DRIVE_FILE_X = 330  # the file's place in the warehouse: right of the room's label, so the arrow down misses it
DRIVE_FILE_W = 130  # not to scale, like the drive; wide enough for its label


def room_and_warehouse(entry: dict[str, Any]) -> Svg:
    svg = Svg(entry["id"], 300, entry["title"])
    over = hatch(svg)
    files = options_of(entry, "file")
    room_gb = entry["fixed"]["room"]
    # The warehouse: the drive. Drawn wide and labelled not to scale.
    svg.rect(ROOM_X, 40, 560, 70, cls="fig-code fig-line-stroke", fill=CODE, stroke=LINE, rx=4, **{"stroke-width": 2})
    svg.text(ROOM_X, 30, "The drive: the warehouse, 2 TB", size=SIZE_SMALL, weight="bold")
    svg.text(ROOM_X + 552, 30, "not to scale", size=SIZE_SMALL, anchor="end", cls="fig-muted", fill=MUTED)
    room(svg, 166, 48, [(f"Memory: the room, {gb(room_gb)}", "")])
    for f in files:
        size = f["gb"]
        # On the drive: a small block in the warehouse. Loading copies it; it stays on the drive.
        g = svg.group(f"file={f['value']}")
        svg.rect(DRIVE_FILE_X, 58, DRIVE_FILE_W, 34, cls="fig-accent-fill", fill=ACCENT, rx=3, parent=g)
        svg.text(DRIVE_FILE_X + 8, 80, f"model file, {gb(size)}", size=SIZE_SMALL, cls="fig-on-accent", fill=PAPER, parent=g)
        svg.result(ROOM_X, 284, "Kept in the warehouse. Nothing is running yet.", when=f"file={f['value']} place=drive", verdict=STORED)
        # Loaded: the same file in the room, overflowing if it is bigger.
        when = f"file={f['value']} place=memory"
        svg.arrow(DRIVE_FILE_X + DRIVE_FILE_W / 2, 96, DRIVE_FILE_X + DRIVE_FILE_W / 2, 168, when=when)
        file_bar(svg, 174, 32, size, room_gb, over, when)
        svg.text(ROOM_X + 8, 195, f"model file, {gb(size)}", size=SIZE_SMALL, cls="fig-on-accent", fill=PAPER, when=when)
        svg.result(ROOM_X, 284, explain(size, room_gb), when=when, verdict=fit(size, room_gb))
    return svg


def one_file(entry: dict[str, Any]) -> Svg:
    svg = Svg(entry["id"], 290, entry["title"])
    over = hatch(svg)
    machines = options_of(entry, "machine")
    file_gb = entry["fixed"]["file"]
    # The file itself: one document shape.
    svg.el("path", {"d": "M40 30 h70 l20 20 v70 h-90 z", "class": "fig-accent-fill", "fill": ACCENT})
    svg.text(85, 92, gb(file_gb), size=SIZE_SMALL, anchor="middle", weight="bold", cls="fig-on-accent", fill=PAPER)
    svg.text(150, 60, "One model file. No account, no key,", size=SIZE_TEXT)
    svg.text(150, 82, "nothing else to call.", size=SIZE_TEXT)
    for m in machines:
        svg.text(150, 112, f"Copied to: {m['label']}", size=SIZE_SMALL, weight="bold", when=f"machine={m['value']}")
    room(svg, 176, 40, [(f"Its memory: {gb(m['gb'])}", f"machine={m['value']}") for m in machines])
    for m in machines:
        when = f"machine={m['value']}"
        file_bar(svg, 182, 28, file_gb, m["gb"], over, when)
        svg.result(ROOM_X, 276, explain(file_gb, m["gb"]), when=when, verdict=fit(file_gb, m["gb"]))
    return svg


BUILDERS: dict[str, Callable[[dict[str, Any]], Svg]] = {
    "where-words-go": where_words_go,
    "spot-the-line": spot_the_line,
    "three-stations": three_stations,
    "will-it-fit": will_it_fit,
    "room-and-warehouse": room_and_warehouse,
    "one-file": one_file,
}


# ---------------------------------------------------------------- states and print


def conditions(when: str) -> dict[str, str]:
    """data-when="a=1 b=2" as {a: 1, b: 2}. "pick=" means no choice made yet."""
    out: dict[str, str] = {}
    for part in when.split():
        key, _, value = part.partition("=")
        out[key] = value
    return out


def shown(node: ET.Element, state: dict[str, str]) -> bool:
    when = node.get("data-when")
    return not when or all(state.get(k, "") == v for k, v in conditions(when).items())


def strip(svg_text: str, state: dict[str, str]) -> str:
    """The drawing in one state: elements whose conditions fail are removed, the rest kept as they are."""
    root = ET.fromstring(svg_text)

    def walk(parent: ET.Element) -> None:
        for child in list(parent):
            if not shown(child, state):
                parent.remove(child)
            else:
                walk(child)
                child.attrib.pop("data-when", None)

    walk(root)
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="unicode").replace(f' xmlns:ns0="{SVG_NS}"', "").replace("ns0:", "") + "\n"


def default_state(entry: dict[str, Any]) -> dict[str, str]:
    return {c["name"]: c.get("default", "") for c in entry["controls"]}


def build(registry: dict[str, Any]) -> dict[Path, str]:
    ET.register_namespace("", SVG_NS)
    files: dict[Path, str] = {}
    for entry in registry["figures"]:
        source = BUILDERS[entry["id"]](entry).tostring()
        files[HERE / f"{entry['id']}.svg"] = source
        files[PRINT_DIR / f"{entry['id']}.svg"] = strip(source, {**default_state(entry), **entry["print"]})
    return files


def main(argv: list[str]) -> int:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    files = build(registry)
    if argv[1:] == ["--check"]:
        stale = [p for p, text in files.items() if not p.is_file() or p.read_text(encoding="utf-8") != text]
        for path in stale:
            print(f"stale: {path.relative_to(HERE.parent)}", file=sys.stderr)
        return 1 if stale else 0
    PRINT_DIR.mkdir(exist_ok=True)
    for path, text in files.items():
        path.write_text(text, encoding="utf-8")
    print(f"wrote {len(files)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
