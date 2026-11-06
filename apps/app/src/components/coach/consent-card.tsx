"use client";

import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";

/**
 * The permission card (Ceetrix story 9): asked once, before the coach first
 * looks at this computer. It lists exactly what may be read; shell history is
 * a separate choice, off unless ticked. The answer is saved by the agent.
 */

export type ConsentAnswer = { allow: boolean; history: boolean };

export type ConsentCardProps = {
  items?: string[];
  historyItem?: string;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

const LABEL = "May I look at this computer?";

export function ConsentCard({ items = [], historyItem, status, respond, result }: ConsentCardProps) {
  const [history, setHistory] = useState(false);
  const [sent, setSent] = useState<ConsentAnswer | null>(null);
  const parsed = parseResult<Partial<ConsentAnswer>>(result);
  const answered: ConsentAnswer | null = typeof parsed?.allow === "boolean" ? { allow: parsed.allow, history: parsed.history === true } : sent;
  const active = status === "executing" && Boolean(respond) && answered === null;
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active);

  const answer = (allow: boolean) => {
    if (!active || !respond) return;
    const value = { allow, history: allow && history };
    setSent(value);
    respond(JSON.stringify(value));
  };

  if (answered) {
    const value = !answered.allow ? "Not now" : answered.history ? "Allowed, with shell history" : "Allowed, without shell history";
    return (
      <CoachCard kind="task" label={LABEL} testId="coach-consent" state="answered">
        <AnswerRecord label="You chose:" value={value} />
      </CoachCard>
    );
  }

  return (
    <CoachCard kind="task" label={LABEL} testId="coach-consent" state={active ? "active" : "plain"} cardRef={cardRef}>
      <p className="coach-muted">{"I'd read only these, and show you each command and the lines I kept:"}</p>
      <ul className="coach-consent__list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {historyItem && (
        <label className="coach-consent__history">
          <input type="checkbox" checked={history} disabled={!active} onChange={(event) => setHistory(event.target.checked)} />
          <span>{historyItem}</span>
        </label>
      )}
      <p className="coach-muted">I never change anything, and nothing leaves this computer.</p>
      <div className="coach-actions" role="group" aria-label="Allow or not now">
        <button ref={primaryRef} type="button" className="coach-button coach-button--primary" disabled={!active} onClick={() => answer(true)}>
          Allow
        </button>
        <button type="button" className="coach-button" disabled={!active} onClick={() => answer(false)}>
          Not now
        </button>
      </div>
    </CoachCard>
  );
}
