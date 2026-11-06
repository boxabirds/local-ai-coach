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
    return keepInView(card);
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
    if (!card || !isNewestCard(card)) return;
    bringIntoView(card);
    return keepInView(card);
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

/**
 * A card that grows after it arrives (a figure's drawing loads, a hint opens) is brought back into
 * view each time it grows, so its bottom never ends up under the message box. Stops once the
 * learner scrolls for themselves, or when the card stops waiting. Returns the stop.
 */
export function keepInView(card: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  let height = card.getBoundingClientRect().height;
  const observer = new ResizeObserver(() => {
    const next = card.getBoundingClientRect().height;
    if (next <= height) return;
    height = next;
    if (isNewestCard(card)) bringIntoView(card);
  });
  observer.observe(card);
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
