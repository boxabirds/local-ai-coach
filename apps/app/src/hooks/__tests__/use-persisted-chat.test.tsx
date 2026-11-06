import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePersistedChat, type PersistableAgent } from "../use-persisted-chat";
import { CHAT_KEY, loadChat, saveChat, type ChatMessage } from "@/lib/chat-store";
import { ProviderKeysProvider, useProviderKeys } from "@/components/chat/provider-keys";
import { SNAPSHOT, STUB_RUN } from "@/lib/__tests__/chat-fixtures";

/**
 * A stand-in with the AG-UI agent's observable behaviour: setMessages and
 * setState replace the value and notify every subscriber. The app cannot import
 * @ag-ui/client (not a direct dependency), so the hook takes this shape.
 */
class FakeAgent implements PersistableAgent {
  messages: ChatMessage[] = [];
  state: Record<string, unknown> = {};
  isRunning = false;
  private subscribers = new Set<{ onMessagesChanged?: () => void; onStateChanged?: () => void; onRunFinalized?: () => void }>();
  /** What CopilotChat's connect run does to a new thread: replace the messages with the server's (none), then finish. */
  connectEmptyThread() {
    this.isRunning = true;
    this.setMessages([]);
    this.setState({});
    this.finish();
  }
  /** A run that streams: the messages change once per token, then the run finishes (AG-UI's order). */
  streamRun(tokens: number, base: ChatMessage[] = []) {
    this.isRunning = true;
    for (let i = 1; i <= tokens; i += 1) {
      this.setMessages([...base, { id: "answer", role: "assistant", content: "x".repeat(i) }]);
    }
    this.finish();
  }
  finish() {
    this.isRunning = false;
    this.subscribers.forEach((s) => s.onRunFinalized?.());
  }
  setMessages(messages: ChatMessage[]) {
    this.messages = messages;
    this.subscribers.forEach((s) => s.onMessagesChanged?.());
  }
  setState(state: Record<string, unknown>) {
    this.state = state;
    this.subscribers.forEach((s) => s.onStateChanged?.());
  }
  subscribe(subscriber: { onMessagesChanged?: () => void; onStateChanged?: () => void; onRunFinalized?: () => void }) {
    this.subscribers.add(subscriber);
    return { unsubscribe: () => void this.subscribers.delete(subscriber) };
  }
}

function Harness({ agent, storage = localStorage }: { agent: PersistableAgent; storage?: Storage }) {
  const { kept } = usePersistedChat(agent, storage);
  return <output data-testid="kept">{String(kept)}</output>;
}

/** localStorage's contract, counting writes; `full` makes setItem throw as a full store does. */
class CountingStorage implements Storage {
  private data = new Map<string, string>();
  writes = 0;
  full = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) {
    if (this.full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    this.writes += 1;
    this.data.set(key, value);
  }
}

const QUESTION: ChatMessage = { id: "q", role: "user", content: "A sample question" };
const TOKENS = 50;

