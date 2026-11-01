import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StoryCard, STORY_URL, clearStoryCache } from "../story";
import { StepCard } from "../step-card";
import { NumberCard, WHERE_TO_LOOK, detectPlatform } from "../number-card";
import { CheckResult } from "../check-result";
import { DEFAULT_STATIONS, TubeMap } from "../tube-map";
import { RunConfirm } from "../run-confirm";
import { RecapCard } from "../recap-card";

/** Real curriculum content, so the fixtures are the shapes the stub sends. */
const CURRICULUM = resolve(__dirname, "../../../../../../curriculum");
const STORY = readFileSync(resolve(CURRICULUM, "stories/legal-letter.md"), "utf8");
const MACHINE = JSON.parse(readFileSync(resolve(CURRICULUM, "lessons/machine.json"), "utf8"));
const STEP1 = MACHINE.steps[0];
const STEP2 = MACHINE.steps[1];
const OPTIONS = ["Where her words went.", "How fast the model answered.", "How big the model file was."];
const SAMPLE = [{ probe: "memory", cmd: "sysctl -n hw.memsize", matched: ["17179869184"] }];
const NOTE = "Sample result. The real probe arrives in step 3.";

const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  scrollIntoView.mockClear();
  clearStoryCache();
});

function stubFetch(response: Promise<Response>) {
  const fetchMock = vi.fn(() => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** One bubble per sentence: chapter 0 has 102 (headings ride with the next sentence). */
const TOTAL_BEATS = 102;

/** Renders an active story card on the real chapter 0 and waits for the first beat. */
async function openStory(respond = vi.fn()) {
  stubFetch(Promise.resolve(new Response(STORY, { status: 200 })));
  render(<StoryCard storyId="legal-letter" question="The day after, what did Priya check?" options={OPTIONS} status="executing" respond={respond} />);
  await screen.findByRole("button", { name: "Go on" });
  return respond;
}

const beatsShown = () => screen.getAllByTestId("coach-beat").length;
const press = (key: string, target: EventTarget = document.body) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe("story card", () => {
  it("TC-40 fetches the story through the app route and shows its title first", async () => {
    const fetchMock = stubFetch(Promise.resolve(new Response(STORY, { status: 200 })));
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={vi.fn()} />);
    expect(fetchMock).toHaveBeenCalledWith(STORY_URL("legal-letter"));
    expect(STORY_URL("legal-letter")).toBe("/api/curriculum/story/legal-letter");
    expect(await screen.findByRole("heading", { name: "Chapter 0: The whole game" })).toBeInTheDocument();
  });

  it("TC-10 opens on the first beat with Go on focused and the count", async () => {
    await openStory();
    expect(beatsShown()).toBe(1);
    expect(screen.getByRole("button", { name: "Go on" })).toHaveFocus();
    expect(screen.getByTestId("coach-beat-count")).toHaveTextContent(`1 of ${TOTAL_BEATS}`);
    expect(screen.getByText("or press Space")).toBeInTheDocument();
    expect(screen.queryByText("The day after, what did Priya check?")).not.toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(screen.getByTestId("coach-story")).toHaveAttribute("data-state", "active");
  });

  it("TC-25 each beat is its own bubble and the story has no card frame while reading", async () => {
    await openStory();
    fireEvent.click(screen.getByRole("button", { name: "Go on" }));
    const beats = screen.getAllByTestId("coach-beat");
    expect(beats).toHaveLength(2);
    for (const beat of beats) expect(beat).toHaveClass("coach-bubble");
    expect(beats[0]).not.toContainElement(beats[1]);
    expect(screen.getByTestId("coach-story")).toHaveClass("coach-card--thread");
  });

  it("TC-26 each step scrolls the Go on row into view, and the question box at the end", async () => {
    await openStory();
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Go on" }));
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByTestId("coach-story-footer"));
    fireEvent.click(screen.getByRole("button", { name: "Show the rest" }));
    const ask = screen.getByText("The day after, what did Priya check?").parentElement;
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(ask);
  });

  it("TC-11 Go on shows the next beat", async () => {
    await openStory();
    fireEvent.click(screen.getByRole("button", { name: "Go on" }));
    expect(beatsShown()).toBe(2);
    expect(screen.getByTestId("coach-beat-count")).toHaveTextContent(`2 of ${TOTAL_BEATS}`);
    expect(screen.getAllByTestId("coach-beat")[1]).toHaveTextContent(/^Then I'm going to ask you why the ending matters\.$/);
  });

  it.each([" ", "Enter"])("TC-12 TC-13 %j on the page shows the next beat", async (key) => {
    await openStory();
    const event = press(key);
    expect(event.defaultPrevented).toBe(true);
    expect(beatsShown()).toBe(2);
  });

  it("TC-14 Space in an empty text field continues and types nothing", async () => {
    await openStory();
    render(<textarea aria-label="Message box" defaultValue="" />);
    const box = screen.getByLabelText("Message box");
    const event = press(" ", box);
    expect(event.defaultPrevented).toBe(true);
    expect(beatsShown()).toBe(2);
  });

  it.each([" ", "Enter"])("TC-15 TC-16 %j in a field with text in it types as normal", async (key) => {
    await openStory();
    render(<textarea aria-label="Message box" defaultValue="Why does memory matter" />);
    const event = press(key, screen.getByLabelText("Message box"));
    expect(event.defaultPrevented).toBe(false);
    expect(beatsShown()).toBe(1);
  });

  it("TC-17 other keys do nothing", async () => {
    await openStory();
    expect(press("x").defaultPrevented).toBe(false);
    expect(press(" ", document.body) && beatsShown()).toBe(2);
    press("ArrowDown");
    expect(beatsShown()).toBe(2);
  });

  it("TC-18 Space on Go on steps exactly once", async () => {
    await openStory();
    const goOn = screen.getByRole("button", { name: "Go on" });
    const event = press(" ", goOn);
    expect(event.defaultPrevented).toBe(false); // the button's own click handles it
    fireEvent.click(goOn); // what the browser does next for Space on a focused button
    expect(beatsShown()).toBe(2);
  });

  it("TC-19 the last sentence brings the question and focuses the first answer", async () => {
    await openStory();
    for (let i = 1; i < TOTAL_BEATS; i += 1) press(" ");
    expect(beatsShown()).toBe(TOTAL_BEATS);
    expect(screen.queryByRole("button", { name: "Go on" })).not.toBeInTheDocument();
    expect(screen.getByText("The day after, what did Priya check?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: OPTIONS[0] })).toHaveFocus();
    press(" ");
    expect(beatsShown()).toBe(TOTAL_BEATS);
  });

  it("TC-20 Show the rest goes straight to the question", async () => {
    await openStory();
    fireEvent.click(screen.getByRole("button", { name: "Show the rest" }));
    expect(beatsShown()).toBe(TOTAL_BEATS);
    expect(screen.getByRole("button", { name: OPTIONS[2] })).toBeInTheDocument();
  });

  it("TC-41 an answer responds once, then the card collapses to a record of the answer", async () => {
    const respond = await openStory();
    fireEvent.click(screen.getByRole("button", { name: "Show the rest" }));
    fireEvent.click(screen.getByRole("button", { name: OPTIONS[1] }));
    expect(respond).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ read: true, answer: OPTIONS[1] }));
    expect(screen.getByTestId("coach-story")).toHaveAttribute("data-state", "answered");
    expect(screen.getByTestId("coach-record")).toHaveTextContent(`Chapter 0: The whole game. You answered: ${OPTIONS[1]}`);
    for (const option of OPTIONS) expect(screen.queryByRole("button", { name: option })).not.toBeInTheDocument();
  });

  it("TC-21 an answered card ignores the keys", async () => {
    stubFetch(Promise.resolve(new Response(STORY, { status: 200 })));
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="complete" result={JSON.stringify({ read: true, answer: OPTIONS[0] })} />);
    await screen.findByTestId("coach-record");
    expect(press(" ").defaultPrevented).toBe(false);
    expect(screen.queryByTestId("coach-beat")).not.toBeInTheDocument();
  });

  it("TC-22 a loading or failed card ignores the keys", async () => {
    stubFetch(new Promise(() => undefined));
    const { unmount } = render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={vi.fn()} />);
    expect(press(" ").defaultPrevented).toBe(false);
    unmount();
    clearStoryCache();
    stubFetch(Promise.resolve(new Response("", { status: 502 })));
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={vi.fn()} />);
    await screen.findByRole("alert");
    expect(press(" ").defaultPrevented).toBe(false);
    expect(screen.queryByRole("button", { name: "Go on" })).not.toBeInTheDocument();
  });

  it("TC-23 the key listener goes when the card does", async () => {
    await openStory();
    cleanup();
    expect(press(" ").defaultPrevented).toBe(false);
  });

  it("TC-24 with reduced motion turned on, beats do not animate", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    await openStory();
    press(" ");
    expect(screen.getAllByTestId("coach-beat")[1]).not.toHaveClass("coach-beat--new");
  });

  it("without reduced motion, the newest beat eases in", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    await openStory();
    press(" ");
    expect(screen.getAllByTestId("coach-beat")[1]).toHaveClass("coach-beat--new");
    expect(screen.getAllByTestId("coach-beat")[0]).not.toHaveClass("coach-beat--new");
  });

  it("TC-41c a collapsed story can be read again", async () => {
    stubFetch(Promise.resolve(new Response(STORY, { status: 200 })));
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="complete" result={JSON.stringify({ read: true, answer: OPTIONS[0] })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Read it again" }));
    expect(screen.getByRole("heading", { name: "Chapter 0: The whole game" })).toBeInTheDocument();
  });

  it("TC-42 a failed fetch shows an error and never responds", async () => {
    stubFetch(Promise.resolve(new Response("", { status: 502 })));
    const respond = vi.fn();
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={respond} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't load the story");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(respond).not.toHaveBeenCalled();
  });

  it("TC-42b two story cards for the same story fetch it once", async () => {
    const fetchMock = stubFetch(Promise.resolve(new Response(STORY, { status: 200 })));
    render(
      <>
        <StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="complete" result={JSON.stringify({ read: true, answer: OPTIONS[0] })} />
        <StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={vi.fn()} />
      </>,
    );
    await screen.findByRole("button", { name: "Go on" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("TC-42c a failed fetch is not cached, so the next card retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response(STORY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={vi.fn()} />);
    await screen.findByRole("alert");
    unmount();
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="executing" respond={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Go on" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a completed card, reloaded from the thread, shows the answer it sent and takes no focus", async () => {
    stubFetch(Promise.resolve(new Response(STORY, { status: 200 })));
    render(<StoryCard storyId="legal-letter" question="Q" options={OPTIONS} status="complete" result={JSON.stringify({ read: true, answer: OPTIONS[2] })} />);
    expect(await screen.findByTestId("coach-record")).toHaveTextContent(OPTIONS[2]);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("step card", () => {
  const props = { stationId: "machine", stepId: STEP1.id, text: STEP1.text, where: STEP1.where, hint: STEP1.hint };

  it("TC-43 the ? control reveals the hint", () => {
    render(<StepCard {...props} hasDoIt status="executing" respond={vi.fn()} />);
    expect(screen.queryByText(/It might say RAM instead/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show a hint" }));
    expect(screen.getByText(/It might say RAM instead/)).toBeInTheDocument();
    expect(screen.getByText("memory").tagName).toBe("STRONG");
  });

  it.each([
    ["I did it", "claim"],
    ["Do it for me", "do_it"],
    ["Skip", "skip"],
  ])("TC-44 %s responds with action %s", (label, action) => {
    const respond = vi.fn();
    render(<StepCard {...props} hasDoIt status="executing" respond={respond} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(respond).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ action }));
    expect(screen.getByTestId("coach-record")).toHaveTextContent(`You chose: ${label}`);
  });

  it("TC-45 no Do it for me when the step has no help", () => {
    render(<StepCard {...props} hasDoIt={false} status="executing" respond={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Do it for me" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I did it" })).toBeInTheDocument();
  });

  it("TC-46 after a choice the controls are gone and the step reads as answered", () => {
    const respond = vi.fn();
    render(<StepCard {...props} hasDoIt status="executing" respond={respond} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("group", { name: "What did you do?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I did it" })).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-step")).toHaveAttribute("data-state", "answered");
    expect(respond).toHaveBeenCalledOnce();
  });

  it("TC-46b an active step scrolls into view and focuses I did it", () => {
    render(<StepCard {...props} hasDoIt status="executing" respond={vi.fn()} />);
    expect(screen.getByRole("button", { name: "I did it" })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByTestId("coach-step")).toHaveAttribute("data-state", "active");
  });

  it("is not clickable while the call is still streaming", () => {
    render(<StepCard {...props} hasDoIt status="inProgress" />);
    expect(screen.getByRole("button", { name: "I did it" })).toBeDisabled();
  });
});

describe("number card", () => {
  const props = { prompt: STEP2.text, unit: "GB", hint: STEP2.hint, platform: "mac" as const };

  it("TC-47 a valid number responds with the value", () => {
    const respond = vi.fn();
    render(<NumberCard {...props} status="executing" respond={respond} />);
    fireEvent.change(screen.getByLabelText("Memory in GB"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "Check it" }));
    expect(respond).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ value: 16 }));
    expect(screen.queryByLabelText("Memory in GB")).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-record")).toHaveTextContent("You said: 16 GB");
  });

  it("TC-47b an active number card focuses its field, so typing goes straight in", () => {
    render(<NumberCard {...props} status="executing" respond={vi.fn()} />);
    expect(screen.getByLabelText("Memory in GB")).toHaveFocus();
  });

  it.each(["", "0", "-2", "abc"])("TC-48 refuses %j", (value) => {
    const respond = vi.fn();
    render(<NumberCard {...props} status="executing" respond={respond} />);
    fireEvent.change(screen.getByLabelText("Memory in GB"), { target: { value } });
    expect(screen.getByRole("button", { name: "Check it" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Check it" }).closest("form")!);
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    ["mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"],
    ["linux", "Mozilla/5.0 (X11; Linux x86_64)"],
    ["other", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"],
  ] as const)("TC-49 shows where to look on %s", (platform, userAgent) => {
    expect(detectPlatform(userAgent)).toBe(platform);
    render(<NumberCard {...props} platform={platform} status="executing" respond={vi.fn()} />);
    const expected = WHERE_TO_LOOK[platform].replace(/`/g, "");
    expect(screen.getByTestId("coach-where-to-look")).toHaveTextContent(expected);
  });
});

describe("check result", () => {
  it("TC-50b a new check result scrolls into view but leaves focus where it was", () => {
    render(<input aria-label="Message box" />);
    const box = screen.getByLabelText("Message box");
    box.focus();
    render(<CheckResult stationId="machine" stepId="machine.2" passed evidence={SAMPLE} note={NOTE} />);
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
    expect(box).toHaveFocus();
  });

  it("TC-50c older cards re-mounted from the thread do not move the reader", () => {
    render(
      <>
        <CheckResult stationId="machine" stepId="machine.2" passed evidence={SAMPLE} note={NOTE} />
        <TubeMap />
      </>,
    );
    // Only the newest card (the map) scrolls; the older check result stays put.
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId("coach-map"));
  });

  it("TC-50d an older step card does not take focus from the newest one", () => {
    render(
      <>
        <StepCard stationId="machine" stepId="machine.1" text="Older" where="settings" hasDoIt={false} status="executing" respond={vi.fn()} />
        <StepCard stationId="machine" stepId="machine.3" text="Newest" where="coach" hasDoIt={false} status="executing" respond={vi.fn()} />
      </>,
    );
    const claims = screen.getAllByRole("button", { name: "I did it" });
    expect(claims[1]).toHaveFocus();
    // Only the newest card scrolls; the older one never runs its focus effect.
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getAllByTestId("coach-step")[1]);
  });

  it("TC-50 shows the verdict and note, evidence hidden", () => {
    render(<CheckResult stationId="machine" stepId="machine.2" passed evidence={SAMPLE} note={NOTE} />);
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.queryByTestId("coach-evidence")).not.toBeInTheDocument();
  });

  it("TC-51 show me what you looked at reveals each command and matched line exactly", () => {
    const evidence = [...SAMPLE, { probe: "tailnet", cmd: "tailscale status --json", matched: ["thing1 100.101.102.103", "laptop 100.64.0.2"] }];
    render(<CheckResult stationId="prove" stepId="prove.3" passed={false} evidence={evidence} note="x" />);
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show me what you looked at" }));
    const shown = screen.getByTestId("coach-evidence");
    const codes = within(shown).getAllByText((_, el) => el?.tagName === "CODE").map((el) => el.textContent);
    expect(codes).toEqual(["sysctl -n hw.memsize", "17179869184", "tailscale status --json", "thing1 100.101.102.103\nlaptop 100.64.0.2"]);
  });

  it("TC-52 no expand control without evidence", () => {
    render(<CheckResult stationId="machine" stepId="machine.2" passed evidence={[]} note={NOTE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("map", () => {
  it("TC-53 marks each V1 station with its snapshot status", () => {
    const stations = DEFAULT_STATIONS.map((s) => (s.id === "machine" ? { ...s, status: "reported" } : s.id === "d_legal" ? { ...s, status: "read" } : s));
    const { container } = render(<TubeMap stations={stations} focus="machine" />);
    const stops = Array.from(container.querySelectorAll("g[data-station]"));
    expect(stops.map((g) => [g.getAttribute("data-station"), g.getAttribute("data-status")])).toEqual([
      ["d_legal", "read"],
      ["machine", "reported"],
      ["localchat", "unseen"],
      ["prove", "unseen"],
    ]);
    expect(screen.getByText("you told me")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/Know your machine: you told me/);
  });

  it("TC-54 with no snapshot shows the four stations, all not started", () => {
    const { container } = render(<TubeMap />);
    const statuses = Array.from(container.querySelectorAll("g[data-station]")).map((g) => g.getAttribute("data-status"));
    expect(statuses).toEqual(["unseen", "unseen", "unseen", "unseen"]);
    expect(screen.getAllByText("not started")).toHaveLength(4);
  });
});

describe("run confirm and recap", () => {
  it.each([
    ["Run", true],
    ["Cancel", false],
  ])("TC-55 %s responds with confirmed %s", (label, confirmed) => {
    const respond = vi.fn();
    render(<RunConfirm cmd="curl -s -m 10 http://thing1:8080/v1/models" explain="Lists the models." status="executing" respond={respond} />);
    expect(screen.getByText("curl -s -m 10 http://thing1:8080/v1/models")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(respond).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ confirmed }));
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-record")).toHaveTextContent(`You chose: ${label}`);
  });

  it("TC-56 an option answer and a skip each respond once", () => {
    const respond = vi.fn();
    const { unmount } = render(<RecapCard itemId="machine.recap.0" question="Memory is the room or the speed?" kind="recap" options={["The room", "The speed"]} status="executing" respond={respond} />);
    fireEvent.click(screen.getByRole("button", { name: "The room" }));
    expect(respond).toHaveBeenLastCalledWith(JSON.stringify({ answer: "The room" }));
    unmount();
    render(<RecapCard itemId="machine.recap.1" question="Q" kind="redo" status="executing" respond={respond} />);
    expect(screen.getByText("Now you")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(respond).toHaveBeenLastCalledWith(JSON.stringify({ skipped: true }));
    expect(respond).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("coach-record")).toHaveTextContent("You skipped it");
  });

  it("a free-text recap needs some text before it can be answered", async () => {
    const respond = vi.fn();
    render(<RecapCard itemId="i" question="Q" kind="recap" status="executing" respond={respond} />);
    expect(screen.getByRole("button", { name: "Answer" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: " three quarters " } });
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    await waitFor(() => expect(respond).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ answer: "three quarters" })));
  });
});
