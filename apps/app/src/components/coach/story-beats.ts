/**
 * Splits a story's Markdown into beats: short runs of whole blocks the reader
 * advances through one at a time (Ceetrix story 3).
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
