"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { defaultChoices, parseWhen, resultText, sanitiseSvg, visible, type Choices, type FigureData } from "./figure-logic";

/**
 * One figure from the curriculum (Ceetrix story 7): a drawing, a row of choices
 * under it and a caption. Choosing redraws it; nothing is recorded or sent. The
 * figure never takes the keyboard focus from the story: a mouse click on a
 * choice leaves the focus where it was, so Space still means Go on.
 */

export const FIGURE_URL = (id: string) => `/api/curriculum/figure/${encodeURIComponent(id)}`;
export const FIGURE_LOAD_ERROR = "I couldn't load this picture.";

const figures = new Map<string, Promise<FigureData>>();

export function loadFigure(id: string): Promise<FigureData> {
  let pending = figures.get(id);
  if (!pending) {
    pending = fetch(FIGURE_URL(id)).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<FigureData>;
    });
    pending.catch(() => figures.delete(id));
    figures.set(id, pending);
  }
  return pending;
}

/** For tests: forget every cached figure. */
export function clearFigureCache() {
  figures.clear();
}

type Load = { state: "loading" } | { state: "ready"; data: FigureData } | { state: "failed" };

export function Figure({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [choices, setChoices] = useState<Choices>({});
  const art = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    loadFigure(id)
      .then((data) => {
        if (!live) return;
        setChoices(defaultChoices(data.controls));
        setLoad({ state: "ready", data });
      })
      .catch(() => live && setLoad({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [id]);

  const markup = useMemo(() => (load.state === "ready" ? sanitiseSvg(load.data.svg) : ""), [load]);
  const result = useMemo(() => resultText(markup, choices), [markup, choices]);

  // The figure inserts its own SVG; React owns only the empty div, so a re-render
  // never puts the markup back and undoes the drawing below.
  useLayoutEffect(() => {
    if (art.current) art.current.innerHTML = markup;
  }, [markup]);

  // Draw the current state: show each element whose conditions hold, hide the rest.
  useLayoutEffect(() => {
    const root = art.current;
    if (!root) return;
    root.querySelectorAll<SVGElement>("[data-when]").forEach((node) => {
      node.style.display = visible(parseWhen(node.getAttribute("data-when")), choices) ? "" : "none";
    });
  }, [markup, choices]);

  if (load.state === "loading") return <p className="coach-muted">Loading the picture…</p>;
  if (load.state === "failed" || !markup) {
    return (
      <p className="coach-muted" data-testid="coach-figure-error">
        {FIGURE_LOAD_ERROR}
      </p>
    );
  }

  const { data } = load;
  return (
    <figure className="coach-figure" data-testid="coach-figure" data-figure={id}>
      <p className="coach-figure__title">{data.title}</p>
      <div className="coach-figure__art" role="img" aria-label={data.alt} ref={art} />
      <p className="coach-sr-only" aria-live="polite" data-testid="coach-figure-result">
        {result}
      </p>
      {data.controls.map((control) => (
        <div key={control.name} className="coach-figure__choices" role="group" aria-label={control.label}>
          {/* Named for screen readers; on screen the buttons speak for themselves (2026-11-06). */}
          <span className="coach-sr-only">{control.label}</span>
          {control.options.map((option) => {
            const on = choices[control.name] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="coach-button coach-figure__choice"
                aria-pressed={on}
                // A mouse click keeps the focus where it was (Go on); the keyboard can still tab here.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setChoices((now) => ({ ...now, [control.name]: option.value }))}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ))}
      {data.caption && <figcaption className="coach-figure__caption">{data.caption}</figcaption>}
    </figure>
  );
}
