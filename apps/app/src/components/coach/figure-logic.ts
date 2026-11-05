/**
 * The rules a figure is drawn by (Ceetrix story 7). A figure is an SVG whose
 * states are elements carrying data-when="key=value ...": an element is drawn
 * when every condition matches the learner's current choices, and always when
 * it has none. "pick=" matches only while no choice has been made.
 */

export type Choices = Record<string, string>;

export type FigureOption = { value: string; label: string };
export type FigureControl = { name: string; label: string; default?: string; options: FigureOption[] };
export type FigureData = {
  id: string;
  title: string;
  alt: string;
  caption: string;
  controls: FigureControl[];
  svg: string;
};

export function parseWhen(when: string | null | undefined): Choices {
  const out: Choices = {};
  for (const part of (when ?? "").split(/\s+/)) {
    if (!part) continue;
    const at = part.indexOf("=");
    if (at < 0) out[part] = "";
    else out[part.slice(0, at)] = part.slice(at + 1);
  }
  return out;
}

export function visible(conditions: Choices, choices: Choices): boolean {
  return Object.entries(conditions).every(([key, value]) => (choices[key] ?? "") === value);
}

export function defaultChoices(controls: FigureControl[]): Choices {
  return Object.fromEntries(controls.map((control) => [control.name, control.default ?? ""]));
}

/** A story unit that is a figure marker gives the figure's id; any other unit gives null. */
export const FIGURE_MARKER = /^<!-- figure: ([a-z0-9-]{1,64}) -->$/;

export function figureId(unit: string): string | null {
  return FIGURE_MARKER.exec(unit.trim())?.[1] ?? null;
}

const UNSAFE_TAGS = ["script", "foreignObject", "style", "iframe", "image", "use", "a"];
const LOCAL_URL = /^url\(#[\w-]+\)$/;

/**
 * The SVG with anything that could run code or load from elsewhere removed.
 * The validator refuses such figures already; this is the second lock. Returns
 * "" when the markup is not an SVG.
 */
export function sanitiseSvg(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
  for (const tag of UNSAFE_TAGS) {
    for (const node of Array.from(svg.getElementsByTagName(tag))) node.remove();
  }
  for (const node of [svg, ...Array.from(svg.getElementsByTagName("*"))]) {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.localName.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) node.removeAttribute(attr.name);
      else if (name === "href" && !value.startsWith("#")) node.removeAttribute(attr.name);
      else if (value.includes("url(") && !LOCAL_URL.test(value)) node.removeAttribute(attr.name);
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

/** Whether an element is drawn: its own conditions and every ancestor's hold. */
export function drawn(node: Element, choices: Choices, stop?: Element): boolean {
  for (let at: Element | null = node; at && at !== stop; at = at.parentElement) {
    if (!visible(parseWhen(at.getAttribute("data-when")), choices)) return false;
  }
  return true;
}

/** The words of the one result line drawn for these choices, for the screen-reader live region. */
export function resultText(svgMarkup: string, choices: Choices): string {
  if (!svgMarkup) return "";
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const shown = Array.from(doc.querySelectorAll(".fig-result")).find((node) => drawn(node, choices));
  return shown?.textContent?.trim() ?? "";
}
