"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProviderKeysDialog } from "@/components/chat/provider-keys-dialog";
import { useProviderKeys } from "@/components/chat/provider-keys";
import { COACH_STUB, KeyGatedChatView, StubBadge } from "@/components/chat/key-gated-chat-view";
import { ReaderScrollView } from "@/components/chat/reader-scroll-view";
import { AnswerMarkdown } from "@/components/chat/answer-markdown";
import { QuoteContext } from "@/components/chat/quote-block";
import { QuotedInput } from "@/components/chat/quoted-input";
import { QuotedUserText } from "@/components/chat/quoted-user-text";
import { useAskAbout } from "@/hooks/use-ask-about";
import {
  CopilotChat,
  useAgent,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import { useExampleSuggestions } from "@/hooks";
import { useCoachUI } from "@/hooks/use-coach-ui";
import { usePersistedChat, type PersistableAgent } from "@/hooks/use-persisted-chat";
import { newThreadId } from "@/lib/chat-store";

/** Frames to keep pinning the end while restored cards finish laying out. */
const RESTORE_SCROLL_FRAMES = 10;

export default function HomePage() {
  useCoachUI();
  useExampleSuggestions();
  // One thread id for the page's agent and the chat (new each load; see newThreadId),
  // so the restored conversation lands in the agent copy the chat actually renders.
  const [threadId] = useState(newThreadId);
  const { agent } = useAgent({ threadId });
  // A restored conversation opens at its end, where the learner left off.
  const scrollToEnd = useCallback(() => {
    const settle = (frames: number) =>
      requestAnimationFrame(() => {
        const scroller = chatRoot.current?.querySelector<HTMLElement>(".reader-scroll-view");
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
        if (frames > 0) settle(frames - 1);
      });
    settle(RESTORE_SCROLL_FRAMES);
  }, []);
  usePersistedChat(agent as unknown as PersistableAgent, undefined, scrollToEnd);
  const { newChat, hasKeys, keysOpen, setKeysOpen } = useProviderKeys();
  const { copilotkit } = useCopilotKit();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const chatRoot = useRef<HTMLDivElement>(null);
  // Story 8: click a coach bubble, Ask about this, and its words wait in the message box.
  const [quote, setQuote] = useState<string | null>(null);
  const clearQuote = useCallback(() => setQuote(null), []);
  const askAbout = useCallback((text: string) => {
    setQuote(text);
    requestAnimationFrame(() => chatRoot.current?.querySelector<HTMLTextAreaElement>('[data-testid="copilot-chat-textarea"]')?.focus());
  }, []);
  const { button: askButton } = useAskAbout(chatRoot, askAbout);
  const latestQuestion = agent.messages.filter((message) => message.role === "user").at(-1)?.id;

  // Move only when a question is submitted. Streamed text and growing visuals
  // must never take scroll ownership from the reader.
  useEffect(() => {
    if (!latestQuestion || !chatRoot.current) return;
    const root = chatRoot.current;
    const revealQuestion = () => {
      const question = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="copilot-user-message"]'))
        .find((element) => element.dataset.messageId === latestQuestion);
      if (!question) return false;
      question.scrollIntoView?.({ block: "start", behavior: "instant" });
      return true;
    };
    if (revealQuestion()) return;
    const observer = new MutationObserver(() => {
      if (revealQuestion()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [latestQuestion]);

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
          <button type="button" onClick={newChat} disabled={agent.isRunning || retrying}>
            New chat
          </button>
          <button type="button" onClick={() => setKeysOpen(true)} disabled={agent.isRunning || retrying} aria-haspopup="dialog">
            API keys{hasKeys ? " •" : ""}
          </button>
        </nav>
      </header>
      {keysOpen && <ProviderKeysDialog onClose={() => setKeysOpen(false)} disabled={agent.isRunning || retrying} />}
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
            <button type="button" className="provider-keys-recover" disabled={retrying || agent.isRunning} onClick={() => setKeysOpen(true)}>API keys</button>
          </div>
        )}
        <div className="chat-content" ref={chatRoot}>
          <QuoteContext.Provider value={{ quote, clear: clearQuote }}>
          <CopilotChat
            threadId={threadId}
            chatView={KeyGatedChatView}
            autoScroll={false}
            scrollView={ReaderScrollView}
            messageView={{ assistantMessage: { markdownRenderer: AnswerMarkdown }, userMessage: { messageRenderer: QuotedUserText } }}
            input={QuotedInput}
            onError={() =>
              setError(
                "Something cut my answer off. Try again, or ask me something else.",
              )
            }
            labels={{
              welcomeMessageText: "This is the coach for Mastering Local AI. Start with the story.",
              chatInputPlaceholder: "Ask the coach…",
              chatDisclaimerText: COACH_STUB
                ? "Stub coach: no model and no keys."
                : hasKeys
                  ? "I use two hosted services for now. Your own model stays on your machine."
                  : "To start, I need two keys: OpenAI and Jev. I forget them when you refresh.",
            }}
          />
          </QuoteContext.Provider>
          {askButton}
        </div>
      </main>
    </div>
  );
}
