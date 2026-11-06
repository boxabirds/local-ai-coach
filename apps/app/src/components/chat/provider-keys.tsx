"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { browserStorage, clearChat } from "@/lib/chat-store";

export type ProviderKeys = { openai: string; jev: string };
/** What the agent says about saved keys (Ceetrix story 16). `where` is "keychain" on a Mac, else null. */
export type SavedKeys = { saved: boolean; where: string | null };
export type SaveResult = { saved: boolean; error?: string };
/** An OpenAI-compatible server used instead of OpenAI (story 21). Not secret: its key is the OpenAI key's slot. */
export type Server = { base_url: string; model: string };

type ProviderKeysContextValue = {
  headers: Record<string, string>;
  hasKeys: boolean;
  /** Keys are kept on this computer (not just for this session). */
  saved: boolean;
  /** Where saving goes on this computer: "keychain", or null for this session only. */
  where: string | null;
  session: number;
  save: (keys: ProviderKeys) => Promise<SaveResult>;
  clear: () => Promise<void>;
  /** The OpenAI-compatible server in use, or null for OpenAI. */
  server: Server | null;
  /** Save a server, or null to go back to OpenAI. Returns the reason if it wasn't saved. */
  setServer: (next: Server | null) => Promise<string | null>;
  newChat: () => void;
  keysOpen: boolean;
  setKeysOpen: (value: boolean) => void;
};
const ProviderKeysContext = createContext<ProviderKeysContextValue | null>(null);

/**
 * The message box's text, apart from the keys (story 22): typing re-renders the box only,
 * not CopilotKit and the page. It lives up here so it survives the chat starting again
 * when keys are saved (the box keeps what the learner typed before adding keys).
 */
type DraftValue = { draft: string; setDraft: (value: string) => void };
const DraftContext = createContext<DraftValue | null>(null);

export const KEYS_URL = "/api/coach-keys";
/**
 * No key headers, as one object for the page's life (story 22). CopilotKit turns a missing
 * headers prop into a new {} on every render and re-applies it to every agent each time.
 */
const NO_HEADERS: Record<string, string> = Object.freeze({}) as Record<string, string>;
export const SERVER_URL = "/api/coach-provider";

async function ask(method: "GET" | "POST" | "DELETE", body?: ProviderKeys): Promise<SavedKeys & { error?: string }> {
  const response = await fetch(KEYS_URL, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  return { saved: data?.saved === true, where: typeof data?.where === "string" ? data.where : null, ...(typeof data?.error === "string" && { error: data.error }) };
}

export function ProviderKeysProvider({ children }: { children: ReactNode }) {
  // Session keys stay in memory only and never go to browser storage. Saved keys live with
  // the local agent (the Keychain on a Mac); once saved, this page holds no copy at all and
  // sends no key headers: the agent adds them itself (story 16).
  const [keys, setKeys] = useState<ProviderKeys | null>(null);
  const [stored, setStored] = useState<SavedKeys>({ saved: false, where: null });
  const [session, setSession] = useState(0);
  const [draft, setDraft] = useState("");
  const [keysOpen, setKeysOpen] = useState(false);
  const [server, setServerState] = useState<Server | null>(null);

  useEffect(() => {
    let live = true;
    fetch(SERVER_URL, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => live && setServerState(data?.server ?? null))
      .catch(() => undefined); // no agent yet: OpenAI, as before
    return () => {
      live = false;
    };
  }, []);

  const setServer = useCallback(async (next: Server | null): Promise<string | null> => {
    try {
      const response = await fetch(SERVER_URL, {
        method: next ? "POST" : "DELETE",
        headers: next ? { "content-type": "application/json" } : undefined,
        body: next ? JSON.stringify(next) : undefined,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) return typeof data?.error === "string" ? data.error : "I couldn't save the server.";
      setServerState(data?.server ?? null);
      return null;
    } catch {
      return "I couldn't reach my agent to save the server.";
    }
  }, []);

  useEffect(() => {
    let live = true;
    ask("GET")
      .then((state) => live && setStored({ saved: state.saved, where: state.where }))
      .catch(() => undefined); // no agent yet: nothing saved, as before
    return () => {
      live = false;
    };
  }, []);

  // New chat is the one deliberate way to start again: forget the kept conversation too.
  const newChat = useCallback(() => {
    clearChat(browserStorage());
    setDraft("");
    setSession((value) => value + 1);
  }, []);

  const save = useCallback(async (value: ProviderKeys): Promise<SaveResult> => {
    let result: SaveResult = { saved: false };
    if (stored.where) {
      try {
        const state = await ask("POST", value);
        setStored({ saved: state.saved, where: state.where });
        result = { saved: state.saved, ...(state.error && { error: state.error }) };
      } catch {
        result = { saved: false, error: "I couldn't reach my agent to save the keys, so I'll keep them for this session only." };
      }
    }
    // Not saved: keep them for this session, as before.
    setKeys(result.saved ? null : value);
    // A refused save leaves the dialog open, so its message about why can be read.
    if (!result.error) setKeysOpen(false);
    setSession((count) => count + 1);
    return result;
  }, [stored.where]);

  const clear = useCallback(async () => {
    if (stored.saved) {
      try {
        const state = await ask("DELETE");
        setStored({ saved: state.saved, where: state.where });
      } catch {
        // Leave the saved state as it was; the dialog still shows Forget my keys.
      }
    }
    setKeys(null);
    newChat();
  }, [stored.saved, newChat]);

  const headers = useMemo(
    () => (keys ? { "x-openai-api-key": keys.openai, "x-jev-api-key": keys.jev } : NO_HEADERS),
    [keys],
  );
  const value = useMemo<ProviderKeysContextValue>(() => ({
    headers,
    hasKeys: keys !== null || stored.saved,
    saved: stored.saved,
    where: stored.where,
    session, save, clear, server, setServer,
    newChat, keysOpen, setKeysOpen,
  }), [headers, keys, stored, session, save, clear, server, setServer, newChat, keysOpen]);
  const draftValue = useMemo<DraftValue>(() => ({ draft, setDraft }), [draft]);

  return (
    <ProviderKeysContext.Provider value={value}>
      <DraftContext.Provider value={draftValue}>{children}</DraftContext.Provider>
    </ProviderKeysContext.Provider>
  );
}

export function useProviderKeys() {
  const value = useContext(ProviderKeysContext);
  if (!value) throw new Error("ProviderKeysProvider is required");
  return value;
}

export function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("ProviderKeysProvider is required");
  return value;
}
