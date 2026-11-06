import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { bringIntoView, keepInView } from "../card";

/**
 * A card whose figure loads after it arrived grew under the message box (Julian, 2026-11-06):
 * a growing card is brought back into view, until the learner scrolls for themselves.
 */

let observed: (() => void) | null = null;
const stops: (() => void)[] = [];
/** keepInView, stopped after the test so its window listeners never reach the next one. */
const watch = (el: HTMLElement) => {
  const stop = keepInView(el);
  stops.push(stop);
  return stop;
};
const disconnect = vi.fn();

beforeEach(() => {
  observed = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observed = callback;
      }
      observe() {}
      disconnect() {
        observed = null; // like the browser: no more callbacks
        disconnect();
      }
    },
  );
});

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  cleanup();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});

function card(): { el: HTMLElement; grow: (height: number) => void; scroll: ReturnType<typeof vi.fn> } {
  const { container } = render(<div className="coach-card" data-testid="card" />);
  const el = container.querySelector<HTMLElement>(".coach-card")!;
  let height = 100;
  el.getBoundingClientRect = () => ({ height, top: 0, bottom: height, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const scroll = vi.fn();
  el.scrollIntoView = scroll;
  return { el, grow: (next) => { height = next; observed?.(); }, scroll };
}

describe("keepInView", () => {
  it("brings the card back into view each time it grows", () => {
    const { el, grow, scroll } = card();
    watch(el);
    grow(300);
    grow(500);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("does nothing when the card shrinks or stays the same", () => {
    const { el, grow, scroll } = card();
    watch(el);
    grow(100);
    grow(50);
    expect(scroll).not.toHaveBeenCalled();
  });

  it.each(["wheel", "touchmove", "keydown"])("stops once the learner scrolls for themselves (%s)", (event) => {
    const { el, grow, scroll } = card();
    watch(el);
    fireEvent(window, new Event(event));
    expect(disconnect).toHaveBeenCalledOnce();
    grow(400);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("stops when the card stops waiting", () => {
    const { el } = card();
    const stop = watch(el);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("never moves an older card once a newer one has arrived", () => {
    const { el, grow, scroll } = card();
    watch(el);
    const newer = document.createElement("div");
    newer.className = "coach-card";
    document.body.append(newer);
    grow(400);
    expect(scroll).not.toHaveBeenCalled();
    newer.remove();
  });
});

describe("bringIntoView", () => {
  function inScroller(cardHeight: number, room: number) {
    const scroller = document.createElement("div");
    scroller.className = "reader-scroll-view";
    Object.defineProperty(scroller, "clientHeight", { value: room });
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ height: cardHeight }) as DOMRect;
    el.scrollIntoView = vi.fn();
    scroller.append(el);
    document.body.append(scroller);
    return { el, done: () => scroller.remove() };
  }

  it("shows a card that fits whole", () => {
    const { el, done } = inScroller(400, 678);
    bringIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    done();
  });

  it("aligns a card taller than the chat by its bottom, where the controls are", () => {
    const { el, done } = inScroller(682, 678);
    bringIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "end", behavior: "smooth" });
    done();
  });

  it("keeps a card that asks for its start at its start (the story)", () => {
    const { el, done } = inScroller(2000, 678);
    bringIntoView(el, "start");
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    done();
  });
});

