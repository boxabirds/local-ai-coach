import type { ReactNode } from "react";

/** The tool-call states CopilotKit passes to a card. */
export type CardStatus = "inProgress" | "executing" | "complete";

/** What a human-in-the-loop card calls once with its JSON answer. */
export type Respond = (result: string) => void;

export function CoachCard({
  label,
  children,
  testId,
  tone = "plain",
}: {
  label: string;
  children: ReactNode;
  testId: string;
  tone?: "plain" | "pass" | "amber";
}) {
  return (
    <section className={`coach-card coach-card--${tone}`} data-testid={testId} aria-label={label}>
      <p className="coach-card__label">{label}</p>
      {children}
    </section>
  );
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
