"use client";

import { useState } from "react";
import { CoachCard, parseResult, type CardStatus, type Respond } from "./card";
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
  platform: Platform;
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

export function NumberCard({ prompt = "", unit = "GB", hint, platform, status, respond, result }: NumberCardProps) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const answered = parseResult<{ value?: number }>(result)?.value ?? sent;
  const value = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(value) && value > 0;
  const locked = status !== "executing" || !respond || answered !== null;

  const submit = () => {
    if (!valid || locked || !respond) return;
    setSent(value);
    respond(JSON.stringify({ value }));
  };

  return (
    <CoachCard label="Your number" testId="coach-number">
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
          <span className="sr-only">Memory in {unit}</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={answered !== null ? String(answered) : draft}
            disabled={locked}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Memory in ${unit}`}
          />
          <span>{unit}</span>
        </label>
        <button type="submit" className="coach-button" disabled={!valid || locked}>
          Check it
        </button>
      </form>
    </CoachCard>
  );
}
