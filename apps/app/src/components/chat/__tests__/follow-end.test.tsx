import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { useRef, type ReactNode } from "react";
import { END_THRESHOLD_PX, answers, atEnd, learnerActed } from "../follow-end";
import { FollowEnd, type FollowAgent } from "../follow-end-view";

/**
 * Story 28: one scroll owner for the chat. It follows the end while the learner is at the end,
 * leaves them alone once they scroll up to reread, and follows again when they act. jsdom has no
 * layout, so the scroller's sizes and the ResizeObserver are scripted (a 678 px chat).
 */

const VISIBLE = 678;

describe("atEnd (TC-01)", () => {
  const at = (distance: number) => atEnd({ scrollHeight: 2000, clientHeight: VISIBLE, scrollTop: 2000 - VISIBLE - distance });
  it("counts the end, and a short way above it, as the end", () => {
    expect(at(0)).toBe(true);
    expect(at(END_THRESHOLD_PX)).toBe(true);
    expect(at(END_THRESHOLD_PX + 1)).toBe(false);
  });
});

describe("learnerActed (TC-08 to TC-10)", () => {
  function scene() {
    document.body.innerHTML = `
      <div id="root"><p id="text">words</p><button id="button">I did it</button><textarea id="box"></textarea><input id="field" /></div>
      <button id="outside">Good</button>`;
    const get = (id: string) => document.getElementById(id)!;
    return { root: get("root"), get };
  }
  const click = (target: Element) => {
    const event = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(event, "target", { value: target });
    return event;
  };
  const key = (target: Element, k: string) => {
    const event = new KeyboardEvent("keydown", { key: k, bubbles: true });
    Object.defineProperty(event, "target", { value: target });
    return event;
  };

  it("TC-08 a button pressed in the chat is acting", () => {
    const { root, get } = scene();
    expect(learnerActed(click(get("button")), root)).toBe(true);
  });

  it("TC-09 a click on words, a click outside, a key in a text field, other keys are not", () => {
    const { root, get } = scene();
    expect(learnerActed(click(get("text")), root)).toBe(false);
    expect(learnerActed(click(get("outside")), root)).toBe(false);
    expect(learnerActed(key(get("box"), " "), root)).toBe(false);
    expect(learnerActed(key(get("field"), "Enter"), root)).toBe(false);
    expect(learnerActed(key(document.body, "a"), root)).toBe(false);
    expect(learnerActed(key(document.body, "ArrowDown"), root)).toBe(false);
  });

  it("TC-10 Space or Enter outside a text field is acting (the story's Space, a focused card button)", () => {
    const { root, get } = scene();
    expect(learnerActed(key(document.body, " "), root)).toBe(true);
    expect(learnerActed(key(get("button"), "Enter"), root)).toBe(true);
  });
});

describe("answers", () => {
  it("counts the learner's messages and card answers only", () => {
    expect(answers([{ role: "user" }, { role: "assistant" }, { role: "tool" }, { role: "system" }, {}])).toBe(2);
    expect(answers([])).toBe(0);
  });
});

// ---------------------------------------------------------------- FollowEnd, mounted

let observerCallback: (() => void) | null = null;
const observed: Element[] = [];

beforeEach(() => {
  observerCallback = null;
  observed.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observerCallback = callback;
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {
        observerCallback = null;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** A fake agent: messages, and the onMessagesChanged subscriber the page would get. */
function fakeAgent(): FollowAgent & { say: (role: string) => void } {
  const subscribers: { onMessagesChanged?: () => void }[] = [];
  const agent = {
    messages: [] as { role: string }[],
    subscribe(subscriber: { onMessagesChanged?: () => void }) {
      subscribers.push(subscriber);
      return { unsubscribe: () => subscribers.splice(subscribers.indexOf(subscriber), 1) };
    },
    say(role: string) {
      agent.messages = [...agent.messages, { role }];
      subscribers.forEach((s) => s.onMessagesChanged?.());
    },
  };
  return agent;
}

/** A chat whose scroller has a scripted height; grow() adds content and fires the observer. */
function Chat({ agent, withScroller = true, children }: { agent: FollowAgent; withScroller?: boolean; children?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} data-testid="root">
      {withScroller && (
        <div className="reader-scroll-view" data-testid="scroller">
          <div data-testid="content">
            <button type="button">I did it</button>
          </div>
        </div>
      )}
      {children}
      <FollowEnd root={root} agent={agent} />
    </div>
  );
}

function scripted(scroller: HTMLElement, height = 1000) {
  let scrollHeight = height;
  let visible = VISIBLE;
  Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => visible });
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => scrollHeight });
  scroller.scrollTop = 0;
  return {
    grow(by: number) {
      scrollHeight += by;
      act(() => observerCallback?.());
    },
    /** Content grows but the observer hasn't reported it yet. */
    growQuietly(by: number) {
      scrollHeight += by;
    },
    /** The visible chat gets shorter (the window is resized) and the observer reports it. */
    shrinkWindow(by: number) {
      visible -= by;
      act(() => observerCallback?.());
    },
    /** The learner scrolls to a place and the browser says so. */
    scrollTo(top: number) {
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    },
    end: () => scrollHeight - visible,
  };
}

function mount(agent = fakeAgent()) {
  const view = render(<Chat agent={agent} />);
  const scroller = view.getByTestId("scroller");
  return { ...view, agent, scroller, chat: scripted(scroller) };
}

