"use client";

import { useState } from "react";
import { CoachCard, parseResult, type CardStatus, type Respond } from "./card";
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
  const locked = status !== "executing" || !respond || answered !== null;

  const send = (answer: Answer) => {
    if (locked || !respond) return;
    setSent(answer);
    respond(JSON.stringify(answer));
  };

  return (
    <CoachCard label={kind === "redo" ? "Now you" : "Quick recap"} testId="coach-recap">
      <p className="coach-step__text" data-item-id={itemId}>
        {inline(question)}
      </p>
      {options && options.length > 0 ? (
        <div className="coach-actions" role="group" aria-label={question}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="coach-button"
              disabled={locked}
              aria-pressed={answered?.answer === option}
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
            type="text"
            aria-label="Your answer"
            value={answered?.answer ?? draft}
            disabled={locked}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="coach-button" disabled={locked || !draft.trim()}>
            Answer
          </button>
        </form>
      )}
      <button type="button" className="coach-link" disabled={locked} onClick={() => send({ skipped: true })}>
        Skip for now
      </button>
    </CoachCard>
  );
}
