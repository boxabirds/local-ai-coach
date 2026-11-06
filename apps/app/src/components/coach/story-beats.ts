/**
 * Splits a story's Markdown into the units the reader advances through one at a
 * time (Ceetrix story 3). The story card shows one sentence per bubble
 * (storySentences); storyBeats (runs of whole blocks) is kept for longer texts.
 *
 * A block is a heading line, a paragraph, or a list. Every heading starts a new
 * beat and stays with what follows it. Otherwise blocks are added to a beat
 * until the next one would take it past BEAT_WORDS. A single block longer than
 * that is a beat on its own; blocks are never cut. Joining the beats with blank
 * lines gives back every block, in order.
 */

export const BEAT_WORDS = 70;

const HEADING = /^#{1,6}\s/;
const LIST_ITEM = /^\s*([-*]|\d+\.)\s/;

export function storyBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) {
      flush();
    } else if (HEADING.test(line)) {
      flush();
      blocks.push(line);
    } else {
      // A list and the paragraph next to it are separate blocks even without a blank line.
      const lastIsList = current.length > 0 && LIST_ITEM.test(current[current.length - 1]);
      if (current.length && LIST_ITEM.test(line) !== lastIsList) flush();
      current.push(line);
    }
  }
  flush();
  return blocks;
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function storyBeats(markdown: string, limit: number = BEAT_WORDS): string[] {
  const beats: string[][] = [];
  let beat: string[] = [];
  let count = 0;
  let headingOnly = false;
  for (const block of storyBlocks(markdown)) {
    const isHeading = HEADING.test(block);
    const size = words(block);
    const startNew = beat.length > 0 && (isHeading ? !headingOnly : !headingOnly && count + size > limit);
    if (startNew) {
      beats.push(beat);
      beat = [];
      count = 0;
    }
    beat.push(block);
    count += isHeading ? 0 : size;
    headingOnly = isHeading && (headingOnly || beat.length === 1);
  }
  if (beat.length) beats.push(beat);
  return beats.map((blocks) => blocks.join("\n\n"));
}

const OPENERS: Record<string, string> = { "(": ")", "“": "”", "‘": "’", "[": "]" };
const CLOSERS = new Set(Object.values(OPENERS));
const ENDS = new Set([".", "!", "?", "…"]);
const TRAILING = new Set([...CLOSERS, '"', "'"]);
const NEXT_STARTS = /[A-Z0-9“‘("'[*_`]/;

/**
 * One paragraph into sentences. A sentence ends at . ! ? or … (with any closing
 * quote or bracket after it) followed by a space and a capital, digit, quote or
 * bracket, and never inside brackets or quotes, so "(I made Priya up. The
 * afternoon...)" stays whole. Joining the sentences with spaces gives back the
 * paragraph with its whitespace collapsed.
 */
export function sentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out: string[] = [];
  const open: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    let closedAfterEnd = false;
    if (OPENERS[ch]) open.push(OPENERS[ch]);
    else if (open.length && ch === open[open.length - 1]) {
      open.pop();
      // "(... recognise.)" ends a sentence once its bracket closes.
      closedAfterEnd = ENDS.has(text[i - 1]);
    }
    if ((!ENDS.has(ch) && !closedAfterEnd) || open.length) continue;
    let end = i + 1;
    while (end < text.length && TRAILING.has(text[end]) && !(open.length && text[end] === open[open.length - 1])) end += 1;
    if (text[end] === " " && NEXT_STARTS.test(text[end + 1] ?? "")) {
      out.push(text.slice(start, end));
      start = end + 1;
      i = end;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** A figure marker on a line of its own (Ceetrix story 7); invisible when the Markdown is read as the book. */
const FIGURE_LINE = /^<!-- figure: [a-z0-9-]{1,64} -->$/;

/**
 * The story as one unit per bubble: each sentence of each paragraph, each list
 * item, and each heading joined to the sentence that follows it. A figure
 * marker is a unit of its own, drawn as the figure.
 */
export function storySentences(markdown: string): string[] {
  const units: string[] = [];
  let headings: string[] = [];
  const push = (unit: string) => {
    units.push(headings.length ? [...headings, unit].join("\n\n") : unit);
    headings = [];
  };
  for (const block of storyBlocks(markdown)) {
    if (HEADING.test(block)) headings.push(block);
    else if (FIGURE_LINE.test(block)) units.push(block.trim());
    else if (LIST_ITEM.test(block)) block.split("\n").forEach(push);
    else sentences(block).forEach(push);
  }
  if (headings.length) units.push(headings.join("\n\n"));
  return units;
}
