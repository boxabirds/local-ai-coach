"use client";

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

type Step = {
  id: string;
  text: string;
  where?: string;
  hint?: string;
  figure?: string;
  doIt?: unknown;
  check?: { kind?: string; compare?: string; choices?: { items: { label: string }[]; options: string[] } };
};
type Load = { state: "loading" } | { state: "ready"; step: Step } | { state: "missing" };

export const STEP_URL = (station: string, step: string) => `/api/curriculum/step/${encodeURIComponent(station)}/${encodeURIComponent(step)}`;
export const NOT_FOUND_NOTE = "I couldn't find that step in the lesson.";
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
  const told = useRef(false);
  // While arguments stream in, the ids grow a character at a time: fetch once they've arrived.
  const settled = status !== "inProgress";

  useEffect(() => {
    if (!settled || !station || !step) return;
    let live = true;
    fetch(STEP_URL(station, step), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => live && setLoad({ state: "ready", step: data.step as Step }))
      .catch(() => live && setLoad({ state: "missing" }));
    return () => {
      live = false;
    };
  }, [settled, station, step]);

  // An unknown step goes back to the model as the answer, once, so it can choose again.
  useEffect(() => {
    if (load.state === "missing" && respond && !result && !told.current) {
      told.current = true;
      respond(JSON.stringify({ error: "step not found", station, step }));
    }
  }, [load, respond, result, station, step]);

  if (load.state === "missing") return <p className="coach-note">{NOT_FOUND_NOTE}</p>;
  if (load.state === "loading") return null;
  const s = load.step;
  const figure = s.figure || undefined;
  const kind = cardFor(s);
  if (kind === "number") {
    return <NumberCard prompt={s.text} unit={UNIT} hint={s.hint} figure={figure} platform={detectPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent)} status={status} respond={respond} result={result} />;
  }
  if (kind === "choice") {
    const choices = s.check!.choices!;
    return <ChoiceCard stepId={s.id} text={s.text} items={choices.items.map((i) => i.label)} options={choices.options} figure={figure} status={status} respond={respond} result={result} />;
  }
  return <StepCard stationId={station!} stepId={s.id} text={s.text} where={s.where ?? "coach"} hint={s.hint} hasDoIt={Boolean(s.doIt)} figure={figure} status={status} respond={respond} result={result} />;
}
