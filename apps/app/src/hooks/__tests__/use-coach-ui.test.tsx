import type React from "react";
import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const useAgentMock = vi.hoisted(() => vi.fn(() => ({ agent: { state: {} } })));

const captured = vi.hoisted(() => ({
  useComponent: [] as Array<{ name: string }>,
  useFrontendTool: [] as Array<{ name: string }>,
  useHumanInTheLoop: [] as Array<{ name: string }>,
  useRenderTool: [] as Array<{ name: string }>,
  useDefaultRenderTool: 0,
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useComponent: (config: { name: string }) => void captured.useComponent.push(config),
  useFrontendTool: (config: { name: string }) => void captured.useFrontendTool.push(config),
  useHumanInTheLoop: (config: { name: string }) => void captured.useHumanInTheLoop.push(config),
  useRenderTool: (config: { name: string }) => void captured.useRenderTool.push(config),
  useDefaultRenderTool: () => {
    captured.useDefaultRenderTool += 1;
  },
  useAgent: useAgentMock,
  UseAgentUpdate: { OnMessagesChanged: "OnMessagesChanged", OnStateChanged: "OnStateChanged", OnRunStatusChanged: "OnRunStatusChanged" },
}));

import { useCoachUI, CheckResultParams, RunCheckResult } from "../use-coach-ui";
import { screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";


function Probe() {
  useCoachUI();
  return null;
}

describe("useCoachUI (TC-57)", () => {
  beforeEach(() => {
    captured.useComponent.length = 0;
    captured.useFrontendTool.length = 0;
    captured.useHumanInTheLoop.length = 0;
    captured.useRenderTool.length = 0;
    captured.useDefaultRenderTool = 0;
  });
  afterEach(() => cleanup());

  it("registers every coach card by its hook kind", () => {
    render(<Probe />);
    expect(captured.useHumanInTheLoop.map((c) => c.name)).toEqual(["story", "show_next_step", "step_card", "number_card", "choice_card", "consent_card", "run_confirm", "recap_card"]);
    expect(captured.useComponent.map((c) => c.name)).toEqual(["check_result", "show_map"]);
    expect(captured.useRenderTool.map((c) => c.name)).toEqual(["run_check", "chapter_ended", "run_do_it"]);
    expect(captured.useFrontendTool.map((c) => c.name)).toEqual(["sandbox_event"]);
    expect(captured.useDefaultRenderTool).toBe(1);
  });

  it("registers none of the deleted demo tools", () => {
    render(<Probe />);
    const names = [...captured.useHumanInTheLoop, ...captured.useComponent, ...captured.useRenderTool, ...captured.useFrontendTool].map((c) => c.name);
    for (const demo of ["pieChart", "barChart", "scheduleTime", "toggleTheme", "plan_visualization"]) expect(names).not.toContain(demo);
  });

  it("the map listens to agent state changes only, not every message", () => {
    render(<Probe />);
    const map = captured.useComponent.find((c) => c.name === "show_map") as unknown as { render: (p: { focus?: string }) => React.ReactElement };
    render(map.render({ focus: "machine" }));
    expect(useAgentMock).toHaveBeenCalledWith({ updates: ["OnStateChanged"] });
  });

  it("accepts the stub's sample check result and rejects a malformed one", () => {
    const sample = {
      station_id: "machine",
      step_id: "machine.2",
      passed: true,
      evidence: [{ probe: "memory", cmd: "sysctl -n hw.memsize", matched: ["17179869184"] }],
      note: "Sample result. The real probe arrives in step 3.",
    };
    expect(CheckResultParams.safeParse(sample).success).toBe(true);
    expect(CheckResultParams.safeParse({ ...sample, evidence: [{ probe: "memory" }] }).success).toBe(false);
  });
});

describe("run_check drawn as the check card (story 10, TC-28)", () => {
  afterEach(() => cleanup());
  const evidence = [{ probe: "memory", cmd: "sysctl -n hw.memsize", matched: ["17179869184"] }];

  it("a passing result is the Passed card with what was run", () => {
    const result = JSON.stringify({ station_id: "machine", step_id: "machine.2", passed: true, checked: true, note: "You typed 16 GB and the machine says 16 GB.", evidence, measured: 16 });
    render(<RunCheckResult result={result} />);
    const card = screen.getByTestId("coach-check");
    expect(within(card).getByText("Passed")).toBeInTheDocument();
    expect(within(card).getByText("You typed 16 GB and the machine says 16 GB.")).toBeInTheDocument();
    within(card).getByRole("button", { name: "Show me what you looked at" }).click();
  });

  it("a result that looked at nothing is Not checked", () => {
    render(<RunCheckResult result={JSON.stringify({ passed: false, checked: false, note: "You chose not to let me look.", evidence: [] })} />);
    expect(screen.getByText("Not checked")).toBeInTheDocument();
  });

  it.each([
    ["a request for permission", JSON.stringify({ needs: "consent", items: [] })],
    ["a rubric to judge", JSON.stringify({ judge: "fits if...", question: "?" })],
    ["plain text", "There's no number from the learner for machine.2 yet."],
    ["nothing yet", undefined],
  ])("%s draws nothing", (_label, result) => {
    const { container } = render(<RunCheckResult result={result} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("the registered render uses the tool's own result", () => {
    render(<Probe />);
    const entry = captured.useRenderTool.find((c) => c.name === "run_check") as unknown as { render: (p: { result?: string }) => React.ReactElement };
    const { container } = render(entry.render({ result: JSON.stringify({ passed: true, checked: true, evidence, note: "ok" }) }));
    expect(within(container).getByText("Passed")).toBeInTheDocument();
  });
});

describe("the coach's own tools in plain words (story 10)", () => {
  afterEach(() => cleanup());

  it("housekeeping is silent and saving is one sentence", async () => {
    const { coachNoteText, QUIET_TOOLS } = await import("@/components/coach/coach-note");
    expect(QUIET_TOOLS.has("run_check") && QUIET_TOOLS.has("user_navigated")).toBe(true);
    // Saving progress and ending a session are the coach's bookkeeping: no line in the chat
    // (Julian, 2026-11-06: "Saved: ..., step 3, done, on your word." remove this).
    expect(QUIET_TOOLS.has("set_progress") && QUIET_TOOLS.has("end_session")).toBe(true);
    expect(coachNoteText("set_progress", { station_id: "machine", step_id: "machine.2", status: "verified" })).toBeNull();
    expect(coachNoteText("end_session", {})).toBeNull();
    expect(coachNoteText("probe", { name: "listening" })).toBe("Looked at what is listening on a port.");
    expect(coachNoteText("generateSandboxedUi", {})).toBeNull();
  });

  it("the agent framework's own file and planning tools are silent (read_file showed as a raw row)", async () => {
    const { QUIET_TOOLS } = await import("@/components/coach/coach-note");
    for (const name of ["read_file", "ls", "glob", "grep", "write_file", "edit_file", "write_todos", "task", "execute"]) {
      expect(QUIET_TOOLS.has(name), name).toBe(true);
    }
    expect(QUIET_TOOLS.has("generateSandboxedUi")).toBe(false);
  });
});
