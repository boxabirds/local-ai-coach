"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { QUOTABLE, QUOTABLE_ATTR, SELECTED_ATTR, quotable, quoteText } from "@/components/chat/ask-about";

/**
 * The palette on a coach item (Ceetrix stories 8 and 26). Pointing at a coach bubble, or
 * clicking (or Enter on) it, shows a small palette at its top right: Ask about this hands the
 * bubble's words to onAsk; Good and Not good rate the coach's turn the bubble belongs to (only
 * when onRate is given and the bubble sits in a message with an id). Not good opens one optional
 * line for what was wrong. Nothing else in the chat carries thumbs.
 *
 * A click keeps the palette (the selection) until Escape, a click elsewhere or a second click;
 * pointing shows it while the pointer is on the bubble or the palette, and it goes a moment
 * after the pointer leaves both. Controls inside a bubble keep their own job, and Space never
 * selects.
 */

export type Rating = "up" | "down";
export type RateRequest = { messageId: string; rating: Rating; reason?: string; item: { kind: string; text: string } };
export type RateResult = { ok: true } | { ok: false; error: string };

/** How long the palette stays after the pointer leaves the bubble and the palette. */
export const HOVER_HIDE_MS = 300;
const PALETTE_GAP_PX = 14;
const EDGE_PX = 4;
const MESSAGE_ID = "[data-message-id]";
const CAN_HOVER = "(hover: hover)";
export const SAVED = "Saved";

/** The coach's turn an item belongs to: CopilotChat marks each assistant message with its id. */
export function messageIdOf(el: Element | null): string | null {
  return el?.closest(MESSAGE_ID)?.getAttribute("data-message-id") || null;
}

/** What kind of thing was rated, for the record. */
export function kindOf(el: Element): string {
  if (el.matches(".coach-figure")) return "figure";
  if (el.matches(".coach-fact, [data-testid='coach-fact']")) return "fact";
  if (el.matches(".coach-step__text")) return "step";
  if (el.matches(".coach-bubble")) return "story";
  return "reply";
}

function canHover(): boolean {
  // jsdom and old browsers have no matchMedia: treat the pointer as one that can hover.
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia(CAN_HOVER).matches;
}

