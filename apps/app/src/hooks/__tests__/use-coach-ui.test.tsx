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

import { useCoachUI, CheckResultParams } from "../use-coach-ui";

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
    expect(captured.useHumanInTheLoop.map((c) => c.name)).toEqual(["story", "step_card", "number_card", "consent_card", "run_confirm", "recap_card"]);
    expect(captured.useComponent.map((c) => c.name)).toEqual(["check_result", "show_map"]);
    expect(captured.useRenderTool.map((c) => c.name)).toEqual(["run_do_it"]);
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
