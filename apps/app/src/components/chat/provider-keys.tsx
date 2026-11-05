"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { browserStorage, clearChat } from "@/lib/chat-store";

export type ProviderKeys = { openai: string; jev: string };
/** What the agent says about saved keys (Ceetrix story 16). `where` is "keychain" on a Mac, else null. */
export type SavedKeys = { saved: boolean; where: string | null };
export type SaveResult = { saved: boolean; error?: string };

type ProviderKeysContextValue = {
  headers: Record<string, string> | undefined;
  hasKeys: boolean;
  /** Keys are kept on this computer (not just for this session). */
  saved: boolean;
  /** Where saving goes on this computer: "keychain", or null for this session only. */
  where: string | null;
  session: number;
  save: (keys: ProviderKeys) => Promise<SaveResult>;
  clear: () => Promise<void>;
  newChat: () => void;
  draft: string;
  setDraft: (value: string) => void;
  keysOpen: boolean;
  setKeysOpen: (value: boolean) => void;
};
const ProviderKeysContext = createContext<ProviderKeysContextValue | null>(null);

export const KEYS_URL = "/api/coach-keys";

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
  const newChat = () => {
    clearChat(browserStorage());
    setDraft("");
    setSession((value) => value + 1);
  };

  const save = async (value: ProviderKeys): Promise<SaveResult> => {
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
  };

  const clear = async () => {
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
  };

  return (
    <ProviderKeysContext.Provider value={{
      headers: keys ? { "x-openai-api-key": keys.openai, "x-jev-api-key": keys.jev } : undefined,
      hasKeys: keys !== null || stored.saved,
      saved: stored.saved,
      where: stored.where,
      session,
      save,
      clear,
      newChat, draft, setDraft, keysOpen, setKeysOpen,
    }}>
      {children}
    </ProviderKeysContext.Provider>
  );
}

export function useProviderKeys() {
  const value = useContext(ProviderKeysContext);
  if (!value) throw new Error("ProviderKeysProvider is required");
  return value;
}