describe("FollowEnd", () => {
  it("watches the chat's content", () => {
    const { getByTestId } = mount();
    expect(observed).toContain(getByTestId("content"));
  });

  it("TC-02 while following, new content brings the chat to its end", () => {
    const { scroller, chat } = mount();
    chat.grow(400);
    expect(scroller.scrollTop).toBe(chat.end());
    chat.grow(100);
    expect(scroller.scrollTop).toBe(chat.end());
  });

  it("TC-03 once the learner has scrolled up to reread, new content leaves them where they are", () => {
    const { scroller, chat } = mount();
    chat.grow(400);
    chat.scrollTo(100);
    chat.grow(300);
    expect(scroller.scrollTop).toBe(100);
  });

  it("TC-04 scrolling back to the end follows again", () => {
    const { scroller, chat } = mount();
    chat.grow(400);
    chat.scrollTo(100);
    chat.scrollTo(chat.end() - END_THRESHOLD_PX);
    chat.grow(200);
    expect(scroller.scrollTop).toBe(chat.end());
  });

  it("TC-02b more words arriving before the browser reports our own scroll don't count as the learner leaving", () => {
    const { scroller, chat } = mount();
    chat.grow(400); // FollowEnd moves to the end...
    chat.growQuietly(300); // ...more words arrive before the browser reports that scroll
    fireEvent.scroll(scroller); // now it reports it: not at the new end, but nobody scrolled up
    chat.grow(100);
    expect(scroller.scrollTop).toBe(chat.end());
  });

  it("TC-02d content shrinking (an answered card folds up) clamps the chat but keeps following", () => {
    const { scroller, chat } = mount();
    chat.grow(800);
    chat.growQuietly(-300); // the browser clamps the position to the new end and reports a scroll
    scroller.scrollTop = chat.end();
    fireEvent.scroll(scroller);
    chat.grow(200);
    expect(scroller.scrollTop).toBe(chat.end());
  });

  it("TC-02c the window getting shorter keeps the end in view", () => {
    const { scroller, chat } = mount();
    chat.grow(400);
    expect(observed).toContain(scroller);
    chat.shrinkWindow(160);
    expect(scroller.scrollTop).toBe(chat.end());
  });

  it("TC-05 a scroller that appears after the first message is followed", async () => {
    const agent = fakeAgent();
    const view = render(<Chat agent={agent} withScroller={false} />);
    const late = document.createElement("div");
    late.className = "reader-scroll-view";
    const content = document.createElement("div");
    late.append(content);
    await act(async () => {
      view.getByTestId("root").prepend(late);
    });
    const chat = scripted(late);
    chat.grow(500);
    expect(late.scrollTop).toBe(chat.end());
  });

  it("TC-05b a scroller the chat replaces with a new one (restore, New chat) is followed", async () => {
    const { getByTestId, scroller } = mount();
    const root = getByTestId("root");
    const fresh = document.createElement("div");
    fresh.className = "reader-scroll-view";
    fresh.append(document.createElement("div"));
    await act(async () => {
      scroller.replaceWith(fresh);
    });
    const chat = scripted(fresh);
    chat.grow(500);
    expect(fresh.scrollTop).toBe(chat.end());
    expect(root.contains(fresh)).toBe(true);
  });

  it("TC-06 without ResizeObserver it mounts and unmounts without throwing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    expect(() => mount().unmount()).not.toThrow();
  });

  it("TC-07 once unmounted, nothing moves the chat", () => {
    const { scroller, chat, unmount, agent } = mount();
    const grow = chat.grow;
    unmount();
    document.body.append(scroller);
    grow(400);
    agent.say("user");
    expect(scroller.scrollTop).toBe(0);
  });

  it("TC-11 reading, then the learner sends or answers something: follows again", () => {
    for (const role of ["user", "tool"]) {
      const { scroller, chat, agent, unmount } = mount();
      chat.grow(400);
      chat.scrollTo(50);
      act(() => agent.say(role));
      expect(scroller.scrollTop).toBe(chat.end());
      chat.grow(100);
      expect(scroller.scrollTop).toBe(chat.end());
      unmount();
      document.body.innerHTML = "";
    }
  });

  it("TC-12 reading, then only the coach adds something: stays put", () => {
    const { scroller, chat, agent } = mount();
    chat.grow(400);
    chat.scrollTo(50);
    act(() => agent.say("assistant"));
    chat.grow(100);
    expect(scroller.scrollTop).toBe(50);
  });

  it("reading, then a button pressed in the chat: follows again", () => {
    const { scroller, chat, getByRole } = mount();
    chat.grow(400);
    chat.scrollTo(50);
    fireEvent.click(getByRole("button", { name: "I did it" }));
    expect(scroller.scrollTop).toBe(chat.end());
  });
});

// ---------------------------------------------------------------- one owner (TC-13)

const APP_SRC = resolve(__dirname, "../../..");
const OWNER = "components/chat/follow-end-view.tsx";
const SKIP = ["__tests__", "generative-ui", "node_modules"];
const SCROLLS = /\.scrollIntoView\s*\(|\.scrollIntoView\?\.\(|\.scrollTop\s*=(?!=)|\.scrollTo\s*\(|\.scrollBy\s*\(/;

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (SKIP.some((skip) => path.includes(skip))) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("one scroll owner (TC-13)", () => {
  it("nothing in the app moves the chat except FollowEnd", () => {
    const movers = sources(APP_SRC)
      .filter((path) => SCROLLS.test(readFileSync(path, "utf8")))
      .map((path) => relative(APP_SRC, path));
    expect(movers).toEqual([OWNER]);
  });
});
