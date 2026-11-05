import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useRef, useState, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compose, quotable, quoteText, split } from "../ask-about";
import { QuoteBlock, QuoteContext } from "../quote-block";
import { QuotedUserText } from "../quoted-user-text";
import { QuotedInput } from "../quoted-input";
import { useAskAbout } from "@/hooks/use-ask-about";
import { StepCard } from "@/components/coach/step-card";
import { Figure, clearFigureCache } from "@/components/coach/figure";

/** Story 8: asking about a coach bubble. The coach's own cards are rendered for real; CopilotChat's
 * message markup is copied from its rendered output (data-testid and nesting). */
const CURRICULUM = resolve(__dirname, "../../../../../../curriculum");
const WILL_IT_FIT = (() => {
  const entry = JSON.parse(readFileSync(resolve(CURRICULUM, "figures.json"), "utf8")).figures.find((e: { id: string }) => e.id === "will-it-fit");
  return { ...entry, svg: readFileSync(resolve(CURRICULUM, "figures/will-it-fit.svg"), "utf8") };
})();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearFigureCache();
});

function Thread({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="root">
      <div data-testid="copilot-user-message">
        <p>Find my number</p>
      </div>
      <div data-testid="copilot-assistant-message">
        <div className="answer-markdown">
          <p>The drive&apos;s the warehouse. Memory is the room.</p>
        </div>
        <div className="coach-card">
          <p className="coach-card__label">Here, with me</p>
          <p className="coach-step__text">Type the number from your sticky note.</p>
          <button type="button">I did it</button>
        </div>
      </div>
      <div data-testid="copilot-assistant-message">
        <div className="answer-markdown">
          <p> </p>
        </div>
      </div>
      <div className="coach-bubble coach-beat" data-testid="coach-beat">
        <p>One destination. backroom. Nothing else.</p>
      </div>
      <div className="coach-bubble coach-beat" data-testid="empty-beat">
        <p>   </p>
      </div>
      <p data-testid="gap">space</p>
      {children}
    </div>
  );
}

