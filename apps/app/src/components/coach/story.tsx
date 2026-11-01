"use client";

import { useEffect, useState } from "react";
import { AnswerRecord, CoachCard, parseResult, useCardFocus, type CardStatus, type Respond } from "./card";
import { Markdown } from "./markdown";

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
  const answered = parseResult<{ answer?: string }>(result)?.answer ?? chosen;
  const active = status === "executing" && Boolean(respond) && !answered && load.state === "ready";
  const { cardRef, primaryRef } = useCardFocus<HTMLButtonElement>(active, "start");

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
        {reopened && load.state === "ready" && <Markdown text={load.text} />}
      </CoachCard>
    );
  }

  return (
    <CoachCard label="Story" testId="coach-story" state={active ? "active" : "plain"} cardRef={cardRef}>
      {load.state === "loading" && <p className="coach-muted">Loading the story…</p>}
      {load.state === "failed" && (
        <p className="coach-error" role="alert">
          {LOAD_ERROR}
        </p>
      )}
      {load.state === "ready" && (
        <>
          <div className="coach-story__text">
            <Markdown text={load.text} />
          </div>
          {question && <p className="coach-question">{question}</p>}
          <div className="coach-actions" role="group" aria-label={question ?? "Answers"}>
            {options.map((option, i) => (
              <button
                key={option}
                ref={i === 0 ? primaryRef : undefined}
                type="button"
                className="coach-button"
                disabled={!active}
                onClick={() => pick(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </CoachCard>
  );
}
