"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { Markdown } from "./markdown";
import { QUOTABLE_ATTR } from "../chat/ask-about";
import { Figure } from "./figure";
import { figureId } from "./figure-logic";
import { storySentences } from "./story-beats";

const CONTINUE_KEYS = new Set([" ", "Enter"]);
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Whether a key press at this target is someone typing: "filled" field, "empty" field, or "none". */
export function isTypingTarget(target: EventTarget | null): "filled" | "empty" | "none" {
  if (!(target instanceof HTMLElement)) return "none";
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !["button", "submit", "checkbox", "radio"].includes(target.type)))
    return target.value.length > 0 ? "filled" : "empty";
  if (target.isContentEditable) return (target.textContent ?? "").length > 0 ? "filled" : "empty";
  return "none";
}

/**
 * Space or Enter continues the story, unless the learner is typing in a field
 * that has text in it, or the key is on a button (its own click handles it).
 * Listens in the capture phase so an empty message box never sends or types.
 */
export function useContinueKeys(enabled: boolean, onContinue: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!CONTINUE_KEYS.has(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, a, [role='button']")) return;
      // Enter on a focused coach bubble selects it to ask about (story 8); Space still goes on.
      if (event.key === "Enter" && target instanceof HTMLElement && target.closest(`[${QUOTABLE_ATTR}]`)) return;
      if (isTypingTarget(target) === "filled") return;
      event.preventDefault();
      event.stopPropagation();
      onContinue();
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [enabled, onContinue]);
}

/** The story's bubbles: the one way a story is drawn, while reading and when read again. */
function StoryBubbles({
  units,
  shown,
  animateNewest = false,
  newestRef,
}: {
  units: string[];
  shown: number;
  animateNewest?: boolean;
  newestRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="coach-story__text" aria-live="polite">
      {units.slice(0, shown).map((unit, i) => {
        const figure = figureId(unit);
        const base = figure ? "coach-beat coach-beat--figure" : "coach-bubble coach-beat";
        return (
          <div
            key={i}
            ref={i === shown - 1 ? newestRef : undefined}
            className={animateNewest && i === shown - 1 ? `${base} coach-beat--new` : base}
            data-testid="coach-beat"
          >
            {figure ? <Figure id={figure} /> : <Markdown text={unit} />}
          </div>
        );
      })}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

export const STORY_URL = (storyId: string) => `/api/curriculum/story/${encodeURIComponent(storyId)}`;
const LOAD_ERROR = "I couldn't load the story. Check the coach is running, then start again.";

export type StoryCardProps = {
  storyId?: string;
  question?: string;
  options?: string[];
  status: CardStatus;
  respond?: Respond;
  result?: string;
};

type Load = { state: "loading" } | { state: "ready"; text: string } | { state: "failed" };

/** One fetch per story per page load; a failure is forgotten so a later card can retry. */
const stories = new Map<string, Promise<string>>();

export function loadStory(storyId: string): Promise<string> {
  let pending = stories.get(storyId);
  if (!pending) {
    pending = fetch(STORY_URL(storyId)).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.text();
    });
    pending.catch(() => stories.delete(storyId));
    stories.set(storyId, pending);
  }
  return pending;
}

/** For tests: forget every cached story. */
export function clearStoryCache() {
  stories.clear();
}

