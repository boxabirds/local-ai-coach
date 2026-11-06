"use client";

import { useEffect, useRef, useState } from "react";

/** How often a growing answer is redrawn (Ceetrix story 24). */
export const STEP_MS = 500;

/**
 * The text to show for a growing answer: the first text at once, then the newest text at most
 * once a step. A change inside a step is shown when the step ends, so nothing received waits
 * longer than one step. Text that doesn't extend what is shown (a new answer) shows at once.
 */
export function useThrottledText(text: string, stepMs = STEP_MS): string {
  const [shown, setShown] = useState(text);
  const latest = useRef(text);
  const lastStep = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lastStep.current = Date.now();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = text;
    if (text === shown || timer.current) return;
    const grows = text.startsWith(shown);
    const wait = grows ? Math.max(0, lastStep.current + stepMs - Date.now()) : 0;
    timer.current = setTimeout(() => {
      timer.current = null;
      lastStep.current = Date.now();
      setShown(latest.current);
    }, wait);
  }, [text, shown, stepMs]);

  return text.startsWith(shown) ? shown : text;
}
