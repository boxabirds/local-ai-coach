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
 * When a card starts waiting for the learner, put focus on the control they need next. It never
 * scrolls: the chat's one scroll owner, FollowEnd, brings new cards into view (story 28).
 */
export function useCardFocus<T extends HTMLElement>(active: boolean) {
  const cardRef = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<T | null>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!active || !card || !isNewestCard(card)) return;
    const target: HTMLElement = primaryRef.current ?? card;
    target.focus({ preventScroll: true });
  }, [active]);
  return { cardRef, primaryRef };
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