export function useAskAbout(
  root: RefObject<HTMLElement | null>,
  onAsk: (text: string) => void,
  onRate?: (request: RateRequest) => Promise<RateResult>,
) {
  const [selected, setSelected] = useState<Element | null>(null);
  const [hovered, setHovered] = useState<Element | null>(null);
  // Each piece of palette state belongs to the item it was made for, so a different item
  // starts with a clean palette without resetting anything.
  const [placed, setPlaced] = useState<{ el: Element; rect: DOMRect } | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [reasonFor, setReasonFor] = useState<Element | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ el: Element; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = selected ?? hovered;
  const box = placed && placed.el === target ? placed.rect : null;
  const reasonOpen = reasonFor !== null && reasonFor === target;
  const shownStatus = status && status.el === target ? status.text : null;
  // While a reason is being typed or a rating is saving, pointing away doesn't close the palette.
  const pinnedRef = useRef(false);
  useEffect(() => {
    pinnedRef.current = reasonOpen || saving;
  }, [reasonOpen, saving]);

  const select = useCallback((el: Element | null) => {
    setSelected((current) => {
      current?.removeAttribute(SELECTED_ATTR);
      el?.setAttribute(SELECTED_ATTR, "true");
      return el;
    });
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const hideSoon = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      if (!pinnedRef.current) setHovered(null);
    }, HOVER_HIDE_MS);
  }, [cancelHide]);
  useEffect(() => cancelHide, [cancelHide]);

  // Coach bubbles become reachable with Tab, and marked so Enter selects rather than goes on.
  useEffect(() => {
    const host = root.current;
    if (!host || typeof MutationObserver === "undefined") return;
    const mark = () =>
      host.querySelectorAll(QUOTABLE).forEach((el) => {
        if (el.hasAttribute(QUOTABLE_ATTR) || el.closest('[data-testid="copilot-user-message"]')) return;
        el.setAttribute(QUOTABLE_ATTR, "true");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      });
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-ask-button]")) return;
      const el = quotable(event.target, host);
      select(el && el !== selected ? el : null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReasonFor(null);
        return select(null);
      }
      if (event.key !== "Enter" || !(event.target instanceof Element) || !event.target.hasAttribute(QUOTABLE_ATTR)) return;
      const el = quotable(event.target, host);
      if (el) {
        event.preventDefault();
        select(el === selected ? null : el);
      }
    };
    const onOutside = (event: MouseEvent) => {
      // The palette lives outside the chat (a portal), so pressing it is not "outside".
      if (event.target instanceof Element && event.target.closest("[data-ask-button]")) return;
      if (event.target instanceof Node && !host.contains(event.target)) select(null);
    };
    const onOver = (event: PointerEvent) => {
      if (!canHover() || !(event.target instanceof Element)) return;
      const el = quotable(event.target, host);
      if (el) {
        cancelHide();
        if (!pinnedRef.current) setHovered(el);
      }
    };
    const onOut = (event: PointerEvent) => {
      const to = event.relatedTarget;
      if (to instanceof Element && (to.closest("[data-ask-button]") || (hovered && hovered.contains(to)))) return;
      hideSoon();
    };
    host.addEventListener("click", onClick);
    host.addEventListener("pointerover", onOver);
    host.addEventListener("pointerout", onOut);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("pointerover", onOver);
      host.removeEventListener("pointerout", onOut);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [root, select, selected, hovered, cancelHide, hideSoon]);

  // Keep the palette at the item's top right as the chat scrolls or reflows.
  useEffect(() => {
    if (!target) return;
    const place = () => setPlaced(target.isConnected ? { el: target, rect: target.getBoundingClientRect() } : null);
    const first = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [target]);

  const close = () => {
    select(null);
    setHovered(null);
  };

  const ask = () => {
    if (!target) return;
    const text = quoteText(target);
    close();
    if (text) onAsk(text);
  };

  const messageId = onRate ? messageIdOf(target) : null;
  const current = messageId ? ratings[messageId] : undefined;

  const rate = async (rating: Rating, why?: string) => {
    if (!onRate || !messageId || !target || saving) return;
    const el = target;
    setSaving(true);
    setStatus(null);
    const result = await onRate({ messageId, rating, reason: why?.trim() || undefined, item: { kind: kindOf(target), text: quoteText(target) } }).catch(
      (): RateResult => ({ ok: false, error: "I couldn't save that rating." }),
    );
    setSaving(false);
    if (result.ok) {
      setRatings((all) => ({ ...all, [messageId]: rating }));
      setReasonFor(null);
      setReason("");
      setStatus({ el, text: SAVED });
    } else {
      setStatus({ el, text: result.error });
    }
  };

  const up = () => {
    setReasonFor(null);
    if (current !== "up") void rate("up");
  };
  const down = () => {
    setStatus(null);
    if (reasonFor !== target) setReason("");
    setReasonFor(target);
  };
  const submitReason = (event: FormEvent) => {
    event.preventDefault();
    void rate("down", reason);
  };

  const palette =
    target && box && typeof document !== "undefined"
      ? createPortal(
          <div
            className="coach-palette"
            data-ask-button
            data-testid="coach-palette"
            style={{ top: Math.max(box.top - PALETTE_GAP_PX, EDGE_PX), left: Math.max(box.right, EDGE_PX) }}
            onPointerEnter={cancelHide}
            onPointerLeave={() => hideSoon()}
          >
            <div className="coach-palette__row">
              <button
                type="button"
                className="coach-ask-button"
                data-testid="coach-ask-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={ask}
              >
                Ask about this
              </button>
              {messageId && (
                <>
                  <button
                    type="button"
                    className="coach-rate"
                    data-testid="coach-rate-up"
                    aria-label="Good"
                    title="Good"
                    aria-pressed={current === "up"}
                    disabled={saving}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={up}
                  >
                    <span aria-hidden="true">👍</span>
                  </button>
                  <button
                    type="button"
                    className="coach-rate"
                    data-testid="coach-rate-down"
                    aria-label="Not good"
                    title="Not good"
                    aria-pressed={current === "down"}
                    aria-expanded={reasonOpen}
                    disabled={saving}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={down}
                  >
                    <span aria-hidden="true">👎</span>
                  </button>
                </>
              )}
            </div>
            {messageId && reasonOpen && (
              <form className="coach-palette__reason" onSubmit={submitReason}>
                <input
                  type="text"
                  autoFocus
                  aria-label="What was wrong?"
                  placeholder="What was wrong? (optional)"
                  data-testid="coach-rate-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setReasonFor(null);
                    }
                  }}
                />
                <button type="submit" className="coach-rate-save" disabled={saving}>
                  Save
                </button>
                <button type="button" className="coach-link" disabled={saving} onClick={() => void rate("down")}>
                  Skip
                </button>
              </form>
            )}
            {shownStatus && (
              <p className="coach-palette__status" role="status" data-testid="coach-rate-status">
                {shownStatus}
              </p>
            )}
          </div>,
          document.body,
        )
      : null;

  return { selected, hovered, button: palette, clear: close };
}
