"use client";

import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { inline } from "./markdown";

export type RecapCardProps = {
  itemId?: string;
  question?: string;
  kind?: "recap" | "redo";
  options?: string[];
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

type Answer = { answer?: string; skipped?: boolean };

export function RecapCard({ itemId, question = "", kind = "recap", options, status, respond, result }: RecapCardProps) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<Answer | null>(null);
  const answered = parseResult<Answer>(result) ?? sent;
  const active = status === "executing" && Boolean(respond) && answered === null;
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement & HTMLInputElement>(active);
  const label = kind === "redo" ? "Now you" : "Quick recap";

  const send = (answer: Answer) => {
    if (!active || !respond) return;
    setSent(answer);
    respond(JSON.stringify(answer));
  };

  const prompt = (
    <p className="coach-step__text" data-item-id={itemId}>
      {inline(question)}
    </p>
  );

  if (answered !== null) {
    return (
      <CoachCard label={label} testId="coach-recap" state="answered">
        {prompt}
        <AnswerRecord label={answered.skipped ? "You skipped it" : "You answered:"} value={answered.skipped ? "" : answered.answer} />
      </CoachCard>
    );
  }

  return (
    <CoachCard label={label} testId="coach-recap" state={active ? "active" : "plain"} cardRef={cardRef}>
      {prompt}
      {options && options.length > 0 ? (
        <div className="coach-actions" role="group" aria-label={question}>
          {options.map((option, i) => (
            <button
              key={option}
              ref={i === 0 ? primaryRef : undefined}
              type="button"
              className="coach-button"
              disabled={!active}
              onClick={() => send({ answer: option })}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="coach-number__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) send({ answer: draft.trim() });
          }}
        >
          <input
            ref={primaryRef}
            type="text"
            aria-label="Your answer"
            value={draft}
            disabled={!active}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="coach-button coach-button--primary" disabled={!active || !draft.trim()}>
            Answer
          </button>
        </form>
      )}
      <button type="button" className="coach-link" disabled={!active} onClick={() => send({ skipped: true })}>
        Skip for now
      </button>
    </CoachCard>
  );
}
