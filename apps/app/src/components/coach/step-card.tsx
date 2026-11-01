"use client";

import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { inline } from "./markdown";

export type StepAction = "claim" | "do_it" | "skip";

const WHERE: Record<string, string> = {
  settings: "In your settings",
  "real-terminal": "In your terminal",
  sandbox: "In the practice terminal",
  "chat-app": "In your chat app",
  coach: "Here, with me",
  read: "Read this",
};

export const ACTION_LABEL: Record<StepAction, string> = {
  claim: "I did it",
  do_it: "Do it for me",
  skip: "Skip",
};

export type StepCardProps = {
  stationId?: string;
  stepId?: string;
  text?: string;
  where?: string;
  hint?: string;
  hasDoIt?: boolean;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

export function StepCard({ stepId, text = "", where = "", hint, hasDoIt = false, status, respond, result }: StepCardProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const [chosen, setChosen] = useState<StepAction | null>(null);
  const answered = parseResult<{ action?: StepAction }>(result)?.action ?? chosen;
  const active = status === "executing" && Boolean(respond) && !answered;
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active);
  const actions: StepAction[] = hasDoIt ? ["claim", "do_it", "skip"] : ["claim", "skip"];
  const label = WHERE[where] ?? "Your next step";

  const act = (action: StepAction) => {
    if (!respond || answered) return;
    setChosen(action);
    respond(JSON.stringify({ action }));
  };

  if (answered) {
    return (
      <CoachCard label={label} testId="coach-step" state="answered">
        <p className="coach-step__text coach-step__text--done" data-step-id={stepId}>
          {inline(text)}
        </p>
        <AnswerRecord label="You chose:" value={ACTION_LABEL[answered] ?? answered} />
      </CoachCard>
    );
  }

  return (
    <CoachCard label={label} testId="coach-step" state={active ? "active" : "plain"} cardRef={cardRef}>
      <p className="coach-step__text" data-step-id={stepId}>
        {inline(text)}
      </p>
      {where === "sandbox" && (
        <p className="coach-muted" data-testid="coach-sandbox-slot">
          The practice terminal opens here.
        </p>
      )}
      {hint && (
        <div className="coach-hint">
          <button
            type="button"
            className="coach-link"
            aria-expanded={hintOpen}
            aria-label="Show a hint"
            onClick={() => setHintOpen((open) => !open)}
          >
            ?
          </button>
          {hintOpen && <p className="coach-hint__text">{inline(hint)}</p>}
        </div>
      )}
      <div className="coach-actions" role="group" aria-label="What did you do?">
        {actions.map((action) => (
          <button
            key={action}
            ref={action === "claim" ? primaryRef : undefined}
            type="button"
            className={action === "claim" ? "coach-button coach-button--primary" : "coach-button"}
            disabled={!active}
            onClick={() => act(action)}
          >
            {ACTION_LABEL[action]}
          </button>
        ))}
      </div>
    </CoachCard>
  );
}
