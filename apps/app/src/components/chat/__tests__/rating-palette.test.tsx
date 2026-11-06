import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import { HOVER_HIDE_MS, HOVER_SHOW_MS, SAVED, useAskAbout, type RateRequest, type RateResult } from "@/hooks/use-ask-about";
import { ratingBody, sendRating } from "../rating";

/**
 * Story 26: the palette on a coach item, with Good and Not good (TC-01 to TC-12). CopilotChat's
 * message markup (data-testid, data-message-id) is copied from its rendered output; the words are
 * made up.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let renders = 0;

function Thread({ onAsk, onRate }: { onAsk: (text: string) => void; onRate?: (r: RateRequest) => Promise<RateResult> }) {
  renders += 1;
  const root = useRef<HTMLDivElement>(null);
  const { button } = useAskAbout(root, onAsk, onRate);
  return (
    <>
      <div ref={root} data-testid="root">
        <div data-testid="copilot-user-message">
          <p data-testid="mine">My own question</p>
        </div>
        <div data-testid="copilot-assistant-message" data-message-id="a1">
          <div className="answer-markdown">
            <p data-testid="reply">A made-up answer from the coach.</p>
          </div>
          <div className="coach-card">
            <p className="coach-step__text" data-testid="step">Do the made-up thing.</p>
          </div>
        </div>
        <div className="coach-bubble" data-testid="loose">
          <p>A bubble with no message around it.</p>
        </div>
        <p data-testid="gap">space</p>
      </div>
      <p data-testid="outside">elsewhere</p>
      {button}
    </>
  );
}

const ok = (): Promise<RateResult> => Promise.resolve({ ok: true });

function setup(onRate: (r: RateRequest) => Promise<RateResult> = vi.fn(ok)) {
  const onAsk = vi.fn();
  render(<Thread onAsk={onAsk} onRate={onRate} />);
  return { onAsk, onRate };
}

const point = (testId: string) => fireEvent.pointerOver(screen.getByTestId(testId));
// Only the timers the delay uses are faked, so the palette's placement (requestAnimationFrame) runs.
const TIMERS = { toFake: ["setTimeout", "clearTimeout"] } as const;
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
/** Rest the pointer on an item long enough for its palette. */
function rest(testId: string) {
  vi.useFakeTimers(TIMERS);
  point(testId);
  wait(HOVER_SHOW_MS);
  vi.useRealTimers();
}
const palette = () => screen.queryByTestId("coach-palette");

