import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FIXTURE_CURRICULUM } from "@/test/fixture-curriculum";
import { NextStepCard, NOT_FOUND_NOTE, STEP_URL, cardFor } from "../next-step";

/** show_next_step draws the card a step calls for (Ceetrix story 19, TC-05). Steps come from the
 * tests' frozen curriculum, so they are real step shapes. */
const LESSON = JSON.parse(readFileSync(resolve(FIXTURE_CURRICULUM, "lessons/machine.json"), "utf8"));
type LessonStep = { id: string; check?: { kind?: string; compare?: string; choices?: unknown } };
const byKind = (test: (s: LessonStep) => boolean): LessonStep & { text: string } => LESSON.steps.find(test);
const TYPED = byKind((s) => s.check?.kind === "real" && s.check?.compare === "typed");
const CHOICES = byKind((s) => Boolean(s.check?.choices));
const ASK = byKind((s) => s.check?.kind === "ask" && !s.check?.choices);

function serve(step: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok: status === 200, status, json: async () => ({ station: "machine", step }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("show_next_step", () => {
  it.each([
    ["a typed real check", TYPED, "coach-number"],
    ["a step with choices", CHOICES, "coach-choice"],
    ["an ask step", ASK, "coach-step"],
  ])("draws %s as its own card", async (_label, step, testId) => {
    const fetchMock = serve(step);
    render(<NextStepCard station="machine" step={step.id} status="executing" respond={vi.fn()} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(STEP_URL("machine", step.id), expect.anything());
  });

  it("picks the card from the step's own check", () => {
    expect([cardFor(TYPED), cardFor(CHOICES), cardFor(ASK)]).toEqual(["number", "choice", "step"]);
  });

  it("an unknown step goes back to the model, once, as the answer", async () => {
    serve({}, 404);
    const respond = vi.fn();
    render(<NextStepCard station="machine" step="machine.99" status="executing" respond={respond} />);
    expect(await screen.findByText(NOT_FOUND_NOTE)).toBeInTheDocument();
    await waitFor(() => expect(respond).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ error: "step not found", station: "machine", step: "machine.99" })));
  });

  it("doesn't fetch while the ids are still streaming in", () => {
    const fetchMock = serve(TYPED);
    render(<NextStepCard station="mach" step="machine." status="inProgress" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
