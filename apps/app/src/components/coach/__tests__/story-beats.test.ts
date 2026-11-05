import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BEAT_WORDS, sentences, storyBeats, storyBlocks, storySentences } from "../story-beats";
import { FIXTURE_CURRICULUM } from "@/test/fixture-curriculum";

const STORY = readFileSync(resolve(FIXTURE_CURRICULUM, "stories/legal-letter.md"), "utf8");
const HEADING = /^#{1,6}\s/;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const proseWords = (beat: string) => beat.split("\n\n").filter((b) => !HEADING.test(b)).reduce((n, b) => n + words(b), 0);
const para = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ");

describe("storyBeats on the real chapter 0", () => {
  const beats = storyBeats(STORY);

  it("TC-01 gives 26 short beats that add back up to the whole story", () => {
    // 25 before story 7; the three figure markers are short blocks and one starts a beat of its own.
    expect(beats).toHaveLength(26);
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

describe("storySentences: one bubble per sentence", () => {
  const units = storySentences(STORY);

  it("TC-30 chapter 0 gives 102 bubbles and 3 figures, the first with the chapter title and one sentence", () => {
    expect(units).toHaveLength(105);
    expect(units.filter((u) => u.startsWith("<!-- figure:"))).toHaveLength(3);
    expect(units[0]).toBe(
      "## Chapter 0: The whole game\n\n### What this chapter covers\n\nI'm going to tell you a story about a solicitor called Priya, a laptop, and a letter that never left the room.",
    );
    expect(units[1]).toBe("Then I'm going to ask you why the ending matters.");
  });

  it("TC-31 nothing is lost: the sentences add back up to every paragraph", () => {
    const flat = (text: string) => text.replace(/\s+/g, " ").trim();
    const fromUnits = flat(units.join(" "));
    const fromBlocks = flat(storyBlocks(STORY).join(" "));
    expect(fromUnits).toBe(fromBlocks);
  });

  it("TC-32 no bubble splits a bracket or a quotation", () => {
    for (const unit of units) {
      expect((unit.match(/\(/g) ?? []).length).toBe((unit.match(/\)/g) ?? []).length);
      expect((unit.match(/“/g) ?? []).length).toBe((unit.match(/”/g) ?? []).length);
    }
    expect(units).toContain("(I made Priya up. The afternoon, I suspect, you'll recognise.)");
  });

  it.each([
    ["Two. Sentences here.", ["Two.", "Sentences here."]],
    ["Is it? Yes! Fine… really.", ["Is it?", "Yes!", "Fine… really."]],
    ["(Inside. Still inside.) Outside.", ["(Inside. Still inside.)", "Outside."]],
    ["She said “Stop. Now.” Then left.", ["She said “Stop. Now.”", "Then left."]],
    ["Version 1.5 works. Next.", ["Version 1.5 works.", "Next."]],
    ["no capital. after it", ["no capital. after it"]],
    ["", []],
  ])("TC-33 sentences(%j)", (input, expected) => {
    expect(sentences(input)).toEqual(expected);
  });

  it("TC-34 each list item is its own bubble and a trailing heading is kept", () => {
    expect(storySentences("Intro.\n\n- one\n- two\n\n## End")).toEqual(["Intro.", "- one", "- two", "## End"]);
  });
});

describe("figures in the story (Ceetrix story 7)", () => {
  const units = storySentences(STORY);
  const figures = JSON.parse(readFileSync(resolve(FIXTURE_CURRICULUM, "figures.json"), "utf8")).figures as {
    id: string;
    coach: { story?: string };
    book: { after: string };
  }[];

  it("TC-22 each story figure is its own unit, right after the sentence it follows", () => {
    for (const figure of figures.filter((f) => f.coach.story === "legal-letter")) {
      const at = units.indexOf(`<!-- figure: ${figure.id} -->`);
      expect(at).toBeGreaterThan(0);
      expect(units[at - 1].endsWith(figure.book.after)).toBe(true);
      expect(units[at + 1].startsWith("<!--")).toBe(false);
    }
  });

  it("TC-22b a marker is never merged with the sentences around it", () => {
    expect(storySentences("One.\n\n<!-- figure: will-it-fit -->\n\nTwo.")).toEqual(["One.", "<!-- figure: will-it-fit -->", "Two."]);
  });
});
