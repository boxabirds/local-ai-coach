"use client";

import { useState, useRef } from "react";
import { CoachCard } from "./card";

export type Evidence = { probe: string; cmd: string; matched: string[] };

export type CheckResultProps = {
  stationId?: string;
  stepId?: string;
  passed?: boolean;
  /** False when nothing was looked at (no permission, or the command could not run). */
  checked?: boolean;
  evidence?: Evidence[];
  note?: string;
};

export function CheckResult({ stepId, passed, checked = true, evidence = [], note }: CheckResultProps) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  return (
    <CoachCard label="Check" testId="coach-check" tone={!checked ? "plain" : passed ? "pass" : "notyet"} cardRef={cardRef}>
      <p className="coach-check__verdict" data-step-id={stepId}>
        {!checked ? "Not checked" : passed ? "Passed" : "Not yet"}
      </p>
      {note && <p className="coach-check__note">{note}</p>}
      {evidence.length > 0 && (
        <>
          <button type="button" className="coach-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide what I looked at" : "Show me what you looked at"}
          </button>
          {open && (
            <ul className="coach-evidence" data-testid="coach-evidence">
              {evidence.map((item, i) => (
                <li key={`${item.probe}-${i}`}>
                  <p className="coach-muted">I ran:</p>
                  <pre className="coach-pre">
                    <code>{item.cmd}</code>
                  </pre>
                  <p className="coach-muted">and kept these lines:</p>
                  <pre className="coach-pre">
                    <code>{item.matched.join("\n")}</code>
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </CoachCard>
  );
}
