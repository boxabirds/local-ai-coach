import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import { useCopilotKit } from "@copilotkit/react-core/v2";
import { Providers } from "../providers";
import HomePage from "../app";
import { CHAT_KEY } from "@/lib/chat-store";

/**
 * The coach's shell (Ceetrix story 22): API keys and New chat during a run (TC-01 to TC-03),
 * and what typing and streaming redraw (TC-09, TC-10). The real CopilotKit providers and page;
 * only the runtime's HTTP boundary is faked. Message text is made up, not curriculum.
 */

const renders = vi.hoisted(() => ({ answer: 0, question: 0, header: 0 }));
// The stub badge sits in the page header, so its renders are the header's.
vi.mock("@/components/chat/key-gated-chat-view", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/chat/key-gated-chat-view")>();
  return { ...real, StubBadge: () => { renders.header += 1; return real.StubBadge(); } };
});
vi.mock("@/components/chat/answer-markdown", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/chat/answer-markdown")>();
  return { ...real, AnswerMarkdown: (props: Parameters<typeof real.AnswerMarkdown>[0]) => { renders.answer += 1; return real.AnswerMarkdown(props); } };
});
vi.mock("@/components/chat/quoted-user-text", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/chat/quoted-user-text")>();
  return { ...real, QuotedUserText: (props: Parameters<typeof real.QuotedUserText>[0]) => { renders.question += 1; return real.QuotedUserText(props); } };
});

const KEYS_DIALOG = "API keys";
const TOKENS = ["Sample ", "answer ", "one ", "two ", "three"];

type Runtime = { stopped: () => boolean; runs: number; release: () => void };

/**
 * A runtime whose run streams a few tokens, then waits until released or stopped. Stopping
 * is CopilotKit's stop request to the runtime, which ends the run as the real runtime does.
 */
function fakeRuntime({ hang = true } = {}): Runtime {
  let signal: AbortSignal | undefined;
  let release = () => {};
  const state = { runs: 0, stops: 0 };
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/coach-keys") return Response.json({ saved: true, where: "keychain" });
    if (path === "/api/coach-provider") return Response.json({ server: null });
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (body.method === "agent/stop" || path.includes("/stop/")) {
      state.stops += 1;
      release();
      return Response.json({});
    }
    if (body.method === "info" || path.endsWith("/info")) return Response.json({ version: "1.55.2-next.1", agents: { default: { description: "Test agent" } } });
    const input = body.body ?? body;
    const running = body.method === "agent/run" || path.endsWith("/run");
    const head = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }];
    if (!running) {
      const done = [...head, { type: "MESSAGES_SNAPSHOT", messages: [] }, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }];
      return new Response(done.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
    }
    state.runs += 1;
    signal = init?.signal ?? undefined;
    const id = `answer-${state.runs}`;
    const events = [...head, { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" },
      ...TOKENS.map((delta) => ({ type: "TEXT_MESSAGE_CONTENT", messageId: id, delta }))];
    const tail = [{ type: "TEXT_MESSAGE_END", messageId: id }, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }];
    const encode = (list: object[]) => new TextEncoder().encode(list.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
    const stream = new ReadableStream({
      async start(controller) {
        for (const event of events) {
          controller.enqueue(encode([event]));
          await new Promise((r) => setTimeout(r, 5));
        }
        const finish = () => { try { controller.enqueue(encode(tail)); controller.close(); } catch { /* already closed */ } };
        release = finish;
        signal?.addEventListener("abort", () => { try { controller.error(new DOMException("aborted", "AbortError")); } catch { /* closed */ } });
        if (!hang) finish();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }));
  return { stopped: () => state.stops > 0 || signal?.aborted === true, get runs() { return state.runs; }, release: () => release() };
}

const seen: { core: ReturnType<typeof useCopilotKit>["copilotkit"] | null } = { core: null };
function Core() {
  const { copilotkit } = useCopilotKit();
  useEffect(() => { seen.core = copilotkit; }, [copilotkit]);
  return <output data-testid="runtime-status">{copilotkit.runtimeConnectionStatus}</output>;
}

async function openPage() {
  render(<Providers><Core /><HomePage /></Providers>);
  await waitFor(() => expect(screen.getByTestId("runtime-status")).toHaveTextContent("connected"));
  await waitFor(() => expect(screen.getByRole("button", { name: /^API keys/ })).toHaveTextContent("•"));
}
async function ask(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
  await screen.findByText(/Sample answer one/);
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.localStorage.clear();
  renders.answer = 0;
  renders.question = 0;
  renders.header = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  seen.core = null;
});

