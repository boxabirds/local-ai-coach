import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { KEYS_URL, ProviderKeysProvider, useProviderKeys } from "./provider-keys";
import { ProviderKeysDialog } from "./provider-keys-dialog";

/** Keys shaped like real ones (story 16 fixtures); never real. */
const OPENAI = "sk-proj-" + "a1B2c3D4".repeat(6);
const JEV = "k9Z8y7X6".repeat(5);

function Harness({ disabled = false }: { disabled?: boolean }) {
  const { hasKeys, session, headers, newChat } = useProviderKeys();
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open keys</button>
    <button onClick={newChat}>New chat</button>
    <output data-testid="session">{session}</output>
    <output data-testid="active">{hasKeys ? (headers?.["x-openai-api-key"] ?? "saved") : "shared"}</output>
    {open && <ProviderKeysDialog disabled={disabled} onClose={() => setOpen(false)} />}
  </>;
}

/**
 * Answers /api/provider-keys (validation) and /api/coach-keys (saved keys) like the real routes.
 * `where` is "keychain" on a Mac, null elsewhere; `refuse` makes a save fail with the agent's message.
 */
function serve({ where = null as string | null, saved = false, refuse = null as string | null } = {}) {
  const state = { saved, where };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === KEYS_URL) {
      if (method === "POST") {
        if (refuse || !state.where) return { ok: false, status: 422, json: async () => ({ ...state, error: refuse ?? "This computer can't remember keys yet, so I'll keep them for this session only." }) };
        state.saved = true;
      }
      if (method === "DELETE") state.saved = false;
      return { ok: true, status: 200, json: async () => ({ ...state }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, state };
}

async function setup(disabled = false) {
  render(<ProviderKeysProvider><Harness disabled={disabled} /></ProviderKeysProvider>);
  await act(async () => {}); // the provider asks whether keys are saved
  screen.getByText("Open keys").focus();
  fireEvent.click(screen.getByText("Open keys"));
}
function enterKeys(openai = `  ${OPENAI}  `, jev = `  ${JEV}  `) {
  fireEvent.change(screen.getByLabelText("OpenAI API key"), { target: { value: openai } });
  fireEvent.change(screen.getByLabelText("Jev API key"), { target: { value: jev } });
}
async function testAndSave() {
  fireEvent.click(screen.getByText("Test connection"));
  await screen.findByText("Both keys work. Save to start a new chat.");
  fireEvent.click(screen.getByText("Save keys"));
}
const validationCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => url === "/api/provider-keys");

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("session-only keys, where this computer can't keep them", () => {
  it("validates trimmed headers before saving, resets the chat and never persists keys", async () => {
    const { fetchMock } = serve();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    await setup();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Add API keys to start");
    expect(screen.getByText(/can't keep keys yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("OpenAI API key")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Save keys" })).toBeDisabled();
    enterKeys();
    await testAndSave();
    expect(validationCalls(fetchMock)[0][1]).toEqual(expect.objectContaining({ method: "POST", headers: { "x-openai-api-key": OPENAI, "x-jev-api-key": JEV }, cache: "no-store" }));
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent(OPENAI));
    expect(screen.getByTestId("session")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("New chat"));
    expect(screen.getByTestId("session")).toHaveTextContent("2");
    expect(storage).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Open keys"));
    expect(screen.getByLabelText("OpenAI API key")).toHaveValue("");
    fireEvent.click(screen.getByText("Clear keys"));
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("shared"));
    expect(screen.getByTestId("session")).toHaveTextContent("3");
    cleanup();
    await setup();
    expect(screen.getByTestId("active")).toHaveTextContent("shared");
  });

  it("shows sanitized proxy failures without saving", async () => {
    const { fetchMock } = serve();
    fetchMock.mockImplementation(async (url: string) => (url === KEYS_URL
      ? { ok: true, status: 200, json: async () => ({ saved: false, where: null }) }
      : { ok: false, status: 400, json: async () => ({ error: "OpenAI key could not be validated." }) }) as never);
    await setup(); enterKeys(); fireEvent.click(screen.getByText("Test connection"));
    expect(await screen.findByRole("alert")).toHaveTextContent("OpenAI key could not be validated.");
    expect(screen.getByText("Save keys")).toBeDisabled();
    expect(screen.getByTestId("active")).toHaveTextContent("shared");
  });

  it("invalidates validation after edits and clears drafts on cancel with focus restored", async () => {
    serve();
    await setup(); enterKeys(); fireEvent.click(screen.getByText("Test connection"));
    await screen.findByText("Both keys work. Save to start a new chat.");
    fireEvent.change(screen.getByLabelText("Jev API key"), { target: { value: "new-secret" } });
    expect(screen.getByText("Save keys")).toBeDisabled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Open keys")).toHaveFocus();
    fireEvent.click(screen.getByText("Open keys"));
    expect(screen.getByLabelText("Jev API key")).toHaveValue("");
  });

  it("disables credential changes during a run", async () => {
    serve();
    await setup(true);
    expect(screen.getByLabelText("OpenAI API key")).toBeDisabled();
    expect(screen.getByText("Test connection")).toBeDisabled();
    expect(screen.getByText("Save keys")).toBeDisabled();
  });

  it("aborts pending validation when closed", async () => {
    const { fetchMock } = serve();
    fetchMock.mockImplementation(((url: string) => (url === KEYS_URL
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ saved: false, where: null }) })
      : new Promise(() => {}))) as never);
    await setup(); enterKeys(); fireEvent.click(screen.getByText("Test connection"));
    await waitFor(() => expect(validationCalls(fetchMock)).toHaveLength(1));
    const options = validationCalls(fetchMock)[0][1] as RequestInit;
    expect(screen.getByText("Checking both providers…")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(options?.signal?.aborted).toBe(true);
  });
});

describe("keys kept in this Mac's Keychain (story 16, TC-21)", () => {
  it("before saving, says where the keys will go", async () => {
    serve({ where: "keychain" });
    await setup();
    expect(screen.getByText(/keep your keys in this Mac's Keychain/)).toBeInTheDocument();
  });

  it("saves to the Keychain, then holds no copy and sends no key headers", async () => {
    const { fetchMock, state } = serve({ where: "keychain" });
    await setup();
    enterKeys();
    await testAndSave();
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("saved"));
    expect(state.saved).toBe(true);
    const post = fetchMock.mock.calls.find(([url, init]) => url === KEYS_URL && init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ openai: OPENAI, jev: JEV });
    expect(screen.queryByRole("dialog")).toBeNull();
    // No part of either key is anywhere on the page.
    expect(document.body.innerHTML).not.toContain(OPENAI.slice(0, 12));
    expect(document.body.innerHTML).not.toContain(JEV.slice(0, 12));
  });

  it("when keys are saved, the chat is open after a reload and the dialog offers Forget my keys", async () => {
    const { state } = serve({ where: "keychain", saved: true });
    await setup();
    expect(screen.getByTestId("active")).toHaveTextContent("saved");
    expect(screen.getByText(/Your keys are saved in this Mac's Keychain/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Forget my keys"));
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("shared"));
    expect(state.saved).toBe(false);
  });

  it("a refused save says why and keeps the keys for this session only", async () => {
    serve({ where: "keychain", refuse: "Your Keychain didn't save the keys, so I'll keep them for this session only." });
    await setup();
    enterKeys();
    await testAndSave();
    expect(await screen.findByText(/Your Keychain didn't save the keys/)).toBeInTheDocument();
    expect(screen.getByTestId("active")).toHaveTextContent(OPENAI);
    expect(screen.getByLabelText("OpenAI API key")).toHaveValue("");
  });
});
