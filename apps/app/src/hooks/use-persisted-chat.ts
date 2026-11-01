"use client";

import { useEffect } from "react";
import { browserStorage, loadChat, restorable, saveChat, type ChatMessage } from "@/lib/chat-store";

/**
 * The parts of CopilotKit's AG-UI agent this hook uses (a structural subset of
 * @ag-ui/client's AbstractAgent, which the app does not depend on directly).
 */
export type PersistableAgent = {
  messages: ChatMessage[];
  state: unknown;
  setMessages(messages: ChatMessage[]): void;
  setState(state: Record<string, unknown>): void;
  subscribe(subscriber: { onMessagesChanged?: () => void; onStateChanged?: () => void }): { unsubscribe(): void };
};

/**
 * Bring back the kept conversation when the page opens, then keep every change
 * (Ceetrix story 4). A conversation already in the agent is never overwritten.
 */
export function usePersistedChat(agent: PersistableAgent, storage: Storage | undefined = browserStorage()) {
  useEffect(() => {
    if (agent.messages.length === 0) {
      const kept = loadChat(storage);
      if (kept) {
        agent.setMessages(restorable(kept.messages));
        agent.setState(kept.state);
      }
    }
    const save = () => saveChat(storage, agent.messages, agent.state);
    const subscription = agent.subscribe({ onMessagesChanged: save, onStateChanged: save });
    return () => subscription.unsubscribe();
  }, [agent, storage]);
}