const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`)!;

describe("which bubbles can be quoted (TC-01 to TC-04)", () => {
  it("TC-01 a coach reply, a story sentence and a step's text", () => {
    render(<Thread />);
    const root = byTestId("root");
    expect(quotable(screen.getByText(/The drive's the warehouse/), root)).toBe(screen.getAllByTestId("copilot-assistant-message")[0]);
    expect(quotable(screen.getByText(/One destination/), root)).toBe(byTestId("coach-beat"));
    expect(quotable(screen.getByText(/Type the number/), root)).toHaveClass("coach-step__text");
  });

  it("TC-01 a figure, quoted as its title and its current result", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(WILL_IT_FIT)))));
    render(<Thread><Figure id="will-it-fit" /></Thread>);
    const figure = await screen.findByTestId("coach-figure");
    await waitFor(() => expect(within(figure).getByTestId("coach-figure-result")).not.toBeEmptyDOMElement());
    expect(quotable(figure.querySelector("svg")!, byTestId("root"))).toBe(figure);
    expect(quoteText(figure)).toBe("Will it fit?\nDoesn't run: 20 GB is bigger than 16 GB.");
    // TC-03: the figure's choices keep their own job.
    expect(quotable(within(figure).getByRole("button", { name: "8 GB" }), byTestId("root"))).toBeNull();
  });

  it("TC-02 never a learner's message, never empty space", () => {
    render(<Thread />);
    expect(quotable(screen.getByText("Find my number"), byTestId("root"))).toBeNull();
    expect(quotable(byTestId("gap"), byTestId("root"))).toBeNull();
  });

  it("TC-02b a bubble with no words is not quotable", () => {
    render(<Thread />);
    expect(quotable(byTestId("empty-beat"), byTestId("root"))).toBeNull();
    expect(quotable(screen.getAllByTestId("copilot-assistant-message")[1], byTestId("root"))).toBeNull();
  });

  it("TC-03 a control inside a bubble, and a card's frame, select nothing", () => {
    render(<Thread />);
    expect(quotable(screen.getByRole("button", { name: "I did it" }), byTestId("root"))).toBeNull();
    expect(quotable(screen.getByText("Here, with me"), byTestId("root"))).toBeNull();
  });

  it("TC-04 a coach reply is quoted without its cards", () => {
    render(<Thread />);
    expect(quoteText(screen.getAllByTestId("copilot-assistant-message")[0])).toBe("The drive's the warehouse. Memory is the room.");
  });

  it("TC-04 a real step card's text", () => {
    render(<div data-testid="root"><StepCard stepId="machine.2" text="Type the number from your sticky note." where="coach" status="executing" respond={vi.fn()} /></div>);
    const text = screen.getByText("Type the number from your sticky note.");
    expect(quoteText(quotable(text, byTestId("root"))!)).toBe("Type the number from your sticky note.");
  });
});

describe("quote in the message (TC-08)", () => {
  it.each([
    ["The drive's the warehouse.", "Why?"],
    ["Line one\nLine two\nLine three", "And then?"],
    ["Quoted", "My answer > yours\n> not a quote"],
  ])("compose and split round trip: %j", (quote, question) => {
    const content = compose(quote, question);
    expect(content.startsWith("> ")).toBe(true);
    expect(split(content)).toEqual({ quote, question });
  });

  it.each(["Plain question", "a > in the middle", "> a quote and nothing else", "> no blank line\nquestion"])("not a quoted question: %j", (content) => {
    expect(split(content)).toEqual({ quote: null, question: content });
  });
});

function Harness({ onAsk }: { onAsk: (text: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const { button } = useAskAbout(root, onAsk);
  return (
    <>
      <div ref={root}>
        <Thread />
      </div>
      <button type="button" data-testid="outside">elsewhere</button>
      {button}
    </>
  );
}

describe("selecting (TC-05 to TC-07)", () => {
  const sentence = () => byTestId("coach-beat");

  it("TC-05 click selects and shows the button; the same bubble again clears; another moves it", async () => {
    render(<Harness onAsk={vi.fn()} />);
    fireEvent.click(screen.getByText(/One destination/));
    expect(sentence()).toHaveAttribute("data-ask-selected", "true");
    expect(await screen.findByTestId("coach-ask-button")).toHaveTextContent("Ask about this");
    fireEvent.click(screen.getByText(/One destination/));
    expect(sentence()).not.toHaveAttribute("data-ask-selected");
    await waitFor(() => expect(screen.queryByTestId("coach-ask-button")).toBeNull());
    fireEvent.click(screen.getByText(/One destination/));
    fireEvent.click(screen.getByText(/The drive's the warehouse/));
    expect(sentence()).not.toHaveAttribute("data-ask-selected");
    expect(screen.getAllByTestId("copilot-assistant-message")[0]).toHaveAttribute("data-ask-selected", "true");
  });

  it("TC-05 a click on the learner's message or a control clears and does not select", () => {
    render(<Harness onAsk={vi.fn()} />);
    fireEvent.click(screen.getByText(/One destination/));
    fireEvent.click(screen.getByText("Find my number"));
    expect(document.querySelector("[data-ask-selected]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I did it" }));
    expect(document.querySelector("[data-ask-selected]")).toBeNull();
  });

  it("TC-06 Escape and an outside click clear; Enter on a focused bubble selects; Space does not", async () => {
    render(<Harness onAsk={vi.fn()} />);
    fireEvent.click(screen.getByText(/One destination/));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(sentence()).not.toHaveAttribute("data-ask-selected");
    fireEvent.click(screen.getByText(/One destination/));
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(sentence()).not.toHaveAttribute("data-ask-selected");
    await waitFor(() => expect(sentence()).toHaveAttribute("tabindex", "0"));
    expect(screen.getAllByTestId("copilot-user-message")[0]).not.toHaveAttribute("tabindex");
    sentence().focus();
    fireEvent.keyDown(sentence(), { key: " " });
    expect(sentence()).not.toHaveAttribute("data-ask-selected");
    fireEvent.keyDown(sentence(), { key: "Enter" });
    expect(sentence()).toHaveAttribute("data-ask-selected", "true");
  });

  it("TC-07 Ask about this hands over the words and clears the selection", async () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    fireEvent.click(screen.getByText(/One destination/));
    // Pressed as a mouse does: mousedown first (the button sits outside the chat), then click.
    const button = await screen.findByTestId("coach-ask-button");
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(onAsk).toHaveBeenCalledWith("One destination. backroom. Nothing else.");
    expect(sentence()).not.toHaveAttribute("data-ask-selected");
  });
});

describe("the quote block and the sent question (TC-09, TC-13, TC-14)", () => {
  it("TC-09 read-only, with remove; over three lines it is cut, with the whole text in its title", () => {
    const remove = vi.fn();
    const text = "one\ntwo\nthree\nfour";
    render(<QuoteBlock text={text} onRemove={remove} />);
    const block = screen.getByTestId("coach-quote");
    expect(block).toHaveAttribute("title", text);
    expect(block.querySelectorAll(".coach-quote__line")).toHaveLength(3);
    expect(block).toHaveTextContent("three…");
    expect(within(block).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(block).getByRole("button", { name: "Remove the quote" }));
    expect(remove).toHaveBeenCalledOnce();
  });

  it("TC-13 a sent question shows its quote above it", () => {
    render(<QuotedUserText content={compose("One destination. backroom. Nothing else.", "Why only one?")} />);
    expect(screen.getByTestId("coach-quote")).toHaveTextContent("One destination. backroom. Nothing else.");
    expect(screen.getByText("Why only one?")).toBeInTheDocument();
    expect(screen.queryByText(/^>/)).toBeNull();
  });

  it.each(["Why only one?", "a > in the middle"])("TC-14 plain text stays plain: %j", (content) => {
    render(<QuotedUserText content={content} />);
    expect(screen.queryByTestId("coach-quote")).toBeNull();
    expect(screen.getByText(content)).toBeInTheDocument();
  });
});

function QuoteHarness({ initial, children }: { initial: string | null; children: ReactNode }) {
  const [quote, setQuote] = useState<string | null>(initial);
  return (
    <QuoteContext.Provider value={{ quote, clear: () => setQuote(null) }}>
      {children}
      <output data-testid="quote-state">{quote ?? "none"}</output>
    </QuoteContext.Provider>
  );
}

describe("the quoted input, with CopilotKit's own input (TC-10 to TC-12)", () => {
  const type = (text: string) => fireEvent.change(screen.getByTestId("copilot-chat-textarea"), { target: { value: text } });
  const send = () => fireEvent.keyDown(screen.getByTestId("copilot-chat-textarea"), { key: "Enter" });

  it("TC-10 the question goes with its quote, and the quote clears", () => {
    const submit = vi.fn();
    render(<QuoteHarness initial="The drive's the warehouse."><QuotedInput onSubmitMessage={submit} /></QuoteHarness>);
    expect(screen.getByTestId("coach-quote")).toHaveTextContent("The drive's the warehouse.");
    type("Why doesn't it count?");
    send();
    expect(submit).toHaveBeenCalledWith("> The drive's the warehouse.\n\nWhy doesn't it count?");
    expect(screen.getByTestId("quote-state")).toHaveTextContent("none");
  });

  it("TC-11 a quote with a blank question is not sent", () => {
    const submit = vi.fn();
    render(<QuoteHarness initial="Quoted"><QuotedInput onSubmitMessage={submit} /></QuoteHarness>);
    type("   ");
    send();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByTestId("coach-quote")).toBeInTheDocument();
  });

  it("TC-12 remove keeps the question; with no quote the question passes through", () => {
    const submit = vi.fn();
    render(<QuoteHarness initial="Quoted"><QuotedInput onSubmitMessage={submit} /></QuoteHarness>);
    type("My question");
    fireEvent.click(screen.getByRole("button", { name: "Remove the quote" }));
    expect(screen.queryByTestId("coach-quote")).toBeNull();
    expect(screen.getByTestId("copilot-chat-textarea")).toHaveValue("My question");
    send();
    expect(submit).toHaveBeenCalledWith("My question");
  });
});
