import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BEAT_WORDS, storyBeats, storyBlocks } from "../story-beats";

const STORY = readFileSync(resolve(__dirname, "../../../../../../curriculum/stories/legal-letter.md"), "utf8");
const HEADING = /^#{1,6}\s/;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const proseWords = (beat: string) => beat.split("\n\n").filter((b) => !HEADING.test(b)).reduce((n, b) => n + words(b), 0);
const para = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ");

describe("storyBeats on the real chapter 0", () => {
  const beats = storyBeats(STORY);

  it("TC-01 gives 25 short beats that add back up to the whole story", () => {
    expect(beats).toHaveLength(25);
    for (const beat of beats) {
      const single = beat.split("\n\n").filter((b) => !HEADING.test(b)).length === 1;
      expect(proseWords(beat) <= BEAT_WORDS || single).toBe(true);
    }
    expect(beats.join("\n\n")).toBe(storyBlocks(STORY).join("\n\n"));
  });

  it("TC-02 every heading opens its beat, or follows only headings", () => {
    for (const beat of beats) {
      const blocks = beat.split("\n\n");
      const firstText = blocks.findIndex((b) => !HEADING.test(b));
      const headingsAfterText = blocks.slice(firstText === -1 ? blocks.length : firstText).filter((b) => HEADING.test(b));
      expect(headingsAfterText).toEqual([]);
    }
    expect(beats[0].startsWith("## Chapter 0: The whole game")).toBe(true);
  });
});

describe("storyBeats boundaries", () => {
  it("TC-03 empty input has no beats", () => {
    expect(storyBeats("")).toEqual([]);
    expect(storyBeats("\n\n  \n")).toEqual([]);
  });

  it("TC-04 one paragraph is one beat", () => {
    expect(storyBeats("Just this.")).toEqual(["Just this."]);
  });

  it("TC-05 a block over the limit is one beat and is never cut", () => {
    const long = para(200);
    expect(storyBeats(`Short one.\n\n${long}\n\nAfter.`)).toEqual(["Short one.", long, "After."]);
  });

  it("TC-06 a heading stays with the text that follows it", () => {
    expect(storyBeats(`Before.\n\n## Part two\n\nThe text.`)).toEqual(["Before.", "## Part two\n\nThe text."]);
  });

  it("TC-07 consecutive headings start one beat together", () => {
    expect(storyBeats(`## One\n\n### Two\n\nText.`)).toEqual(["## One\n\n### Two\n\nText."]);
  });

  it("TC-08 a list next to a paragraph is its own block", () => {
    expect(storyBlocks(`Intro line.\n- first\n- second\nAfter line.`)).toEqual(["Intro line.", "- first\n- second", "After line."]);
  });

  it("TC-09 a paragraph that would pass the limit starts a new beat", () => {
    const half = para(BEAT_WORDS / 2);
    expect(storyBeats(`${half}\n\n${half}\n\none`)).toEqual([`${half}\n\n${half}`, "one"]);
    expect(storyBeats(`${half}\n\n${half}`)).toHaveLength(1);
  });
});
