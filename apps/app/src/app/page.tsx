"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProviderKeysDialog } from "@/components/chat/provider-keys-dialog";
import { RestartDialog } from "@/components/chat/restart-dialog";
import { WholeMap } from "@/components/coach/whole-map";
import { useProviderKeys } from "@/components/chat/provider-keys";
import { COACH_STUB, KeyGatedChatView, StubBadge } from "@/components/chat/key-gated-chat-view";
import { ReaderScrollView } from "@/components/chat/reader-scroll-view";
import { AnswerMarkdown } from "@/components/chat/answer-markdown";
import { QuoteContext } from "@/components/chat/quote-block";
import { QuotedInput } from "@/components/chat/quoted-input";
import { QuotedUserText } from "@/components/chat/quoted-user-text";
import { AskAboutPalette, type RateRequest } from "@/hooks/use-ask-about";
import { sendRating } from "@/components/chat/rating";
import {
  CopilotChat,
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import { useExampleSuggestions } from "@/hooks";
import { useCoachUI } from "@/hooks/use-coach-ui";
import { usePersistedChat, type PersistableAgent } from "@/hooks/use-persisted-chat";
import { FollowEnd, type FollowAgent } from "@/components/chat/follow-end-view";
import { newThreadId } from "@/lib/chat-store";

/** Shown while the browser refuses to keep the conversation (story 22). */
const NOT_KEPT = "I can't keep this conversation in this browser, so a reload will lose it.";
/** The chat's message renderers, one object for the page's life (story 22). */
const MESSAGE_VIEW = { assistantMessage: { markdownRenderer: AnswerMarkdown }, userMessage: { messageRenderer: QuotedUserText } };
/** The page redraws when a run starts or stops, not per streamed token (story 22). */
const PAGE_UPDATES = [UseAgentUpdate.OnRunStatusChanged];

export default function HomePage() {
  useCoachUI();
  useExampleSuggestions();
  // One thread id for the page's agent and the chat (new each load; see newThreadId),
  // so the restored conversation lands in the agent copy the chat actually renders.
  const [threadId] = useState(newThreadId);
  const { agent } = useAgent({ threadId, updates: PAGE_UPDATES });
  // A restored conversation opens at its end: FollowEnd starts out following (story 28).
  const { kept } = usePersistedChat(agent as unknown as PersistableAgent);
  const { newChat, hasKeys, where, keysOpen, setKeysOpen } = useProviderKeys();
  const { copilotkit } = useCopilotKit();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const retryingRef = useRef(false);
  const chatRoot = useRef<HTMLDivElement>(null);
  // Story 8: click a coach bubble, Ask about this, and its words wait in the message box.
  const [quote, setQuote] = useState<string | null>(null);
  const clearQuote = useCallback(() => setQuote(null), []);
  const askAbout = useCallback((text: string) => {
    setQuote(text);
    requestAnimationFrame(() => chatRoot.current?.querySelector<HTMLTextAreaElement>('[data-testid="copilot-chat-textarea"]')?.focus());
  }, []);
  // Story 26: Good and Not good in the same palette, kept on this computer as test data.
  const rate = useCallback((request: RateRequest) => sendRating(threadId, agent.messages, request), [threadId, agent]);

  useEffect(() => {
    const subscription = agent.subscribe({
      onRunInitialized: () => {
        setError(null);
      },
      onRunFinishedEvent: () => {
        setError(null);
      },
    });
    return () => subscription.unsubscribe();
  }, [agent]);

  // Story 22: API keys and New chat always work. A run in progress is stopped first, so a run
  // that never finishes (the agent restarted, the network dropped) can't lock the learner out.
  const stopThen = (action: () => void) => {
    if (agent.isRunning) {
      try {
        copilotkit.stopAgent({ agent });
      } catch {
        // Nothing to stop, or it couldn't be: do what was asked anyway.
      }
    }
    action();
  };
  const openKeys = () => stopThen(() => setKeysOpen(true));

  const labels = useMemo(() => ({
    welcomeMessageText: "This is the coach for Mastering Local AI. Start with the story.",
    chatInputPlaceholder: "Ask the coach…",
    // Only while keys are missing: it's the instruction to start. Once the coach can answer, the
    // line under the message box goes (Julian: a help menu will explain the rest).
    chatDisclaimerText: COACH_STUB || hasKeys
      ? ""
      : where === "keychain"
        ? "To start, I need two keys: OpenAI and Jev. I'll keep them in this Mac's Keychain."
        : "To start, I need two keys: OpenAI and Jev. I forget them when you refresh.",
  }), [hasKeys, where]);

  const retry = async () => {
    if (retryingRef.current || agent.isRunning) return;
    retryingRef.current = true;
    setRetrying(true);
    setError(null);
    try {
      await copilotkit.runAgent({ agent });
    } catch {
      setError(
        "I can't reach my agent. Check the coach is still running, then try again.",
      );
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };

  return (
    <div className="chat-app">
      <a className="chat-skip" href="#main-content">
        Skip to chat
      </a>
      <header className="chat-header">
        <span className="chat-name">
          Mastering Local AI coach
          <StubBadge />
        </span>
        <nav aria-label="Main navigation">
          <button type="button" onClick={() => setMapOpen(true)} aria-haspopup="dialog">
            Map
          </button>
          <button type="button" onClick={() => stopThen(newChat)} disabled={retrying}>
            New chat
          </button>
          <button type="button" onClick={() => stopThen(() => setRestartOpen(true))} disabled={retrying} aria-haspopup="dialog">
            Restart coach
          </button>
          <button type="button" onClick={openKeys} disabled={retrying} aria-haspopup="dialog">
            API keys{hasKeys ? " •" : ""}
          </button>
        </nav>
      </header>
      {mapOpen && <WholeMap onClose={() => setMapOpen(false)} />}
      {restartOpen && <RestartDialog onClose={() => setRestartOpen(false)} onRestarted={newChat} />}
      {keysOpen && <ProviderKeysDialog onClose={() => setKeysOpen(false)} disabled={retrying} />}
      <main id="main-content" className="chat-main">
        {error && (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={retry}
              disabled={retrying || agent.isRunning}
            >
              Try again
            </button>
            <button type="button" className="provider-keys-recover" disabled={retrying} onClick={openKeys}>API keys</button>
          </div>
        )}
        {!kept && <p className="chat-not-kept" role="status">{NOT_KEPT}</p>}
        <div className="chat-content" ref={chatRoot}>
          <QuoteContext.Provider value={{ quote, clear: clearQuote }}>
          <CopilotChat
            threadId={threadId}
            chatView={KeyGatedChatView}
            autoScroll={false}
            scrollView={ReaderScrollView}
            messageView={MESSAGE_VIEW}
            input={QuotedInput}
            onError={() =>
              setError(
                "Something cut my answer off. Try again, or ask me something else.",
              )
            }
            labels={labels}
          />
          </QuoteContext.Provider>
          <AskAboutPalette root={chatRoot} onAsk={askAbout} onRate={rate} />
          {/* Story 28: the one thing that scrolls the chat. */}
          <FollowEnd root={chatRoot} agent={agent as unknown as FollowAgent} />
        </div>
      </main>
    </div>
  );
}
