"use client";

import { useState } from "react";
import { CoachCard, parseResult, type CardStatus, type Respond } from "./card";

export type RunConfirmProps = {
  cmd?: string;
  explain?: string;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

export function RunConfirm({ cmd = "", explain, status, respond, result }: RunConfirmProps) {
  const [sent, setSent] = useState<boolean | null>(null);
  const answered = parseResult<{ confirmed?: boolean }>(result)?.confirmed ?? sent;
  const locked = status !== "executing" || !respond || answered !== null;

  const answer = (confirmed: boolean) => {
    if (locked || !respond) return;
    setSent(confirmed);
    respond(JSON.stringify({ confirmed }));
  };

  return (
    <CoachCard label="Run this on your machine?" testId="coach-run-confirm">
      <pre className="coach-pre">
        <code>{cmd}</code>
      </pre>
      {explain && <p className="coach-muted">{explain}</p>}
      <div className="coach-actions" role="group" aria-label="Run or cancel">
        <button type="button" className="coach-button" disabled={locked} aria-pressed={answered === true} onClick={() => answer(true)}>
          Run
        </button>
        <button type="button" className="coach-button" disabled={locked} aria-pressed={answered === false} onClick={() => answer(false)}>
          Cancel
        </button>
      </div>
    </CoachCard>
  );
}
