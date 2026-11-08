import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { Providers } from "../providers";
import HomePage from "../app";

/**
 * The coach opens the whole map itself (Ceetrix story 38, TC-04). The real CopilotKit providers
 * and page; only the runtime's HTTP boundary is faked, and the fake model's first answer is a
 * show_big_map call. What the learner sees must be what the Map button opens. Text is made up.
 */

const MAP_DIALOG = "Map";
const AFTER = "A made-up sentence after the map opened.";

type Runtime = { runs: number; toolResults: unknown[] };

/** A runtime whose first run calls show_big_map; the run CopilotKit sends back with the result gets a sentence. */
function fakeRuntime({ thenCard = false, callAgain = false } = {}): Runtime {
  const state: Runtime = { runs: 0, toolResults: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/coach-keys") return Response.json({ saved: true, where: "keychain" });
    if (path === "/api/coach-provider") return Response.json({ server: null });
    if (path.startsWith("/api/curriculum/map") || path.startsWith("/api/coach-goal")) return Response.json({}, { status: 404 });
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (body.method === "info" || path.endsWith("/info")) return Response.json({ version: "1.55.2-next.1", agents: { default: { description: "Test agent" } } });
    const input = body.body ?? body;
    const running = body.method === "agent/run" || path.endsWith("/run");
    const head = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }];
    const finish = { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId };
    let events: object[];
    if (!running) {
      events = [...head, { type: "MESSAGES_SNAPSHOT", messages: [] }, finish];
    } else {
      state.runs += 1;
      const tools = (input.messages ?? []).filter((m: { role?: string }) => m.role === "tool");
      state.toolResults.push(...tools.map((m: { content?: unknown }) => m.content));
      events = state.runs === 1
        ? [...head,
          { type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "show_big_map", parentMessageId: "answer-1" },
          { type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: "{}" },
          { type: "TOOL_CALL_END", toolCallId: "call-1" },
          finish]
        : callAgain && state.runs === 2
        ? [...head,
          { type: "TOOL_CALL_START", toolCallId: "call-again", toolCallName: "show_big_map", parentMessageId: "answer-2" },
          { type: "TOOL_CALL_ARGS", toolCallId: "call-again", delta: "{}" },
          { type: "TOOL_CALL_END", toolCallId: "call-again" },
          finish]
        : thenCard && state.runs === 2
        ? [...head,
          { type: "TOOL_CALL_START", toolCallId: "call-2", toolCallName: "show_next_step", parentMessageId: "answer-2" },
          { type: "TOOL_CALL_ARGS", toolCallId: "call-2", delta: JSON.stringify({ station: "made-up", step: "made-up.1" }) },
          { type: "TOOL_CALL_END", toolCallId: "call-2" },
          finish]
        : [...head,
          { type: "TEXT_MESSAGE_START", messageId: `answer-${state.runs}`, role: "assistant" },
          { type: "TEXT_MESSAGE_CONTENT", messageId: `answer-${state.runs}`, delta: AFTER },
          { type: "TEXT_MESSAGE_END", messageId: `answer-${state.runs}` },
          finish];
    }
    return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  }));
  return state;
}

function Core() {
  const { copilotkit } = useCopilotKit();
  useEffect(() => {}, [copilotkit]);
  return <output data-testid="runtime-status">{copilotkit.runtimeConnectionStatus}</output>;
}

async function openPage() {
  render(<Providers><Core /><HomePage /></Providers>);
  await waitFor(() => expect(screen.getByTestId("runtime-status")).toHaveTextContent("connected"));
  await waitFor(() => expect(screen.getByRole("button", { name: /^API keys/ })).toHaveTextContent("•"));
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("show_big_map (story 38, TC-04)", () => {
  it("the coach's show_big_map call opens the dialog the Map button opens, and adds nothing to the conversation", async () => {
    const runtime = fakeRuntime();
    await openPage();
    expect(screen.queryByRole("dialog", { name: MAP_DIALOG })).toBeNull();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A made-up request for the whole map" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });

    const opened = await screen.findByRole("dialog", { name: MAP_DIALOG });
    await screen.findByText(AFTER);
    // The model was told the map is open.
    await waitFor(() => expect(runtime.toolResults.join(" ")).toMatch(/map is open/i));
    // Nothing in the conversation names the tool.
    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(within(conversation).queryByText(/show_big_map|big map/i)).toBeNull();

    // The same dialog as the button's: close it, press Map, and the same element kind comes back.
    const fromTool = opened.outerHTML.replace(/\s+/g, " ").slice(0, 120);
    fireEvent.click(within(opened).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: MAP_DIALOG })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    const fromButton = (await screen.findByRole("dialog", { name: MAP_DIALOG })).outerHTML.replace(/\s+/g, " ").slice(0, 120);
    expect(fromButton).toBe(fromTool);
  });

  it("once closed, the map stays closed while the coach goes on to show a card (seen once in a real run)", async () => {
    const runtime = fakeRuntime({ thenCard: true });
    await openPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A made-up request for the whole map" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    const opened = await screen.findByRole("dialog", { name: MAP_DIALOG });
    fireEvent.click(within(opened).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(runtime.runs).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByRole("dialog", { name: MAP_DIALOG })).toBeNull();
  });

  it("closed after the coach's next card has arrived, the map stays closed", async () => {
    const runtime = fakeRuntime({ thenCard: true });
    await openPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A made-up request for the whole map" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    await screen.findByRole("dialog", { name: MAP_DIALOG });
    await waitFor(() => expect(runtime.runs).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 1000));
    fireEvent.click(within(screen.getByRole("dialog", { name: MAP_DIALOG })).getByRole("button", { name: "Close" }));
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByRole("dialog", { name: MAP_DIALOG })).toBeNull();
  });

  it("the coach opens the map once per learner message: a second call in the same turn doesn't reopen it after the learner closed it (seen in a real run)", async () => {
    const runtime = fakeRuntime({ callAgain: true });
    await openPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A made-up request for the whole map" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    const opened = await screen.findByRole("dialog", { name: MAP_DIALOG });
    fireEvent.click(within(opened).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(runtime.runs).toBeGreaterThanOrEqual(3));
    await new Promise((r) => setTimeout(r, 1000));
    expect(screen.queryByRole("dialog", { name: MAP_DIALOG })).toBeNull();
    // The model is told it's already been shown, not that it's open.
    expect(runtime.toolResults.at(-1)).toMatch(/already/i);
    // The Map button still opens it whenever pressed.
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(await screen.findByRole("dialog", { name: MAP_DIALOG })).toBeVisible();
  });
});
