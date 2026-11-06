/**
 * New words in an answer fade in (Ceetrix story 24).
 *
 * The Markdown is React's: editing its text nodes would break React's next update. So this only
 * reads it. It measures where the new characters sit (DOM Ranges, read-only) and lays covers in
 * the page's own background colour over them, in a layer the answer owns; each cover fades out,
 * which reads as the words fading in, and is then removed.
 */

export const COVER_CLASS = "answer-chunk-cover";
/** Longer than the CSS fade, so a cover whose animationend never fires is still removed. */
const REMOVE_AFTER_MS = 1000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** The page's own background, when no ancestor has a solid one. */
const FALLBACK_BACKGROUND = "Canvas";
const OPAQUE = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*1(?:\.0+)?\s*)?\)$/;

function textNodes(root: Node): Text[] {
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as Text);
  return out;
}

/** How many characters of text the answer holds. */
export function textLength(root: Node): number {
  return textNodes(root).reduce((sum, node) => sum + node.data.length, 0);
}

/** The first solid background colour from this element up, so a cover hides the text under it. */
function background(start: Element): string {
  for (let el: Element | null = start; el; el = el.parentElement) {
    const colour = getComputedStyle(el).backgroundColor;
    if (colour && OPAQUE.test(colour)) return colour;
  }
  return FALLBACK_BACKGROUND;
}

/** The rects of the characters from `from` to the end. */
function newRects(markdown: HTMLElement, from: number): DOMRect[] {
  const rects: DOMRect[] = [];
  let at = 0;
  for (const node of textNodes(markdown)) {
    const end = at + node.data.length;
    if (end > from) {
      const range = markdown.ownerDocument.createRange();
      range.setStart(node, Math.max(0, from - at));
      range.setEnd(node, node.data.length);
      for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    at = end;
  }
  return rects;
}

/**
 * Cover the text after `from` and fade the covers out. Returns the answer's text length now,
 * for the next step's `from`. Never changes the Markdown; never throws.
 */
export function fadeNewText(markdown: HTMLElement, layer: HTMLElement, from: number): number {
  const total = textLength(markdown);
  if (total <= from) return total;
  if (typeof window !== "undefined" && window.matchMedia?.(REDUCED_MOTION).matches) return total;
  let rects: DOMRect[];
  try {
    rects = newRects(markdown, from);
  } catch {
    return total; // no layout to measure: show the words without a fade
  }
  if (!rects.length) return total;
  const origin = layer.getBoundingClientRect();
  const colour = background(markdown);
  for (const rect of rects) {
    const cover = layer.ownerDocument.createElement("div");
    cover.className = COVER_CLASS;
    Object.assign(cover.style, {
      left: `${rect.left - origin.left}px`,
      top: `${rect.top - origin.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      background: colour,
    });
    const remove = () => cover.remove();
    cover.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, REMOVE_AFTER_MS);
    layer.append(cover);
  }
  return total;
}
