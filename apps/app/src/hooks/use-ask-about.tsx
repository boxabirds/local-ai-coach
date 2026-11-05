"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { QUOTABLE, QUOTABLE_ATTR, SELECTED_ATTR, quotable, quoteText } from "@/components/chat/ask-about";

/**
 * Click (or Enter on) a coach bubble to select it; an Ask about this button
 * appears at its top right and hands the bubble's words to onAsk. Clicking it
 * again, Escape, or a click anywhere else clears the selection. Controls inside
 * a bubble keep their own job, and Space never selects (Ceetrix story 8).
 */
export function useAskAbout(root: RefObject<HTMLElement | null>, onAsk: (text: string) => void) {
  const [selected, setSelected] = useState<Element | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  const select = useCallback((el: Element | null) => {
    setSelected((current) => {
      current?.removeAttribute(SELECTED_ATTR);
      el?.setAttribute(SELECTED_ATTR, "true");
      return el;
    });
  }, []);

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
      if (event.key === "Escape") return select(null);
      if (event.key !== "Enter" || !(event.target instanceof Element) || !event.target.hasAttribute(QUOTABLE_ATTR)) return;
      const el = quotable(event.target, host);
      if (el) {
        event.preventDefault();
        select(el === selected ? null : el);
      }
    };
    const onOutside = (event: MouseEvent) => {
      // The button lives outside the chat (a portal), so pressing it is not "outside".
      if (event.target instanceof Element && event.target.closest("[data-ask-button]")) return;
      if (event.target instanceof Node && !host.contains(event.target)) select(null);
    };
    host.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      host.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [root, select, selected]);

  // Keep the button at the bubble's top right as the chat scrolls or reflows.
  useEffect(() => {
    if (!selected) return;
    const place = () => setBox(selected.isConnected ? selected.getBoundingClientRect() : null);
    const first = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [selected]);

  const ask = () => {
    if (!selected) return;
    const text = quoteText(selected);
    select(null);
    if (text) onAsk(text);
  };

  const button =
    selected && box && typeof document !== "undefined"
      ? createPortal(
          <button
            type="button"
            className="coach-ask-button"
            data-ask-button
            data-testid="coach-ask-button"
            style={{ top: Math.max(box.top - 14, 4), left: Math.max(box.right - 120, 4) }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={ask}
          >
            Ask about this
          </button>,
          document.body,
        )
      : null;

  return { selected, button, clear: () => select(null) };
}
