import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COVER_CLASS, fadeNewText, textLength } from "../fade-new-text";

/** New words fade in under covers in a layer we own (Ceetrix story 24, TC-06 to TC-11). Made-up text. */
const RECT = { left: 10, top: 20, width: 40, height: 16, right: 50, bottom: 36, x: 10, y: 20, toJSON: () => ({}) } as DOMRect;
let rects: DOMRect[] = [RECT];
let reduced = false;

function answer(html: string) {
  const host = document.createElement("div");
  const markdown = document.createElement("div");
  markdown.innerHTML = html;
  const layer = document.createElement("div");
  host.append(markdown, layer);
  document.body.append(host);
  return { host, markdown, layer };
}

beforeEach(() => {
  rects = [RECT];
  reduced = false;
  Range.prototype.getClientRects = function () { return rects as unknown as DOMRectList; };
  Element.prototype.getBoundingClientRect = function () { return { ...RECT, left: 0, top: 0 } as DOMRect; };
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") && reduced, media: query })) as typeof window.matchMedia;
});
afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

describe("fadeNewText", () => {
  it("TC-06 the new words get one cover per measured line, in the layer", () => {
    const { markdown, layer } = answer("<p>Old words</p>");
    const before = textLength(markdown);
    markdown.querySelector("p")!.textContent = "Old words and new ones";
    rects = [RECT, { ...RECT, top: 40, y: 40 } as DOMRect];
    expect(fadeNewText(markdown, layer, before)).toBe(textLength(markdown));
    const covers = layer.querySelectorAll(`.${COVER_CLASS}`);
    expect(covers).toHaveLength(2);
    expect((covers[0] as HTMLElement).style.width).toBe("40px");
  });

  it("TC-07 a cover is removed when its fade ends", () => {
    const { markdown, layer } = answer("<p>Old</p>");
    markdown.querySelector("p")!.textContent = "Old new";
    fadeNewText(markdown, layer, 3);
    const cover = layer.querySelector(`.${COVER_CLASS}`)!;
    cover.dispatchEvent(new Event("animationend"));
    expect(layer.querySelector(`.${COVER_CLASS}`)).toBeNull();
  });

  it("TC-07 a cover whose fade never reports its end is removed anyway", () => {
    vi.useFakeTimers();
    const { markdown, layer } = answer("<p>Old new</p>");
    fadeNewText(markdown, layer, 3);
    vi.advanceTimersByTime(2000);
    expect(layer.querySelector(`.${COVER_CLASS}`)).toBeNull();
  });

  it("TC-08 text already there (from = its length) gets no cover", () => {
    const { markdown, layer } = answer("<p>A kept sample answer</p>");
    expect(fadeNewText(markdown, layer, textLength(markdown))).toBe(textLength(markdown));
    expect(layer.children).toHaveLength(0);
  });

  it("TC-09 reduced motion gets no cover", () => {
    reduced = true;
    const { markdown, layer } = answer("<p>Old new</p>");
    fadeNewText(markdown, layer, 3);
    expect(layer.children).toHaveLength(0);
  });

  it("TC-10 a measurement that throws gives no cover and no error", () => {
    Range.prototype.getClientRects = () => { throw new Error("no layout"); };
    const { markdown, layer } = answer("<p>Old new</p>");
    expect(() => fadeNewText(markdown, layer, 3)).not.toThrow();
    expect(layer.children).toHaveLength(0);
  });

  it("TC-11 the Markdown's own nodes are never changed", () => {
    const { markdown, layer } = answer("<p>Old <strong>new</strong> words</p><ul><li>one</li></ul>");
    const before = markdown.innerHTML;
    const nodes = markdown.querySelectorAll("*").length;
    fadeNewText(markdown, layer, 2);
    expect(markdown.innerHTML).toBe(before);
    expect(markdown.querySelectorAll("*").length).toBe(nodes);
    expect(layer.children.length).toBeGreaterThan(0);
  });
});
