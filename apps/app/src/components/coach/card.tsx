"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/** The tool-call states CopilotKit passes to a card. */
export type CardStatus = "inProgress" | "executing" | "complete";

/** What a human-in-the-loop card calls once with its JSON answer. */
export type Respond = (result: string) => void;

/** How a card looks: waiting for the learner, already answered, or just showing something. */
export type CardState = "active" | "answered" | "plain";

export function CoachCard({
  label,
  children,
  testId,
  tone = "plain",
  state = "plain",
  variant = "card",
  kind,
  quietLabel = false,
  cardRef,
}: {
  label: string;
  children: ReactNode;
  testId: string;
  tone?: "plain" | "pass" | "notyet";
  state?: CardState;
  /** "thread" drops the frame, for content shown as a run of chat bubbles. */
  variant?: "card" | "thread";
  /** "task": a thing for the learner to do, drawn green (story 25). */
  kind?: "task";
  /** The label is for screen readers only, when it would only repeat the card. */
  quietLabel?: boolean;
  cardRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={cardRef as RefObject<HTMLElement>}
      className={`coach-card coach-card--${tone} coach-card--${state} coach-card--${variant}${kind ? ` coach-card--${kind}` : ""}`}
      data-testid={testId}
      data-state={state}
      aria-label={label}
      tabIndex={-1}
    >
      <p className={`coach-card__label${quietLabel ? " coach-sr-only" : ""}`}>{label}</p>
      {children}
    </section>
  );
}

/** The one-line record an answered card collapses to. */
export function AnswerRecord({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <p className="coach-record" data-testid="coach-record">
      <span className="coach-record__label">{label}</span> <strong>{value}</strong>
      {children}
    </p>
  );
}

/**
 * When a card starts waiting for the learner, bring it into view and put focus
 * on the control they need next. Focus never scrolls a second time, so a long
 * card (the story) opens at its start, not at its buttons.
 */
export function useCardFocus<T extends HTMLElement>(active: boolean, align: "start" | "nearest" = "nearest") {
  const cardRef = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<T | null>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!active || !card || !isNewestCard(card)) return;
    bringIntoView(card, align);
    const target: HTMLElement = primaryRef.current ?? card;
    target.focus({ preventScroll: true });
    // The story (align start) keeps its own Next row in view beat by beat; it isn't held.
    return align === "nearest" ? keepInView(card) : undefined;
  }, [active, align]);
  return { cardRef, primaryRef };
}

/**
 * For cards that only show something (a check result, the map): scroll into
 * view once, when they arrive as the newest card, and never take focus, so a
 * learner typing in the message box keeps their cursor. Older cards re-mounted
 * from the thread never move the reader (upstream's rule in app/page.tsx).
 */
export function useArrivalScroll() {
  const cardRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (card && isNewestCard(card)) bringIntoView(card);
    // Not held: only a card waiting for the learner is (story 27).
  }, []);
  return { cardRef };
}

const SCROLLER = ".reader-scroll-view";

/**
 * Bring a card into view. One that fits is shown whole; one taller than the chat's visible area
 * is aligned by its bottom, where the instruction and the controls are, so the thing to do is
 * on screen and the learner scrolls up for the rest. Aligning its top left the controls under
 * the message box (Julian, 2026-11-06).
 */
export function bringIntoView(card: HTMLElement, align: "start" | "nearest" = "nearest"): void {
  const scroller = card.closest(SCROLLER);
  const room = scroller ? scroller.clientHeight : typeof window === "undefined" ? 0 : window.innerHeight;
  const tooTall = room > 0 && card.getBoundingClientRect().height > room;
  card.scrollIntoView?.({ block: tooTall && align === "nearest" ? "end" : align, behavior: "smooth" });
}

/** What the learner does to scroll for themselves; after any of these the coach stops steering. */
const OWN_SCROLL = ["wheel", "touchmove", "keydown"] as const;

/** Where the visible chat is, and how far above its bottom a card must stop (the message box). */
function room(card: HTMLElement): { top: number; bottom: number; height: number } {
  const scroller = card.closest<HTMLElement>(SCROLLER);
  if (!scroller) {
    const height = typeof window === "undefined" ? 0 : window.innerHeight;
    return { top: 0, bottom: height, height };
  }
  const box = scroller.getBoundingClientRect();
  const clearance = parseFloat(getComputedStyle(scroller).scrollPaddingBottom) || 0;
  return { top: box.top, bottom: box.bottom - clearance, height: box.height - clearance };
}

/**
 * Whether the card has left the visible chat: its bottom is under the message box, or (for a card
 * that fits) its top is above the chat. A card taller than the chat only counts its bottom, where
 * the controls are.
 */
export function outOfView(card: HTMLElement): boolean {
  const box = card.getBoundingClientRect();
  const visible = room(card);
  if (box.bottom > visible.bottom) return true;
  return box.height <= visible.height && box.top < visible.top;
}

/**
 * Story 27: while a card waits for the learner, it is held in view. Anything in the chat changing
 * size (the coach's words above it still arriving in half-second chunks, its own drawing loading,
 * a hint opening) brings it back if it has left the visible chat. Released once the learner
 * scrolls for themselves, a newer card arrives, or the card stops waiting. Returns the release.
 */
export function keepInView(card: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => {
    if (card.isConnected && isNewestCard(card) && outOfView(card)) bringIntoView(card);
  });
  observer.observe(card);
  const scroller = card.closest(SCROLLER);
  if (scroller) Array.from(scroller.children).forEach((child) => observer.observe(child));
  const stop = () => {
    observer.disconnect();
    OWN_SCROLL.forEach((name) => window.removeEventListener(name, stop, true));
  };
  OWN_SCROLL.forEach((name) => window.addEventListener(name, stop, { capture: true, passive: true }));
  return stop;
}

/** True when no coach card comes after this one in the page. */
export function isNewestCard(card: HTMLElement): boolean {
  const cards = card.ownerDocument.querySelectorAll(".coach-card");
  return cards[cards.length - 1] === card;
}

/** The parsed answer a completed card sent, or null. */
export function parseResult<T>(result: string | undefined): T | null {
  if (!result) return null;
  try {
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}