describe("kept per turn (story 22, TC-04 to TC-08)", () => {
  it("TC-04 and TC-05: a streamed run writes once, when it finishes, with the whole answer", () => {
    const storage = new CountingStorage();
    const agent = new FakeAgent();
    render(<Harness agent={agent} storage={storage} />);
    act(() => agent.streamRun(TOKENS, [QUESTION]));
    expect(storage.writes).toBe(1);
    expect(loadChat(storage)?.messages.at(-1)?.content).toBe("x".repeat(TOKENS));
  });

  it("TC-06: a change outside a run (a card answer, a restore) is kept at once", () => {
    const storage = new CountingStorage();
    const agent = new FakeAgent();
    render(<Harness agent={agent} storage={storage} />);
    act(() => agent.setMessages([QUESTION]));
    expect(storage.writes).toBe(1);
  });

  it("TC-07: a full store says so, and the next good write clears it", () => {
    const storage = new CountingStorage();
    storage.full = true;
    const agent = new FakeAgent();
    render(<Harness agent={agent} storage={storage} />);
    expect(screen.getByTestId("kept")).toHaveTextContent("true");
    act(() => agent.streamRun(3, [QUESTION]));
    expect(screen.getByTestId("kept")).toHaveTextContent("false");
    storage.full = false;
    act(() => agent.streamRun(3, [QUESTION]));
    expect(screen.getByTestId("kept")).toHaveTextContent("true");
  });

  it("TC-08: a run that ends with no messages writes nothing and removes nothing", () => {
    const storage = new CountingStorage();
    saveChat(storage, [QUESTION], {});
    const writes = storage.writes;
    const agent = new FakeAgent();
    agent.messages = [QUESTION]; // a live conversation, so nothing is restored over it
    render(<Harness agent={agent} storage={storage} />);
    act(() => { agent.isRunning = true; agent.setMessages([]); agent.finish(); });
    expect(storage.writes).toBe(writes);
    expect(screen.getByTestId("kept")).toHaveTextContent("true");
    expect(loadChat(storage)?.messages).toEqual([QUESTION]);
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("usePersistedChat", () => {
  it("TC-20 restores the kept conversation and map state into an empty agent", () => {
    saveChat(localStorage, STUB_RUN, SNAPSHOT);
    const agent = new FakeAgent();
    expect(agent.messages).toEqual([]);
    render(<Harness agent={agent} />);
    expect(agent.messages).toEqual(STUB_RUN);
    expect(agent.state).toEqual(SNAPSHOT);
  });

  it("TC-20b the restore survives the chat's connect run wiping a new thread", () => {
    saveChat(localStorage, STUB_RUN, SNAPSHOT);
    const agent = new FakeAgent();
    render(<Harness agent={agent} />);
    act(() => agent.connectEmptyThread());
    expect(agent.messages).toEqual(STUB_RUN);
    expect(agent.state).toEqual(SNAPSHOT);
    expect(loadChat(localStorage)?.messages).toEqual(STUB_RUN);
  });

  it("TC-20c a later run that empties the chat is not undone (only the first run after load)", () => {
    saveChat(localStorage, STUB_RUN, SNAPSHOT);
    const agent = new FakeAgent();
    render(<Harness agent={agent} />);
    act(() => agent.connectEmptyThread());
    act(() => agent.connectEmptyThread());
    expect(agent.messages).toEqual([]);
  });

  it("TC-21 never overwrites a conversation already in the agent", () => {
    saveChat(localStorage, STUB_RUN, SNAPSHOT);
    const agent = new FakeAgent();
    const live: ChatMessage[] = [{ id: "x", role: "user", content: "Find my number" }];
    agent.messages = live;
    render(<Harness agent={agent} />);
    expect(agent.messages).toBe(live);
  });

  it("TC-22 keeps each change to the messages", () => {
    const agent = new FakeAgent();
    render(<Harness agent={agent} />);
    expect(loadChat(localStorage)).toBeNull();
    act(() => agent.setMessages(STUB_RUN.slice(0, 1)));
    expect(loadChat(localStorage)?.messages).toEqual(STUB_RUN.slice(0, 1));
  });

  it("TC-23 keeps each change to the state", () => {
    const agent = new FakeAgent();
    render(<Harness agent={agent} />);
    act(() => agent.setMessages(STUB_RUN));
    act(() => agent.setState(SNAPSHOT));
    expect(loadChat(localStorage)?.state).toEqual(SNAPSHOT);
  });

  it("TC-24 stops keeping changes once unmounted", () => {
    const agent = new FakeAgent();
    const { unmount } = render(<Harness agent={agent} />);
    act(() => agent.setMessages(STUB_RUN));
    const before = localStorage.getItem(CHAT_KEY);
    unmount();
    agent.setMessages([...STUB_RUN, { id: "late", role: "user", content: "late" }]);
    expect(localStorage.getItem(CHAT_KEY)).toBe(before);
  });
});

describe("New chat and keys", () => {
  function KeysHarness() {
    const { session, save, newChat } = useProviderKeys();
    return (
      <>
        <span data-testid="session">{session}</span>
        <button onClick={() => save({ openai: "sk-test-OPENAI-SECRET", jev: "jev-test-SECRET" })}>Save keys</button>
        <button onClick={newChat}>New chat</button>
      </>
    );
  }

  it("TC-25 New chat forgets the kept conversation and starts a new session", () => {
    saveChat(localStorage, STUB_RUN, SNAPSHOT);
    render(
      <ProviderKeysProvider>
        <KeysHarness />
      </ProviderKeysProvider>,
    );
    const before = Number(screen.getByTestId("session").textContent);
    fireEvent.click(screen.getByText("New chat"));
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();
    expect(Number(screen.getByTestId("session").textContent)).toBe(before + 1);
  });

  it("TC-26 saved keys never reach the kept conversation, and saving keys keeps it", () => {
    const agent = new FakeAgent();
    render(
      <ProviderKeysProvider>
        <KeysHarness />
        <Harness agent={agent} />
      </ProviderKeysProvider>,
    );
    fireEvent.click(screen.getByText("Save keys"));
    act(() => agent.setMessages(STUB_RUN));
    act(() => agent.setState(SNAPSHOT));
    const stored = localStorage.getItem(CHAT_KEY) ?? "";
    expect(stored).toContain("Read Priya's story");
    expect(stored).not.toContain("OPENAI-SECRET");
    expect(stored).not.toContain("jev-test-SECRET");
    expect(Object.keys(localStorage)).toEqual([CHAT_KEY]);
  });
});
