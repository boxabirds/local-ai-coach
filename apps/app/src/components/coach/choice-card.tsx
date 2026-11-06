import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { Figure } from "./figure";
import { FactBubble } from "./fact-bubble";
import { inline } from "./markdown";

/**
 * A test answered with buttons (Ceetrix story 11): one row per item, one button
 * per option, Check my answers once every row has one. The coach marks the
 * answers in code; this card only collects them.
 */

export type ChoiceCardProps = {
  stepId?: string;
  text?: string;
  items?: string[];
  options?: string[];
  figure?: string;
  /** What to know first (story 25), shown in a fact bubble before the task. */
  fact?: string;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

type ChoiceAnswer = { answers?: string[]; action?: "skip" };

export function ChoiceCard({ stepId, text = "", items = [], options = [], figure, fact, status, respond, result }: ChoiceCardProps) {
  // Keyed by row, not sized at first render: the card's arguments stream in, so the rows
  // may not exist yet when it first appears.
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [sent, setSent] = useState<ChoiceAnswer | null>(null);
  const answered = parseResult<ChoiceAnswer>(result) ?? sent;
  const active = status === "executing" && Boolean(respond) && !answered;
  const complete = items.length > 0 && items.every((_, i) => picked[i] !== undefined);
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active);

  const send = (value: ChoiceAnswer) => {
    if (!active || !respond) return;
    setSent(value);
    respond(JSON.stringify(value));
  };

  if (answered) {
    return (
      <>
      <FactBubble text={fact} />
      <CoachCard label="Your answers" quietLabel testId="coach-choice" state="answered" kind="task">
        <p className="coach-step__text coach-step__text--done" data-step-id={stepId}>
          {inline(text)}
        </p>
        {answered.action === "skip" ? (
          <AnswerRecord label="You chose:" value="Skip" />
        ) : (
          <ul className="coach-choice__record">
            {items.map((item, i) => (
              <li key={item}>
                <AnswerRecord label={`${item}:`} value={answered.answers?.[i] ?? ""} />
              </li>
            ))}
          </ul>
        )}
      </CoachCard>
      </>
    );
  }

  return (
    <>
    <FactBubble text={fact} />
    <CoachCard label="Your answers" quietLabel testId="coach-choice" state={active ? "active" : "plain"} cardRef={cardRef} kind="task">
      {figure && <Figure id={figure} />}
      <p className="coach-step__text" data-step-id={stepId}>
        {inline(text)}
      </p>
      {items.map((item, i) => (
        <div key={item} className="coach-choice__row" role="group" aria-label={item}>
          <span className="coach-choice__item">{item}</span>
          {options.map((option) => {
            const on = picked[i] === option;
            return (
              <button
                key={option}
                type="button"
                className="coach-button coach-figure__choice"
                aria-pressed={on}
                disabled={!active}
                onClick={() => setPicked((now) => ({ ...now, [i]: option }))}
              >
                {option}
              </button>
            );
          })}
        </div>
      ))}
      <div className="coach-actions" role="group" aria-label="Check or skip">
        <button
          ref={primaryRef}
          type="button"
          className="coach-button coach-button--primary"
          disabled={!active || !complete}
          onClick={() => send({ answers: items.map((_, i) => picked[i]) })}
        >
          Check my answers
        </button>
        <button type="button" className="coach-button" disabled={!active} onClick={() => send({ action: "skip" })}>
          Skip
        </button>
      </div>
    </CoachCard>
    </>
  );
}
