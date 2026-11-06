import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { inline } from "./markdown";
import { Figure } from "./figure";
import { FactBubble } from "./fact-bubble";

export type StepAction = "claim" | "do_it" | "skip";

/** Where the learner acts, shown only where it tells them something the task doesn't (story 25). */
const WHERE: Record<string, string> = {
  "real-terminal": "In your terminal",
  sandbox: "In the practice terminal",
  "chat-app": "In your chat app",
};
const NEXT_STEP = "Your next step";

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
  figure?: string;
  /** What to know first (story 25), shown in a fact bubble before the task. */
  fact?: string;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

export function StepCard({ stepId, text = "", where = "", hint, hasDoIt = false, figure, fact, status, respond, result }: StepCardProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const [chosen, setChosen] = useState<StepAction | null>(null);
  const answered = parseResult<{ action?: StepAction }>(result)?.action ?? chosen;
  const active = status === "executing" && Boolean(respond) && !answered;
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active);
  const actions: StepAction[] = hasDoIt ? ["claim", "do_it", "skip"] : ["claim", "skip"];
  const label = WHERE[where] ?? NEXT_STEP;
  const quietLabel = !(where in WHERE);

  const act = (action: StepAction) => {
    if (!respond || answered) return;
    setChosen(action);
    respond(JSON.stringify({ action }));
  };

  if (answered) {
    return (
      <>
      <FactBubble text={fact} />
      <CoachCard label={label} testId="coach-step" state="answered" kind="task" quietLabel={quietLabel}>
        <p className="coach-step__text coach-step__text--done" data-step-id={stepId}>
          {inline(text)}
        </p>
        <AnswerRecord label="You chose:" value={ACTION_LABEL[answered] ?? answered} />
      </CoachCard>
      </>
    );
  }

  return (
    <>
    <FactBubble text={fact} />
    <CoachCard label={label} testId="coach-step" state={active ? "active" : "plain"} cardRef={cardRef} kind="task" quietLabel={quietLabel}>
      {figure && <Figure id={figure} />}
      <p className="coach-step__text" data-step-id={stepId}>
        {inline(text)}
        {hint && (
          <>
            {" "}
            <button
              type="button"
              className="coach-hint-icon"
              aria-expanded={hintOpen}
              aria-label="Show a hint"
              title="Show a hint"
              onClick={() => setHintOpen((open) => !open)}
            >
              <HintIcon />
            </button>
          </>
        )}
      </p>
      {hint && hintOpen && <p className="coach-hint__text">{inline(hint)}</p>}
      {where === "sandbox" && (
        <p className="coach-muted" data-testid="coach-sandbox-slot">
          The practice terminal opens here.
        </p>
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
    </>
  );
}

/** A question mark in a circle, drawn in the text's own colour; the button carries its name. */
function HintIcon() {
  return (
    <svg className="coach-hint-icon__svg" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.1 6.2a2 2 0 1 1 2.9 1.8c-.6.3-1 .8-1 1.5v.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.9" r="0.9" fill="currentColor" />
    </svg>
  );
}
