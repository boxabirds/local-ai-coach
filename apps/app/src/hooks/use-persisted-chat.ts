"use client";

import { useEffect, useState } from "react";
import { browserStorage, loadChat, restorable, saveChat, type ChatMessage } from "@/lib/chat-store";

type Subscriber = { onMessagesChanged?: () => void; onStateChanged?: () => void; onRunFinalized?: () => void };

/**
 * The parts of CopilotKit's AG-UI agent this hook uses (a structural subset of
 * @ag-ui/client's AbstractAgent, which the app does not depend on directly).
 */
export type PersistableAgent = {
  messages: ChatMessage[];
  state: unknown;
  isRunning: boolean;
  setMessages(messages: ChatMessage[]): void;
  setState(state: Record<string, unknown>): void;
  subscribe(subscriber: Subscriber): { unsubscribe(): void };
};

/**
 * Bring back the kept conversation when the page opens, then keep every change
 * (Ceetrix story 4). A conversation already in the agent is never overwritten.
 *
 * CopilotChat connects to the agent when it mounts, and that connect run replays
 * the server's copy of the thread, which for a new thread is empty and replaces
 * what was restored. So the restore is applied again once, when the first run
 * finishes, if the conversation was wiped by it.
 *
 * Kept once per turn (story 22): when a run finishes, and when the conversation changes
 * outside a run (a card answer, New chat, a restore). Never per streamed token, which
 * serialised the whole conversation once a word. `kept` is false while the browser
 * refuses to keep it (full or turned off), so the page can say so.
 */
export function usePersistedChat(
  agent: PersistableAgent,
  storage: Storage | undefined = browserStorage(),
  onRestored?: () => void,
): { kept: boolean } {
  const [kept, setKept] = useState(true);
  useEffect(() => {
    let pending: { messages: ChatMessage[]; state: Record<string, unknown> } | null = null;
    if (agent.messages.length === 0) {
      const kept = loadChat(storage);
      if (kept) {
        pending = { messages: restorable(kept.messages), state: kept.state };
        agent.setMessages(pending.messages);
        agent.setState(pending.state);
        onRestored?.();
      }
    }
    const save = () => {
      // An empty conversation is nothing to keep, and not a failure to keep it.
      if (!storage || agent.messages.length === 0) return;
      setKept(saveChat(storage, agent.messages, agent.state));
    };
    const outsideARun = () => {
      if (!agent.isRunning) save();
    };
    const subscription = agent.subscribe({
      onMessagesChanged: outsideARun,
      onStateChanged: outsideARun,
      onRunFinalized: () => {
        if (pending && agent.messages.length === 0) {
          agent.setMessages(pending.messages);
          agent.setState(pending.state);
          onRestored?.();
        }
        pending = null;
        save();
      },
    });
    return () => subscription.unsubscribe();
    // onRestored is read once per agent on purpose; the page passes a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, storage]);
  return { kept };
}
