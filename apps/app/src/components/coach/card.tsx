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
  cardRef,
}: {
  label: string;
  children: ReactNode;
  testId: string;
  tone?: "plain" | "pass" | "amber";
  state?: CardState;
  cardRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={cardRef as RefObject<HTMLElement>}
      className={`coach-card coach-card--${tone} coach-card--${state}`}
      data-testid={testId}
      data-state={state}
      aria-label={label}
      tabIndex={-1}
    >
      <p className="coach-card__label">{label}</p>
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
    if (!active) return;
    cardRef.current?.scrollIntoView?.({ block: align, behavior: "smooth" });
    const target: HTMLElement | null = primaryRef.current ?? cardRef.current;
    target?.focus({ preventScroll: true });
  }, [active, align]);
  return { cardRef, primaryRef };
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
