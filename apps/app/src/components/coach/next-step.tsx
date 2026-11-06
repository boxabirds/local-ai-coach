import { useEffect, useRef, useState } from "react";
import type { CardStatus } from "./card";
import { StepCard } from "./step-card";
import { NumberCard, detectPlatform } from "./number-card";
import { ChoiceCard } from "./choice-card";

/**
 * show_next_step (Ceetrix story 19): the model names a step; this card fetches that step from
 * the lesson and draws the card it calls for. Which step comes next is the model's choice;
 * this only decides how a step looks, from the step's own check.
 */

export type Step = {
  id: string;
  text: string;
  where?: string;
  hint?: string;
  figure?: string;
  fact?: string;
  doIt?: unknown;
  check?: { kind?: string; compare?: string; choices?: { items: { label: string }[]; options: string[] } };
};
type Load = { state: "loading" } | { state: "ready"; step: Step } | { state: "missing" } | { state: "failed" };

export const STEP_URL = (station: string, step: string) => `/api/curriculum/step/${encodeURIComponent(station)}/${encodeURIComponent(step)}`;
export const NOT_FOUND_NOTE = "I couldn't find that step in the lesson.";
/** The step exists but didn't arrive (agent slow or down): the learner can retry; the model isn't told. */
export const NOT_LOADED_NOTE = "I couldn't load this step.";
const NOT_FOUND = 404;
const UNIT = "GB";

export type CardKind = "number" | "choice" | "step";

/** How a step is drawn: a number card for a typed real check, a choice card for choices, else a step card. */
export function cardFor(step: Step): CardKind {
  if (step.check?.kind === "real" && step.check.compare === "typed") return "number";
  if (step.check?.choices) return "choice";
  return "step";
}

export function NextStepCard({ station, step, status, respond, result }: {
  station?: string;
  step?: string;
  status: CardStatus;
  respond?: (value: string) => void;
  result?: string;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const told = useRef(false);
  // While arguments stream in, the ids grow a character at a time: fetch once they've arrived.
  const settled = status !== "inProgress";

  useEffect(() => {
    if (!settled || !station || !step) return;
    let live = true;
    // Only a 404 means the lesson has no such step; anything else is a failure to load it.
    fetch(STEP_URL(station, step), { cache: "no-store" })
      .then(async (response) => {
        if (!live) return;
        if (response.status === NOT_FOUND) setLoad({ state: "missing" });
        else if (!response.ok) setLoad({ state: "failed" });
        else setLoad({ state: "ready", step: (await response.json()).step as Step });
      })
      .catch(() => live && setLoad({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [settled, station, step, attempt]);

  // An unknown step goes back to the model as the answer, once, so it can choose again.
  useEffect(() => {
    if (load.state === "missing" && respond && !result && !told.current) {
      told.current = true;
      respond(JSON.stringify({ error: "step not found", station, step }));
    }
  }, [load, respond, result, station, step]);

  if (load.state === "missing") return <p className="coach-note">{NOT_FOUND_NOTE}</p>;
  if (load.state === "failed") {
    return (
      <p className="coach-note">
        {NOT_LOADED_NOTE}{" "}
        <button type="button" className="coach-button" onClick={() => { setLoad({ state: "loading" }); setAttempt((n) => n + 1); }}>Try again</button>
      </p>
    );
  }
  if (load.state === "loading") return null;
  const s = load.step;
  const figure = s.figure || undefined;
  const kind = cardFor(s);
  if (kind === "number") {
    return <NumberCard fact={s.fact} prompt={s.text} unit={UNIT} hint={s.hint} figure={figure} platform={detectPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent)} status={status} respond={respond} result={result} />;
  }
  if (kind === "choice") {
    const choices = s.check!.choices!;
    return <ChoiceCard fact={s.fact} stepId={s.id} text={s.text} items={choices.items.map((i) => i.label)} options={choices.options} figure={figure} status={status} respond={respond} result={result} />;
  }
  return <StepCard fact={s.fact} stationId={station!} stepId={s.id} text={s.text} where={s.where ?? "coach"} hint={s.hint} hasDoIt={Boolean(s.doIt)} figure={figure} status={status} respond={respond} result={result} />;
}
