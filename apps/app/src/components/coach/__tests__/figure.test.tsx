import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Figure, FIGURE_LOAD_ERROR, FIGURE_URL, clearFigureCache } from "../figure";
import { defaultChoices, figureId, parseWhen, resultText, sanitiseSvg, visible } from "../figure-logic";
import { StepCard } from "../step-card";
import { FIXTURE_CURRICULUM } from "@/test/fixture-curriculum";

/** The real figures, as the agent serves them (curriculum.figure in apps/agent). */
const CURRICULUM = FIXTURE_CURRICULUM;
const REGISTRY = JSON.parse(readFileSync(resolve(CURRICULUM, "figures.json"), "utf8")).figures as Record<string, unknown>[];
function served(id: string) {
  const entry = REGISTRY.find((e) => e.id === id)!;
  const { title, alt, caption, controls } = entry;
  return { id, title, alt, caption, controls, svg: readFileSync(resolve(CURRICULUM, "figures", `${id}.svg`), "utf8") };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearFigureCache();
});

function serve(id: string) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(served(id)), { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The text of the one result line drawn now (hidden elements have display none). */
function shownResult(): string {
  const results = Array.from(document.querySelectorAll<SVGElement>(".fig-result")).filter((n) => n.style.display !== "none");
  expect(results).toHaveLength(1);
  return results[0].textContent ?? "";
}

describe("figure rules (TC-20, TC-21)", () => {
  it("TC-20 parseWhen reads conditions, including an empty choice", () => {
    expect(parseWhen(null)).toEqual({});
    expect(parseWhen("memory=16")).toEqual({ memory: "16" });
    expect(parseWhen("memory=16 file=20")).toEqual({ memory: "16", file: "20" });
    expect(parseWhen("pick=")).toEqual({ pick: "" });
  });

  it("TC-20 visible: no conditions, one, two, unmatched, and no choice yet", () => {
    expect(visible({}, { memory: "8" })).toBe(true);
    expect(visible({ memory: "8" }, { memory: "8" })).toBe(true);
    expect(visible({ memory: "8", file: "5" }, { memory: "8", file: "5" })).toBe(true);
    expect(visible({ memory: "8", file: "5" }, { memory: "8", file: "2" })).toBe(false);
    expect(visible({ pick: "" }, { pick: "" })).toBe(true);
    expect(visible({ pick: "" }, { pick: "3" })).toBe(false);
    expect(visible({ pick: "3" }, {})).toBe(false);
  });

  it("TC-20 defaults come from the controls; a control with no default starts unchosen", () => {
    expect(defaultChoices([{ name: "pick", label: "Which?", options: [] }, { name: "memory", label: "Your number", default: "16", options: [] }])).toEqual({ pick: "", memory: "16" });
  });

  it("figureId recognises only a whole marker line", () => {
    expect(figureId("<!-- figure: will-it-fit -->")).toBe("will-it-fit");
    expect(figureId("Text <!-- figure: will-it-fit -->")).toBeNull();
    expect(figureId("<!-- figure: ../x -->")).toBeNull();
  });

  it("TC-20 resultText reads the one result drawn, through nested conditions", () => {
    const svg = served("room-and-warehouse").svg;
    expect(resultText(svg, { file: "20", place: "drive" })).toBe("Kept in the warehouse. Nothing is running yet.");
    expect(resultText(svg, { file: "20", place: "memory" })).toBe("Doesn't fit: 20 GB is bigger than 16 GB.");
    expect(resultText(svg, { file: "5", place: "memory" })).toBe("Fits: 5 GB is under half of 16 GB.");
    expect(resultText("", {})).toBe("");
  });

  it("TC-21 sanitiseSvg removes anything that runs or loads, and keeps local references", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onload="x()">
      <script>alert(1)</script><style>text{}</style><foreignObject><div/></foreignObject>
      <rect onclick="x()" fill="url(#ok-hatch)"/><rect fill="url(https://example.com/a)"/>
      <use href="#a"/><a href="https://example.com"><text>link</text></a><text>kept</text></svg>`;
    const clean = sanitiseSvg(dirty);
    for (const gone of ["<script", "<style", "foreignObject", "onload", "onclick", "example.com", "<use", "<a "]) expect(clean).not.toContain(gone);
    expect(clean).toContain('fill="url(#ok-hatch)"');
    expect(clean).toContain("kept");
    expect(sanitiseSvg("<p>not svg</p>")).toBe("");
  });

  it("TC-21 the real figures come through sanitising unchanged in content", () => {
    for (const entry of REGISTRY) {
      const svg = served(entry.id as string).svg;
      const clean = sanitiseSvg(svg);
      expect(clean.match(/<text/g)?.length).toBe(svg.match(/<text/g)?.length);
      expect(clean.match(/data-when=/g)?.length).toBe(svg.match(/data-when=/g)?.length);
    }
  });
});

describe("Figure component (TC-23)", () => {
  it("draws the default state with its title, choices and caption", async () => {
    const fetchMock = serve("will-it-fit");
    render(<Figure id="will-it-fit" />);
    const figure = await screen.findByTestId("coach-figure");
    expect(fetchMock).toHaveBeenCalledWith(FIGURE_URL("will-it-fit"));
    expect(within(figure).getByText("Will it fit?", { selector: "p" })).toBeInTheDocument();
    expect(within(figure).getByRole("img")).toHaveAccessibleName(expect.stringContaining("half mark"));
    expect(within(figure).getByRole("group", { name: "Your number" })).toBeInTheDocument();
    expect(within(figure).getByRole("button", { name: "16 GB" })).toHaveAttribute("aria-pressed", "true");
    expect(shownResult()).toBe("Doesn't fit: 20 GB is bigger than 16 GB.");
    expect(screen.getByTestId("coach-figure-result")).toHaveTextContent("Doesn't fit");
  });

  it("redraws for each choice: 8 GB and 5 GB fits", async () => {
    serve("will-it-fit");
    render(<Figure id="will-it-fit" />);
    await screen.findByTestId("coach-figure");
    fireEvent.click(screen.getByRole("button", { name: "8 GB" }));
    fireEvent.click(screen.getByRole("button", { name: "5 GB" }));
    expect(screen.getByRole("button", { name: "8 GB" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "16 GB" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(shownResult()).toBe("Depends: 5 GB is between half and all of 8 GB."));
  });

  it("starts with no choice where the figure asks a question", async () => {
    serve("spot-the-line");
    render(<Figure id="spot-the-line" />);
    await screen.findByTestId("coach-figure");
    expect(shownResult()).toBe("Which line shouldn't be there? Pick one.");
    for (const name of ["Line 1", "Line 2", "Line 3"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Line 3" }));
    await waitFor(() => expect(shownResult()).toMatch(/^That one\./));
  });

  it("a mouse press on a choice does not take the focus", async () => {
    serve("where-words-go");
    render(
      <>
        <button type="button">Go on</button>
        <Figure id="where-words-go" />
      </>,
    );
    await screen.findByTestId("coach-figure");
    const goOn = screen.getByRole("button", { name: "Go on" });
    goOn.focus();
    const choice = screen.getByRole("button", { name: "Last year" });
    const pressed = fireEvent.mouseDown(choice);
    expect(pressed).toBe(false); // default prevented: the browser does not move focus
    fireEvent.click(choice);
    expect(goOn).toHaveFocus();
  });

  it("shows one line, and nothing else, when the figure cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 502 }))));
    render(<Figure id="will-it-fit" />);
    expect(await screen.findByTestId("coach-figure-error")).toHaveTextContent(FIGURE_LOAD_ERROR);
    expect(screen.queryByTestId("coach-figure")).toBeNull();
  });

  it("a step card draws its figure above the text while open, and not in its record", async () => {
    serve("will-it-fit");
    const { rerender } = render(<StepCard stepId="machine.3" text="Now the test." where="coach" figure="will-it-fit" status="executing" respond={vi.fn()} />);
    const card = await screen.findByTestId("coach-step");
    const figure = await within(card).findByTestId("coach-figure");
    expect(figure.compareDocumentPosition(within(card).getByText("Now the test.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<StepCard stepId="machine.3" text="Now the test." where="coach" figure="will-it-fit" status="complete" result='{"action":"claim"}' />);
    expect(screen.queryByTestId("coach-figure")).toBeNull();
  });
});
