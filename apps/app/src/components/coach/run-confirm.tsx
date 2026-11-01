"use client";

import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";

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
  const active = status === "executing" && Boolean(respond) && answered === null;
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active);

  const answer = (confirmed: boolean) => {
    if (!active || !respond) return;
    setSent(confirmed);
    respond(JSON.stringify({ confirmed }));
  };

  const code = (
    <pre className="coach-pre">
      <code>{cmd}</code>
    </pre>
  );

  if (answered !== null) {
    return (
      <CoachCard label="Run this on your machine?" testId="coach-run-confirm" state="answered">
        {code}
        <AnswerRecord label="You chose:" value={answered ? "Run" : "Cancel"} />
      </CoachCard>
    );
  }

  return (
    <CoachCard label="Run this on your machine?" testId="coach-run-confirm" state={active ? "active" : "plain"} cardRef={cardRef}>
      {code}
      {explain && <p className="coach-muted">{explain}</p>}
      <div className="coach-actions" role="group" aria-label="Run or cancel">
        <button ref={primaryRef} type="button" className="coach-button coach-button--primary" disabled={!active} onClick={() => answer(true)}>
          Run
        </button>
        <button type="button" className="coach-button" disabled={!active} onClick={() => answer(false)}>
          Cancel
        </button>
      </div>
    </CoachCard>
  );
}