/** The story's own title: its first heading, without the Markdown marks. */
function title(text: string): string {
  const heading = text.split("\n").find((line) => /^#{1,4}\s/.test(line));
  return heading ? heading.replace(/^#{1,4}\s+/, "") : "The story";
}

export function StoryCard({ storyId, question, options = [], status, respond, result }: StoryCardProps) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [reopened, setReopened] = useState(false);
  const [shown, setShown] = useState(1);
  const [animate, setAnimate] = useState(false);
  const answered = parseResult<{ answer?: string }>(result)?.answer ?? chosen;
  const active = status === "executing" && Boolean(respond) && !answered && load.state === "ready";
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active, "start");
  const beats = useMemo(() => (load.state === "ready" ? storySentences(load.text) : []), [load]);
  const asking = shown >= beats.length;
  const newestBeat = useRef<HTMLDivElement | null>(null);
  const footer = useRef<HTMLDivElement | null>(null);
  const firstAnswer = useRef<HTMLButtonElement | null>(null);

  const next = useCallback(() => {
    setAnimate(!prefersReducedMotion());
    setShown((count) => Math.min(count + 1, beats.length));
  }, [beats.length]);
  const showRest = () => {
    setAnimate(false);
    setShown(beats.length);
  };
  useContinueKeys(active && !asking, next);

  // After each beat, bring the Go on row into view (the new beat sits just above it);
  // at the question, bring the answers into view. The first answer then has the focus.
  useEffect(() => {
    if (!active || shown <= 1) return;
    const target = footer.current ?? newestBeat.current?.parentElement?.nextElementSibling ?? newestBeat.current;
    target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [active, shown]);
  // A beat can grow after it arrives (a figure's drawing loads after its beat):
  // bring the Go on row back into view each time the newest beat changes size.
  useEffect(() => {
    const beat = newestBeat.current;
    if (!active || asking || shown <= 1 || !beat || typeof ResizeObserver === "undefined") return;
    let lastHeight = beat.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const height = beat.getBoundingClientRect().height;
      if (height <= lastHeight) return;
      lastHeight = height;
      footer.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    });
    observer.observe(beat);
    return () => observer.disconnect();
  }, [active, asking, shown]);
  useEffect(() => {
    if (active && asking && shown > 1) firstAnswer.current?.focus({ preventScroll: true });
  }, [active, asking, shown]);

  useEffect(() => {
    if (!storyId) return;
    let live = true;
    loadStory(storyId)
      .then((text) => live && setLoad({ state: "ready", text }))
      .catch(() => live && setLoad({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [storyId]);

  const pick = (option: string) => {
    if (!respond || answered) return;
    setChosen(option);
    respond(JSON.stringify({ read: true, answer: option }));
  };

  if (answered) {
    return (
      <CoachCard label="Story" testId="coach-story" state="answered">
        <AnswerRecord label={load.state === "ready" ? `${title(load.text)}. You answered:` : "You answered:"} value={answered} />
        {load.state === "ready" && (
          <button type="button" className="coach-link" aria-expanded={reopened} onClick={() => setReopened((open) => !open)}>
            {reopened ? "Hide the story" : "Read it again"}
          </button>
        )}
        {reopened && load.state === "ready" && <StoryBubbles units={beats} shown={beats.length} />}
      </CoachCard>
    );
  }

  return (
    <CoachCard label="Story" testId="coach-story" state={active ? "active" : "plain"} variant="thread" cardRef={cardRef}>
      {load.state === "loading" && <p className="coach-muted">Loading the story…</p>}
      {load.state === "failed" && (
        <p className="coach-error" role="alert">
          {LOAD_ERROR}
        </p>
      )}
      {load.state === "ready" && (
        <>
          <StoryBubbles units={beats} shown={shown} animateNewest={animate} newestRef={newestBeat} />
          {asking ? (
            <div className={active ? "coach-story__ask coach-story__ask--active" : "coach-story__ask"}>
              {question && <p className="coach-question">{question}</p>}
              <div className="coach-actions" role="group" aria-label={question ?? "Answers"}>
                {options.map((option, i) => (
                  <button
                    key={option}
                    ref={i === 0 ? (el) => { firstAnswer.current = el; if (beats.length <= 1) primaryRef.current = el; } : undefined}
                    type="button"
                    className="coach-button"
                    disabled={!active}
                    onClick={() => pick(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="coach-story__footer" ref={footer} data-testid="coach-story-footer">
              <button ref={primaryRef} type="button" className="coach-button coach-button--primary" disabled={!active} onClick={next}>
                Go on
              </button>
              <span>or press Space</span>
              <span className="coach-story__progress">
                <span data-testid="coach-beat-count">
                  {shown} of {beats.length}
                </span>
                <button type="button" className="coach-link" disabled={!active} onClick={showRest}>
                  Show the rest
                </button>
              </span>
            </div>
          )}
        </>
      )}
    </CoachCard>
  );
}