describe("API keys and New chat during a run (TC-01 to TC-03)", () => {
  it("TC-01: API keys during a run stops the run, then the dialog opens", async () => {
    const runtime = fakeRuntime();
    await openPage();
    await ask("A sample question");
    const keys = screen.getByRole("button", { name: /^API keys/ });
    expect(keys).toBeEnabled();
    fireEvent.click(keys);
    expect(await screen.findByRole("dialog", { name: KEYS_DIALOG })).toBeVisible();
    await waitFor(() => expect(runtime.stopped()).toBe(true));
    // The dialog isn't frozen by the run it replaced.
    expect(screen.getByLabelText("OpenAI API key")).toBeEnabled();
  });

  it("TC-02: New chat during a run stops the run and clears the chat", async () => {
    const runtime = fakeRuntime();
    await openPage();
    await ask("A sample question");
    const fresh = screen.getByRole("button", { name: "New chat" });
    expect(fresh).toBeEnabled();
    fireEvent.click(fresh);
    await waitFor(() => expect(runtime.stopped()).toBe(true));
    await waitFor(() => expect(screen.queryByText(/Sample answer one/)).toBeNull());
  });

  it("TC-03: idle, API keys opens without stopping anything; a failing stop still opens it", async () => {
    fakeRuntime({ hang: false });
    await openPage();
    const stop = vi.spyOn(seen.core!, "stopAgent");
    fireEvent.click(screen.getByRole("button", { name: /^API keys/ }));
    expect(await screen.findByRole("dialog", { name: KEYS_DIALOG })).toBeVisible();
    expect(stop).not.toHaveBeenCalled();
  });

  it("TC-03: a stop that throws still opens the dialog", async () => {
    fakeRuntime();
    await openPage();
    await ask("A sample question");
    vi.spyOn(seen.core!, "stopAgent").mockImplementation(() => { throw new Error("stop failed"); });
    fireEvent.click(screen.getByRole("button", { name: /^API keys/ }));
    expect(await screen.findByRole("dialog", { name: KEYS_DIALOG })).toBeVisible();
  });
});

describe("what typing and streaming redraw (TC-09, TC-10)", () => {
  it("TC-09: typing does not redraw the coach's answers", async () => {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify({ version: 1, state: {}, messages: [
      { id: "q-1", role: "user", content: "A kept sample question" },
      { id: "a-1", role: "assistant", content: "A kept sample answer" },
    ] }));
    fakeRuntime({ hang: false });
    await openPage();
    await screen.findByText("A kept sample answer");
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const before = renders.answer;
    for (const text of ["a", "ab", "abc", "abcd", "abcde"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(renders.answer).toBe(before);
  });

  it("TC-10: streaming an answer does not redraw the question above it per token", async () => {
    const runtime = fakeRuntime();
    await openPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A sample question" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    await screen.findByText(/Sample answer one two three/);
    await act(async () => { runtime.release(); await new Promise((r) => setTimeout(r, 50)); });
    // Drawn when sent and when the run settles, not once per streamed token.
    expect(renders.question).toBeLessThan(TOKENS.length);
  });

  it("TC-10: streaming an answer does not redraw the page header per token", async () => {
    const runtime = fakeRuntime();
    await openPage();
    const before = renders.header;
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A sample question" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    await screen.findByText(/Sample answer one two three/);
    await act(async () => { runtime.release(); await new Promise((r) => setTimeout(r, 50)); });
    // Run started and run finished, not once per streamed token.
    expect(renders.header - before).toBeLessThan(TOKENS.length);
  });
});

describe("Restart coach (story 23)", () => {
  it("the header offers Restart coach, which asks first, even during a run", async () => {
    const runtime = fakeRuntime();
    await openPage();
    await ask("A sample question");
    const restart = screen.getByRole("button", { name: "Restart coach" });
    expect(restart).toBeEnabled();
    fireEvent.click(restart);
    expect(await screen.findByRole("dialog", { name: "Start the coach again?" })).toBeVisible();
    await waitFor(() => expect(runtime.stopped()).toBe(true));
  });

  it("confirming clears the kept conversation and starts the chat again", async () => {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify({ version: 1, state: {}, messages: [
      { id: "q-1", role: "user", content: "A kept sample question" },
      { id: "a-1", role: "assistant", content: "A kept sample answer" },
    ] }));
    fakeRuntime({ hang: false });
    const restarts: string[] = [];
    const base = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/coach-restart") { restarts.push(init?.method ?? "GET"); return Response.json({ archived: "old/x", moved: ["progress.json"] }); }
      return base(url, init);
    }));
    await openPage();
    await screen.findByText("A kept sample answer");
    fireEvent.click(screen.getByRole("button", { name: "Restart coach" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restart" }));
    await waitFor(() => expect(screen.queryByText("A kept sample answer")).toBeNull());
    expect(restarts).toEqual(["POST"]);
    expect(window.localStorage.getItem(CHAT_KEY)).toBeNull();
  });
});
