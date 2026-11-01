"use client";

import { useEffect, useState } from "react";
import { CoachCard, parseResult, type CardStatus, type Respond } from "./card";
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

export function StoryCard({ storyId, question, options = [], status, respond, result }: StoryCardProps) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const answered = parseResult<{ answer?: string }>(result)?.answer ?? chosen;

  useEffect(() => {
    if (!storyId) return;
    let live = true;
    fetch(STORY_URL(storyId))
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const text = await response.text();
        if (live) setLoad({ state: "ready", text });
      })
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

  return (
    <CoachCard label="Story" testId="coach-story">
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
            {options.map((option) => (
              <button
                key={option}
                type="button"
                className={answered === option ? "coach-button coach-button--chosen" : "coach-button"}
                disabled={status !== "executing" || !respond || Boolean(answered)}
                aria-pressed={answered === option}
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
