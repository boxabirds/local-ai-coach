"use client";

import { createContext, useContext } from "react";

/**
 * The first message: the start box (the empty chat's centred input) becomes the message box at the
 * bottom. CopilotKit draws them as two different inputs, so on its own the box jumps. Instead, the
 * start box's place is noted as the first message goes, and the new box starts there and glides
 * down (a transform on the box alone, so nothing else on the page moves or scrolls).
 *
 * The browser's view transitions were tried first and dropped: while one ran, a new card's
 * smooth scroll into view was lost.
 */

/** Whether the chat is still on its start screen. */
export const ChatStartContext = createContext<{ welcome: boolean }>({ welcome: false });
export const useChatStart = () => useContext(ChatStartContext);

export const BOX_SELECTOR = '[data-testid="copilot-chat-input"]';
export const GLIDE_MS = 380;
/** A noted start box older than this is stale (the message never left); no glide. */
const FRESH_MS = 2000;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

let noted: { rect: DOMRect; at: number } | null = null;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(REDUCED_MOTION).matches);
}

/** Note where the start box is, then send the first message. */
export function glideToChat(update: () => void, doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  const box = doc?.querySelector(BOX_SELECTOR);
  noted = box ? { rect: box.getBoundingClientRect(), at: Date.now() } : null;
  update();
}

/** The noted start box, once: a later message box never glides. */
export function takeStartBox(now = Date.now()): DOMRect | null {
  const found = noted && now - noted.at <= FRESH_MS ? noted.rect : null;
  noted = null;
  return found;
}

/** Start `box` where the start box was and glide it to its own place. Returns whether it glided. */
export function glideFrom(box: HTMLElement, from: DOMRect | null): boolean {
  if (!from || reducedMotion()) return false;
  const to = box.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (!dx && !dy) return false;
  box.style.transition = "none";
  box.style.transform = `translate(${dx}px, ${dy}px)`;
  void box.offsetHeight; // draw the start position before the glide begins
  box.style.transition = `transform ${GLIDE_MS}ms ${EASE}`;
  box.style.transform = "";
  const tidy = () => {
    box.style.transition = "";
  };
  box.addEventListener("transitionend", tidy, { once: true });
  setTimeout(tidy, GLIDE_MS * 2);
  return true;
}
