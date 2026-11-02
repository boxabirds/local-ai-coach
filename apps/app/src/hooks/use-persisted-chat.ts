"use client";

import { useEffect } from "react";
import { browserStorage, loadChat, restorable, saveChat, type ChatMessage } from "@/lib/chat-store";

type Subscriber = { onMessagesChanged?: () => void; onStateChanged?: () => void; onRunFinalized?: () => void };

/**
 * The parts of CopilotKit's AG-UI agent this hook uses (a structural subset of
 * @ag-ui/client's AbstractAgent, which the app does not depend on directly).
 */
export type PersistableAgent = {
  messages: ChatMessage[];
  state: unknown;
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
 */
export function usePersistedChat(agent: PersistableAgent, storage: Storage | undefined = browserStorage()) {
  useEffect(() => {
    let pending: { messages: ChatMessage[]; state: Record<string, unknown> } | null = null;
    if (agent.messages.length === 0) {
      const kept = loadChat(storage);
      if (kept) {
        pending = { messages: restorable(kept.messages), state: kept.state };
        agent.setMessages(pending.messages);
        agent.setState(pending.state);
      }
    }
    const save = () => saveChat(storage, agent.messages, agent.state);
    const subscription = agent.subscribe({
      onMessagesChanged: save,
      onStateChanged: save,
      onRunFinalized: () => {
        if (pending && agent.messages.length === 0) {
          agent.setMessages(pending.messages);
          agent.setState(pending.state);
        }
        pending = null;
      },
    });
    return () => subscription.unsubscribe();
  }, [agent, storage]);
}
