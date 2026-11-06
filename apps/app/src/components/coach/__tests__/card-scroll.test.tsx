import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { bringIntoView, keepInView, outOfView } from "../card";

/**
 * Story 27: the card waiting for the learner is held in view while the chat settles. The coach's
 * words above it arrive in half-second chunks after it has scrolled into view and pushed it under
 * the message box. jsdom has no layout, so boxes and the ResizeObserver are scripted, sized like
 * the measured cards (a 678 px chat, 24 px of clearance above the message box).
 */

const CHAT = { top: 92, height: 678 };
const CLEARANCE = 24;

let fire: (() => void) | null = null;
const observedTargets: Element[] = [];
const disconnect = vi.fn();
const stops: (() => void)[] = [];

beforeEach(() => {
  fire = null;
  observedTargets.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        fire = callback;
      }
      observe(target: Element) {
        observedTargets.push(target);
      }
      disconnect() {
        fire = null; // like the browser: no more callbacks
        disconnect();
      }
    },
  );
});

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  document.body.innerHTML = "";
  cleanup();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});

const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, height, left: 0, right: 600, width: 600, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** A chat with content above and one waiting card; move or resize the card to script layout. */
function chat(cardTop: number, cardHeight = 200) {
  const scroller = document.createElement("div");
  scroller.className = "reader-scroll-view";
  scroller.style.setProperty("scroll-padding-bottom", `${CLEARANCE}px`);
  Object.defineProperty(scroller, "clientHeight", { value: CHAT.height });
  scroller.getBoundingClientRect = () => rect(CHAT.top, CHAT.height);
  const content = document.createElement("div");
  const card = document.createElement("div");
  card.className = "coach-card";
  let box = rect(cardTop, cardHeight);
  card.getBoundingClientRect = () => box;
  const scroll = vi.fn();
  card.scrollIntoView = scroll;
  content.append(card);
  scroller.append(content);
  document.body.append(scroller);
  const hold = () => {
    const stop = keepInView(card);
    stops.push(stop);
    return stop;
  };
  /** Layout changes: the card ends up at a new place or size, and the observer fires. */
  const layout = (top: number, height = box.height) => {
    box = rect(top, height);
    fire?.();
  };
  return { scroller, content, card, scroll, hold, layout };
}

const LIMIT = CHAT.top + CHAT.height - CLEARANCE; // the lowest a card's bottom may be

describe("outOfView", () => {
  it("TC-07 a bottom exactly at the limit is in view; one pixel lower is out", () => {
    const { card, layout } = chat(LIMIT - 200);
    expect(outOfView(card)).toBe(false);
    layout(LIMIT - 200 + 1);
    expect(outOfView(card)).toBe(true);
  });

  it("a card that fits but sits above the top is out; a too-tall card only counts its bottom", () => {
    const { card, layout } = chat(CHAT.top - 10);
    expect(outOfView(card)).toBe(true);
    layout(CHAT.top - 300, CHAT.height + 100); // too tall, bottom above the limit
    expect(outOfView(card)).toBe(false);
  });
});

describe("keepInView", () => {
  it("watches the card and everything in the chat", () => {
    const { card, content, hold } = chat(300);
    hold();
    expect(observedTargets).toContain(card);
    expect(observedTargets).toContain(content);
  });

  it("TC-05 text above grows and pushes the card under the box: it is brought back", () => {
    const { scroll, hold, layout } = chat(400);
    hold();
    layout(700); // the reply above grew by 300 px
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("TC-06 the chat changes but the card stays in view: nothing moves", () => {
    const { scroll, hold, layout } = chat(200);
    hold();
    layout(260);
    layout(260, 260);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("TC-08 a card grown taller than the chat is aligned by its end", () => {
    const { scroll, hold, layout } = chat(200);
    hold();
    layout(200, CHAT.height + 4); // the measured 682 px card in a 678 px chat
    expect(scroll).toHaveBeenCalledWith({ block: "end", behavior: "smooth" });
  });

  it.each(["wheel", "touchmove", "keydown"])("TC-09 the learner scrolling for themselves (%s) releases the hold", (event) => {
    const { scroll, hold, layout } = chat(400);
    hold();
    fireEvent(window, new Event(event));
    expect(disconnect).toHaveBeenCalledOnce();
    layout(900);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("TC-10 once a newer card has arrived, the older one is never moved", () => {
    const { content, scroll, hold, layout } = chat(400);
    hold();
    const newer = document.createElement("div");
    newer.className = "coach-card";
    content.append(newer);
    layout(900);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("TC-11 stopping disconnects and removes the listeners", () => {
    const { scroll, hold, layout } = chat(400);
    const stop = hold();
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    fireEvent(window, new Event("keydown")); // no second disconnect from a stale listener
    expect(disconnect).toHaveBeenCalledOnce();
    layout(900);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("TC-12 without ResizeObserver it does nothing and doesn't throw", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { card } = chat(400);
    expect(() => keepInView(card)()).not.toThrow();
  });

  it("a card no longer on the page is left alone", () => {
    const { scroller, scroll, hold, layout } = chat(400);
    hold();
    scroller.remove();
    layout(900);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("bringIntoView", () => {
  it("shows a card that fits whole", () => {
    const { card, scroll } = chat(900, 400);
    bringIntoView(card);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("aligns a card taller than the chat by its bottom, where the controls are", () => {
    const { card, scroll } = chat(900, CHAT.height + 4);
    bringIntoView(card);
    expect(scroll).toHaveBeenCalledWith({ block: "end", behavior: "smooth" });
  });

  it("keeps a card that asks for its start at its start (the story)", () => {
    const { card, scroll } = chat(900, 2000);
    bringIntoView(card, "start");
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });
});
