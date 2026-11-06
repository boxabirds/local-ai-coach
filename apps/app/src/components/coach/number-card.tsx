"use client";

import { useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { Figure } from "./figure";
import { FactBubble } from "./fact-bubble";
import { inline } from "./markdown";

export type Platform = "mac" | "linux" | "other";

export const WHERE_TO_LOOK: Record<Platform, string> = {
  mac: "On a Mac: Apple menu, About This Mac, the line that says Memory.",
  linux: "On Linux: run `free -h` and read the Mem line, in the total column.",
  other: "Look for Memory or RAM in your system settings.",
};

/** Read once from the browser; the card itself only takes the result. */
export function detectPlatform(userAgent: string): Platform {
  if (/Mac/i.test(userAgent)) return "mac";
  if (/Linux|X11/i.test(userAgent)) return "linux";
  return "other";
}

export type NumberCardProps = {
  prompt?: string;
  unit?: string;
  hint?: string;
  figure?: string;
  /** What to know first (story 25), shown in a fact bubble before the task. */
  fact?: string;
  platform: Platform;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

export function NumberCard({ prompt = "", unit = "GB", hint, figure, fact, platform, status, respond, result }: NumberCardProps) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const answered = parseResult<{ value?: number }>(result)?.value ?? sent;
  const active = status === "executing" && Boolean(respond) && answered === null;
  const { cardRef, primaryRef } = useCardFocus<HTMLInputElement>(active);
  const value = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(value) && value > 0;

  const submit = () => {
    if (!valid || !active || !respond) return;
    setSent(value);
    respond(JSON.stringify({ value }));
  };

  if (answered !== null) {
    return (
      <>
      <FactBubble text={fact} />
      <CoachCard label="Memory, in GB" testId="coach-number" state="answered" kind="task">
        <AnswerRecord label="You said:" value={`${answered} ${unit}`} />
      </CoachCard>
      </>
    );
  }

  return (
    <>
    <FactBubble text={fact} />
    <CoachCard label="Memory, in GB" testId="coach-number" state={active ? "active" : "plain"} cardRef={cardRef} kind="task">
      {figure && <Figure id={figure} />}
      <p className="coach-step__text">{inline(prompt)}</p>
      <p className="coach-muted" data-testid="coach-where-to-look">
        {inline(WHERE_TO_LOOK[platform])}
      </p>
      {hint && <p className="coach-hint__text">{inline(hint)}</p>}
      <form
        className="coach-number__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="coach-number__label">
          <input
            ref={primaryRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={draft}
            disabled={!active}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Memory in ${unit}`}
          />
          <span>{unit}</span>
        </label>
        <button type="submit" className="coach-button coach-button--primary" disabled={!valid || !active}>
          Check it
        </button>
      </form>
    </CoachCard>
    </>
  );
}
