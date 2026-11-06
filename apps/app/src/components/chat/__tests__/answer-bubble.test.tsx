import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Julian, 2026-11-06: "there's text that's not in a bubble. Why not?" The coach's written replies
 * sit in a bubble like the story's sentences; an empty reply (a message that is only cards) has no
 * bubble. And every coach element shares one width.
 */

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAssistantMessage: { MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div> },
}));

const { AnswerMarkdown } = await import("../answer-markdown");

afterEach(() => cleanup());

describe("the coach's written reply", () => {
  it("sits in a bubble", () => {
    const { container } = render(<AnswerMarkdown content="A made-up reply." />);
    expect(container.querySelector(".answer-markdown")).toHaveClass("coach-reply");
  });

  it.each(["", "   "])("an empty reply (%j) draws no bubble", (content) => {
    const { container } = render(<AnswerMarkdown content={content} />);
    expect(container.querySelector(".answer-markdown")).not.toHaveClass("coach-reply");
  });
});

describe("one width for every coach element", () => {
  const css = readFileSync(resolve(__dirname, "../../coach/coach.css"), "utf8");
  it("no coach element sets a width of its own", () => {
    const widths = Array.from(css.matchAll(/max-width:\s*([^;]+);/g)).map((m) => m[1].trim());
    const own = widths.filter((w) => w !== "var(--coach-card-max)" && w !== "none" && !w.startsWith("calc(") && w !== "48rem" && w !== "100%");
    expect(own).toEqual([]);
  });
});
