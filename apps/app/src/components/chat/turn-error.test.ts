import { describe, expect, it } from "vitest";
import { CUT_OFF, TURN_FAILED_CODE, turnErrorLine } from "./turn-error";

// Story 37: the coach's own line for a turn a provider refused; anything else gets the cut-off line.
const made_up = "Made-up line in the coach's voice. Check it in API keys.";

describe("turnErrorLine", () => {
  it("shows the coach's own line when the run error carries the coach's code", () => {
    expect(turnErrorLine({ error: new Error(made_up), context: { runtimeErrorCode: TURN_FAILED_CODE } })).toBe(made_up);
  });

  it.each([
    ["another code", { runtimeErrorCode: "INCOMPLETE_STREAM" }],
    ["no code", {}],
    ["no context", undefined],
  ])("shows the cut-off line for %s, never the error's own text", (_name, context) => {
    expect(turnErrorLine({ error: new Error("Incorrect API key provided: sk-made-up"), context })).toBe(CUT_OFF);
  });

  it.each([["nothing", undefined], ["a DOM event", { type: "error" }], ["an error with no message", { error: {}, context: { runtimeErrorCode: TURN_FAILED_CODE } }]])(
    "shows the cut-off line for %s",
    (_name, event) => expect(turnErrorLine(event)).toBe(CUT_OFF),
  );

  it("shows the cut-off line when the coach's code comes with no words", () => {
    expect(turnErrorLine({ error: new Error("  "), context: { runtimeErrorCode: TURN_FAILED_CODE } })).toBe(CUT_OFF);
  });
});