describe("the palette appears on pointing or selecting (story 26)", () => {
  it("TC-01 pointing at a coach reply shows Ask about this, Good and Not good", async () => {
    setup();
    expect(palette()).toBeNull();
    rest("reply");
    expect(await screen.findByTestId("coach-palette")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask about this" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Good" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not good" })).toBeInTheDocument();
  });

  it("TC-02 it goes a moment after the pointer leaves the item", async () => {
    setup();
    rest("reply");
    await screen.findByTestId("coach-palette");
    vi.useFakeTimers();
    fireEvent.pointerOut(screen.getByTestId("reply"), { relatedTarget: screen.getByTestId("outside") });
    expect(palette()).not.toBeNull();
    act(() => vi.advanceTimersByTime(HOVER_HIDE_MS + 1));
    expect(palette()).toBeNull();
  });

  it("TC-03 it stays while the pointer moves onto the palette", async () => {
    setup();
    rest("reply");
    const shown = await screen.findByTestId("coach-palette");
    vi.useFakeTimers();
    fireEvent.pointerOut(screen.getByTestId("reply"), { relatedTarget: shown });
    fireEvent.pointerEnter(shown);
    act(() => vi.advanceTimersByTime(HOVER_HIDE_MS * 3));
    expect(palette()).not.toBeNull();
  });

  it("TC-04 the learner's own message never shows it", () => {
    setup();
    rest("mine");
    expect(palette()).toBeNull();
  });

  it("TC-01b it waits until the pointer has rested on the item, then appears", async () => {
    setup();
    vi.useFakeTimers(TIMERS);
    point("reply");
    wait(HOVER_SHOW_MS - 1);
    // A frame passes, so a palette that was due would have been placed by now.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(palette()).toBeNull();
    wait(1);
    vi.useRealTimers();
    expect(await screen.findByTestId("coach-palette")).toBeInTheDocument();
  });

  it("TC-01c passing over an item on the way somewhere else shows nothing", () => {
    setup();
    vi.useFakeTimers(TIMERS);
    point("reply");
    wait(HOVER_SHOW_MS / 2);
    fireEvent.pointerOut(screen.getByTestId("reply"), { relatedTarget: screen.getByTestId("outside") });
    wait(HOVER_SHOW_MS * 2);
    expect(palette()).toBeNull();
  });

  it("TC-01d moving inside one item doesn't restart the wait; moving to another does", async () => {
    setup();
    vi.useFakeTimers(TIMERS);
    point("reply");
    wait(HOVER_SHOW_MS / 2);
    point("reply"); // another part of the same item
    wait(HOVER_SHOW_MS / 2);
    vi.useRealTimers();
    expect(await screen.findByRole("button", { name: "Good" })).toBeInTheDocument(); // the reply's, on time
    vi.useFakeTimers(TIMERS);
    fireEvent.pointerOut(screen.getByTestId("reply"), { relatedTarget: screen.getByTestId("loose") });
    point("loose");
    wait(HOVER_SHOW_MS - 1);
    expect(palette()).toBeNull(); // the reply's went; the next one waits its own full second
    wait(1);
    vi.useRealTimers();
    expect(await screen.findByRole("button", { name: "Ask about this" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Good" })).toBeNull(); // the loose bubble has no thumbs
  });

  it("TC-05 a click keeps it without pointing; Escape closes it", async () => {
    setup();
    fireEvent.click(screen.getByTestId("reply"));
    expect(await screen.findByTestId("coach-palette")).toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.pointerOut(screen.getByTestId("reply"), { relatedTarget: screen.getByTestId("outside") });
    act(() => vi.advanceTimersByTime(HOVER_HIDE_MS * 3));
    expect(palette()).not.toBeNull();
    vi.useRealTimers();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(palette()).toBeNull());
  });
});

describe("the palette follows its item", () => {
  it("TC-13 scrolling moves the palette without redrawing the page (a redraw cut a card's scroll short)", async () => {
    setup();
    const item = screen.getByTestId("reply").closest("[data-testid=\"copilot-assistant-message\"]") as HTMLElement; // the item the palette belongs to
    let top = 200;
    item.getBoundingClientRect = () => ({ top, right: 700, left: 100, bottom: top + 40, width: 600, height: 40, x: 100, y: top, toJSON: () => ({}) }) as DOMRect;
    rest("reply");
    const shown = await screen.findByTestId("coach-palette");
    const before = renders;
    for (const next of [150, 100, 50]) {
      top = next;
      fireEvent.scroll(window);
    }
    expect(renders).toBe(before);
    expect(shown.style.top).toBe(`${50 - 14}px`);
    expect(shown.style.left).toBe("700px");
  });
});

describe("rating from the palette", () => {
  it("TC-06 Good rates the turn once, then shows pressed and Saved", async () => {
    const { onRate } = setup();
    rest("reply");
    fireEvent.click(await screen.findByRole("button", { name: "Good" }));
    expect(await screen.findByTestId("coach-rate-status")).toHaveTextContent(SAVED);
    expect(onRate).toHaveBeenCalledExactlyOnceWith({
      messageId: "a1",
      rating: "up",
      reason: undefined,
      item: { kind: "reply", text: "A made-up answer from the coach." },
    });
    expect(screen.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(onRate).toHaveBeenCalledOnce(); // already rated Good: no second file
  });

  it("TC-07 Not good opens the reason line; Enter saves it with the reason", async () => {
    const { onRate } = setup();
    rest("step");
    fireEvent.click(await screen.findByRole("button", { name: "Not good" }));
    const why = screen.getByRole("textbox", { name: "What was wrong?" });
    expect(why).toHaveFocus();
    expect(onRate).not.toHaveBeenCalled();
    fireEvent.change(why, { target: { value: "  asked me twice " } });
    fireEvent.submit(why.closest("form")!);
    expect(await screen.findByTestId("coach-rate-status")).toHaveTextContent(SAVED);
    expect(onRate).toHaveBeenCalledExactlyOnceWith({ messageId: "a1", rating: "down", reason: "asked me twice", item: { kind: "step", text: "Do the made-up thing." } });
    expect(screen.getByRole("button", { name: "Not good" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("textbox", { name: "What was wrong?" })).toBeNull();
  });

  it("TC-08 Skip saves Not good without a reason", async () => {
    const { onRate } = setup();
    rest("reply");
    fireEvent.click(await screen.findByRole("button", { name: "Not good" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await screen.findByTestId("coach-rate-status");
    expect(onRate).toHaveBeenCalledOnce();
    expect((onRate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ rating: "down", reason: undefined });
  });

  it("TC-09 Escape in the reason line saves nothing", async () => {
    const { onRate } = setup();
    rest("reply");
    fireEvent.click(await screen.findByRole("button", { name: "Not good" }));
    const why = screen.getByRole("textbox", { name: "What was wrong?" });
    fireEvent.change(why, { target: { value: "never mind" } });
    fireEvent.keyDown(why, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "What was wrong?" })).toBeNull());
    expect(onRate).not.toHaveBeenCalled();
  });

  it("TC-10 a save that fails says so, isn't shown pressed, and keeps the reason", async () => {
    const onRate = vi.fn(() => Promise.resolve<RateResult>({ ok: false, error: "I couldn't save that rating." }));
    setup(onRate);
    rest("reply");
    fireEvent.click(await screen.findByRole("button", { name: "Not good" }));
    const why = screen.getByRole("textbox", { name: "What was wrong?" });
    fireEvent.change(why, { target: { value: "too long" } });
    fireEvent.submit(why.closest("form")!);
    expect(await screen.findByTestId("coach-rate-status")).toHaveTextContent("I couldn't save that rating.");
    expect(screen.getByRole("button", { name: "Not good" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("textbox", { name: "What was wrong?" })).toHaveValue("too long");
  });

  it("TC-10b a save that throws is a failure too", async () => {
    setup(vi.fn(() => Promise.reject(new Error("network"))));
    rest("reply");
    fireEvent.click(await screen.findByRole("button", { name: "Good" }));
    expect(await screen.findByTestId("coach-rate-status")).toHaveTextContent("I couldn't save that rating.");
    expect(screen.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "false");
  });

  it("TC-11 an item outside any coach message shows Ask about this, with no thumbs", async () => {
    setup();
    rest("loose");
    expect(await screen.findByRole("button", { name: "Ask about this" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Good" })).toBeNull();
  });

  it("TC-11b with no onRate there are never thumbs", async () => {
    render(<Thread onAsk={vi.fn()} />);
    rest("reply");
    expect(await screen.findByRole("button", { name: "Ask about this" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Not good" })).toBeNull();
  });

  it("TC-12 Ask about this still hands the words over from the palette", async () => {
    const { onAsk } = setup();
    rest("reply");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this" }));
    expect(onAsk).toHaveBeenCalledExactlyOnceWith("A made-up answer from the coach.");
    await waitFor(() => expect(palette()).toBeNull());
  });
});

describe("what the browser sends", () => {
  const request: RateRequest = { messageId: "a1", rating: "down", reason: "why", item: { kind: "reply", text: "x" } };
  const messages = [{ id: "a1", role: "assistant", content: "x" }];

  it("sends the thread, the rating and the browser's conversation", async () => {
    const post = vi.fn(async () => Response.json({ saved: "ratings/x.json" }));
    expect(await sendRating("t1", messages, request, post as unknown as typeof fetch)).toEqual({ ok: true });
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/coach-rating");
    expect(JSON.parse(String(init.body))).toEqual(ratingBody("t1", messages, request));
    expect(ratingBody("t1", messages, request)).toMatchObject({ thread_id: "t1", message_id: "a1", rating: "down", reason: "why", messages });
  });

  it("passes the coach's own error line on, or its own when there is none", async () => {
    const refused = vi.fn(async () => Response.json({ error: "Only the coach itself can save a rating." }, { status: 403 }));
    expect(await sendRating("t1", messages, request, refused as unknown as typeof fetch)).toEqual({ ok: false, error: "Only the coach itself can save a rating." });
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await sendRating("t1", messages, request, down as unknown as typeof fetch)).toEqual({ ok: false, error: "I couldn't save that rating." });
  });
});
