/**
 * Keeps the conversation in this browser so a reload brings it back (Ceetrix story 4).
 *
 * Only the agent's messages and state are stored. API keys live in React memory in
 * provider-keys.tsx and travel as request headers; they are never part of either,
 * so they can never land here.
 */

export const CHAT_KEY = "coach.chat.v1";

/** This browser's localStorage, or undefined on the server or where reading it throws. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
const VERSION = 1;

/** The AG-UI message fields this module reads (a structural subset of @ag-ui/core's Message). */
export type ChatMessage = {
  id: string;
  role: string;
  content?: unknown;
  toolCalls?: { id: string; type?: string; function: { name: string; arguments: string } }[];
  toolCallId?: string;
  [key: string]: unknown;
};

export type SavedChat = { version: typeof VERSION; messages: ChatMessage[]; state: Record<string, unknown> };

function isMessage(value: unknown): value is ChatMessage {
  return typeof value === "object" && value !== null && typeof (value as ChatMessage).id === "string" && typeof (value as ChatMessage).role === "string";
}

/** The kept conversation, or null if there is none or it is unreadable (which is then removed). */
export function loadChat(storage: Storage | undefined): SavedChat | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CHAT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedChat>;
    if (parsed.version === VERSION && Array.isArray(parsed.messages) && parsed.messages.every(isMessage)) {
      const state = typeof parsed.state === "object" && parsed.state !== null ? parsed.state : {};
      return { version: VERSION, messages: parsed.messages, state };
    }
  } catch {
    // fall through: unreadable
  }
  clearChat(storage);
  return null;
}

/** Keep the conversation. Returns false, never throws, when storage is full or turned off. */
export function saveChat(storage: Storage | undefined, messages: readonly ChatMessage[], state: unknown): boolean {
  if (!storage || messages.length === 0) return false;
  const value: SavedChat = {
    version: VERSION,
    messages: [...messages],
    state: typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {},
  };
  try {
    storage.setItem(CHAT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearChat(storage: Storage | undefined): void {
  try {
    storage?.removeItem(CHAT_KEY);
  } catch {
    // storage turned off: nothing kept to clear
  }
}

/**
 * Messages safe to restore: a card that was still waiting for an answer at reload
 * would come back with no way to answer it, so tool calls with no result are
 * removed, and an assistant message left with no text and no calls is dropped.
 */
export function restorable(messages: readonly ChatMessage[]): ChatMessage[] {
  const answered = new Set(messages.filter((m) => m.role === "tool" && typeof m.toolCallId === "string").map((m) => m.toolCallId));
  const out: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      out.push(message);
      continue;
    }
    const toolCalls = message.toolCalls.filter((call) => answered.has(call.id));
    if (toolCalls.length === message.toolCalls.length) {
      out.push(message);
      continue;
    }
    const hasText = typeof message.content === "string" && message.content.trim().length > 0;
    if (toolCalls.length || hasText) {
      const { toolCalls: _dropped, ...rest } = message;
      void _dropped;
      out.push(toolCalls.length ? { ...rest, toolCalls } : rest);
    }
  }
  return out;
}
