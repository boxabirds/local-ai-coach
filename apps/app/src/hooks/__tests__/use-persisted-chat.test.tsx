import { afterEach, describe, expect, it } from "vitest";
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
  private subscribers = new Set<{ onMessagesChanged?: () => void; onStateChanged?: () => void; onRunFinalized?: () => void }>();
  /** What CopilotChat's connect run does to a new thread: replace the messages with the server's (none), then finish. */
  connectEmptyThread() {
    this.setMessages([]);
    this.setState({});
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

function Harness({ agent }: { agent: PersistableAgent }) {
  usePersistedChat(agent, localStorage);
  return null;
}

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
