import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StepCard } from "../step-card";
import { NumberCard } from "../number-card";
import { ChoiceCard } from "../choice-card";
import { NextStepCard } from "../next-step";

/** Facts look like facts, tasks like tasks (Ceetrix story 25, TC-05 to TC-10). Made-up wording. */
const FACT = "A sample fact to know first.";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const waiting = { status: "executing" as const, respond: vi.fn() };
const answered = { status: "complete" as const };

describe("fact bubbles", () => {
  it("TC-05 a fact is a yellow bubble with a light bulb, before the task", () => {
    render(<StepCard stepId="s.1" text="Do the sample task." where="coach" fact={FACT} {...waiting} />);
    const bubble = screen.getByTestId("coach-fact");
    expect(bubble).toHaveClass("coach-fact");
    expect(bubble).toHaveTextContent(`💡 ${FACT}`);
    expect(bubble.compareDocumentPosition(screen.getByTestId("coach-step")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("TC-06 no fact, no bubble", () => {
    render(<StepCard stepId="s.1" text="Do the sample task." where="coach" fact="" {...waiting} />);
    expect(screen.queryByTestId("coach-fact")).toBeNull();
  });
});

describe("task cards", () => {
  const cards = (state: typeof waiting | typeof answered, result?: string) => [
    ["step", <StepCard key="s" stepId="s.1" text="Do the sample task." where="coach" fact={FACT} result={result && JSON.stringify({ action: "claim" })} {...state} />, "coach-step"],
    ["number", <NumberCard key="n" prompt="Type a sample figure." unit="GB" platform="mac" fact={FACT} result={result && JSON.stringify({ value: 8 })} {...state} />, "coach-number"],
    ["choice", <ChoiceCard key="c" stepId="s.2" text="Pick sample answers." items={["One"]} options={["Yes", "No"]} fact={FACT} result={result && JSON.stringify({ answers: ["Yes"] })} {...state} />, "coach-choice"],
  ] as const;

  it.each(cards(waiting).map(([name, el, id]) => [name, el, id]))("TC-07 a waiting %s card is a task, waiting", (_name, el, id) => {
    render(el);
    const card = screen.getByTestId(id as string);
    expect(card).toHaveClass("coach-card--task");
    expect(card).toHaveAttribute("data-state", "active");
  });

  it.each(cards(answered, "yes").map(([name, el, id]) => [name, el, id]))("TC-08 an answered %s card is a task, answered", (_name, el, id) => {
    render(el);
    const card = screen.getByTestId(id as string);
    expect(card).toHaveClass("coach-card--task");
    expect(card).toHaveAttribute("data-state", "answered");
    expect(screen.getByTestId("coach-fact")).toBeInTheDocument(); // the fact stays with its answered task
  });

  it.each([["settings"], ["coach"], ["read"]])("TC-09 where %s shows no label on the card", (where) => {
    render(<StepCard stepId="s.1" text="Do the sample task." where={where} {...waiting} />);
    for (const words of ["In your settings", "Here, with me", "Read this"]) {
      const label = screen.queryByText(words);
      if (label) expect(label).toHaveClass("coach-sr-only");
    }
    expect(screen.getByTestId("coach-step").querySelector(".coach-card__label:not(.coach-sr-only)")).toBeNull();
  });

  it("TC-09 a terminal step keeps its label", () => {
    render(<StepCard stepId="s.1" text="Do the sample task." where="real-terminal" {...waiting} />);
    expect(screen.getByText("In your terminal")).not.toHaveClass("coach-sr-only");
  });
});

describe("show_next_step", () => {
  it("TC-10 passes the step's fact to the card", async () => {
    const step = { id: "s.3", text: "Do the sample task.", where: "coach", fact: FACT, check: { kind: "ask" } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ station: "s", step }) })));
    render(<NextStepCard station="s" step="s.3" {...waiting} />);
    expect(await screen.findByTestId("coach-fact")).toHaveTextContent(FACT);
  });
});
