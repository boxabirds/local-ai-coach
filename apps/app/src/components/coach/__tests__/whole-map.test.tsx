import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GOAL_URL, MAP_URL, NOT_LOADED, NOT_SAVED, WholeMap, type WholeMapData } from "../whole-map";
import { MAX_ZOOM, MIN_ZOOM, centreOn, fitView, pan, toMap, zoomAt, zoomOf } from "../whole-map-view";

/**
 * The whole map (Ceetrix story 29, TC-16 to TC-22). A small made-up map shaped like the agent's
 * map data (real field names); jsdom has no layout, so the view maths is tested on numbers.
 */

// TC-16: the viewport maths
describe("the view", () => {
  const box = { x: 0, y: 0, w: 1000, h: 500 };
  const frame = { width: 800, height: 800 };

  it("fits the whole map, centred, with the frame's proportions", () => {
    const view = fitView(box, frame);
    expect(view.w).toBeCloseTo(view.h); // a square frame
    expect(view.w).toBeGreaterThan(box.w);
    expect(view.x + view.w / 2).toBeCloseTo(box.w / 2);
    expect(view.y + view.h / 2).toBeCloseTo(box.h / 2);
  });

  it("zooms around a point, keeping it where it is on screen", () => {
    const fitted = fitView(box, frame);
    const at = { x: 300, y: 200 };
    const before = (at.x - fitted.x) / fitted.w;
    const closer = zoomAt(fitted, 2, at, fitted);
    expect(zoomOf(closer, fitted)).toBeCloseTo(2);
    expect((at.x - closer.x) / closer.w).toBeCloseTo(before);
  });

  it("stops at both limits", () => {
    const fitted = fitView(box, frame);
    expect(zoomOf(zoomAt(fitted, 1000, { x: 0, y: 0 }, fitted), fitted)).toBeCloseTo(MAX_ZOOM);
    expect(zoomOf(zoomAt(fitted, 0.001, { x: 0, y: 0 }, fitted), fitted)).toBeCloseTo(MIN_ZOOM);
    const atMax = zoomAt(fitted, MAX_ZOOM, { x: 0, y: 0 }, fitted);
    expect(zoomOf(zoomAt(atMax, 2, { x: 0, y: 0 }, fitted), fitted)).toBeCloseTo(MAX_ZOOM);
  });

  it("drags the map with the pointer, in map units", () => {
    const view = { x: 100, y: 100, w: 400, h: 400 };
    expect(pan(view, 80, -40, frame)).toEqual({ x: 60, y: 120, w: 400, h: 400 });
    expect(toMap(view, frame, { x: 400, y: 400 })).toEqual({ x: 300, y: 300 });
    expect(centreOn(view, { x: 0, y: 0 })).toEqual({ x: -200, y: -200, w: 400, h: 400 });
  });

});

// ---------------------------------------------------------------- the dialog

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const spot = (x: number, y: number, label: string[], dest = false) => ({ x, y, dest, label });

/** Made-up stations: start -> middle -> far (a destination), side -> far, alone (a destination). */
function made(overrides: Partial<WholeMapData> = {}): WholeMapData {
  return {
    stations: [
      { id: "start", name: "Made-up start", needs: [], unlocks: "Starts things.", status: "verified", criticality: "grey" },
      { id: "middle", name: "Made-up middle", needs: ["start"], unlocks: "Middles.", status: "read", criticality: "amber" },
      { id: "side", name: "Made-up side", needs: [], status: "unseen", criticality: "red" },
      { id: "far", name: "Made-up far", needs: ["middle", "side"], unlocks: "Gets you there.", destination: true, status: "unseen" },
      { id: "alone", name: "Made-up alone", needs: [], destination: true, status: "unseen" },
    ],
    layout: {
      width: 600,
      height: 300,
      stations: {
        start: spot(90, 70, ["Made-up start"]),
        middle: spot(212, 70, ["Made-up middle"]),
        side: spot(212, 140, ["Made-up side"]),
        far: spot(500, 70, ["Made-up far"], true),
        alone: spot(500, 200, ["Made-up alone"], true),
      },
      edges: [
        { from: "start", to: "middle", kind: "track", area: "trunk", d: "M90 70 L212 70" },
        { from: "middle", to: "far", kind: "link", area: "text", d: "M212 70 L500 70" },
        { from: "side", to: "far", kind: "link", area: "text", d: "M212 140 L500 70" },
        { from: "start", to: "side", kind: "better", area: "models", d: "M90 70 L212 140" },
      ],
    },
    current: "middle",
    goal: null,
    route: [],
    reached: false,
    ...overrides,
  };
}

function serve(map: WholeMapData, goal: (body: unknown) => Response = () => Response.json(map)) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === MAP_URL) return Response.json(map);
    if (url === GOAL_URL) return goal(JSON.parse(String(init?.body)));
    throw new Error(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const station = (id: string) => document.querySelector(`[data-station="${id}"]`) as unknown as HTMLElement;

/** Render the map; the data comes from serve(). */
async function open(onClose = vi.fn()) {
  render(<WholeMap onClose={onClose} />);
  await screen.findByTestId("coach-whole-map-svg");
  return onClose;
}

describe("the whole map", () => {
  it("TC-17 draws every station and link; covered full strength, the rest half; You are here on the current one", async () => {
    serve(made());
    await open();
    for (const id of ["start", "middle", "side", "far", "alone"]) expect(station(id)).toBeInTheDocument();
    expect(document.querySelectorAll(".coach-whole-map__link")).toHaveLength(4);
    expect(station("start")).toHaveAttribute("data-covered", "true");
    expect(station("start")).not.toHaveClass("coach-whole-map__station--faint");
    expect(station("side")).toHaveClass("coach-whole-map__station--faint");
    expect(station("middle")).not.toHaveClass("coach-whole-map__station--faint"); // where you are
    expect(within(station("middle")).getByTestId("coach-whole-map-here")).toHaveTextContent("You are here");
    expect(screen.getAllByTestId("coach-whole-map-here")).toHaveLength(1);
  });

  it("TC-18 a tapped station shows what it unlocks and needs; a need moves to that station", async () => {
    serve(made());
    await open();
    fireEvent.click(station("far"));
    const panel = screen.getByTestId("coach-whole-map-panel");
    expect(within(panel).getByRole("heading", { name: "Made-up far" })).toBeInTheDocument();
    expect(panel).toHaveTextContent("Gets you there.");
    fireEvent.click(within(panel).getByRole("button", { name: "Made-up middle" }));
    expect(within(screen.getByTestId("coach-whole-map-panel")).getByRole("heading", { name: "Made-up middle" })).toBeInTheDocument();
  });

  it("TC-18b a station that is not a destination offers no goal; Enter opens a station too", async () => {
    serve(made());
    await open();
    fireEvent.keyDown(station("side"), { key: "Enter" });
    const panel = screen.getByTestId("coach-whole-map-panel");
    expect(within(panel).queryByRole("button", { name: "Make this my goal" })).toBeNull();
  });

  it("TC-19 Make this my goal sends it and lights the route; Clear my goal sends null", async () => {
    const withGoal = made({ goal: "far", route: ["middle", "side", "far"] });
    const fetchMock = serve(made(), (body) => Response.json((body as { destination: string | null }).destination ? withGoal : made()));
    await open();
    fireEvent.click(station("far"));
    fireEvent.click(screen.getByRole("button", { name: "Make this my goal" }));
    await screen.findByRole("button", { name: "Clear my goal" });
    expect(fetchMock).toHaveBeenCalledWith(GOAL_URL, expect.objectContaining({ method: "POST", body: JSON.stringify({ destination: "far" }) }));
    for (const id of ["middle", "side", "far"]) expect(station(id)).toHaveAttribute("data-route", "true");
    expect(station("alone")).not.toHaveAttribute("data-route");
    expect(within(station("far")).getByTestId("coach-whole-map-goal")).toBeInTheDocument();
    expect(document.querySelectorAll('.coach-whole-map__link[data-route="true"]')).toHaveLength(3); // start->middle (joins from a covered station), middle->far, side->far
    expect(document.querySelector('[data-kind="better"]')).not.toHaveAttribute("data-route");
    // The goal's panel lists the way there, in order, so it can be read at any zoom.
    const steps = within(screen.getByTestId("coach-whole-map-route")).getAllByRole("button").map((b) => b.textContent);
    expect(steps).toEqual(["Made-up middle", "Made-up side", "Made-up far"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear my goal" }));
    await screen.findByRole("button", { name: "Make this my goal" });
    expect(fetchMock).toHaveBeenLastCalledWith(GOAL_URL, expect.objectContaining({ body: JSON.stringify({ destination: null }) }));
    expect(document.querySelectorAll("[data-route]")).toHaveLength(0);
  });

  it("TC-20 a goal that can't be saved says so and keeps the old one", async () => {
    serve(made(), () => Response.json({ error: "x" }, { status: 500 }));
    await open();
    fireEvent.click(station("far"));
    fireEvent.click(screen.getByRole("button", { name: "Make this my goal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_SAVED);
    expect(document.querySelectorAll("[data-route]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Make this my goal" })).toBeEnabled();
  });

  it("TC-21 a map that can't load says so; Try again loads it", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls === 1 ? Response.json({}, { status: 502 }) : Response.json(made()))));
    render(<WholeMap onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("coach-whole-map-svg");
    expect(calls).toBe(2);
  });

  it("TC-22 Escape closes the station first, then the map", async () => {
    serve(made());
    const onClose = await open();
    fireEvent.click(station("far"));
    const dialog = screen.getByTestId("coach-whole-map");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByTestId("coach-whole-map-panel")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("zoom in moves the view; Fit brings back the whole map", async () => {
    serve(made());
    await open();
    const svg = screen.getByTestId("coach-whole-map-svg");
    await waitFor(() => expect(svg.getAttribute("viewBox")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    const fitted = svg.getAttribute("viewBox");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(svg.getAttribute("viewBox")).not.toBe(fitted);
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(svg.getAttribute("viewBox")).toBe(fitted);
  });

  it("opening the map changes nothing: it only reads", async () => {
    const fetchMock = serve(made());
    await open();
    fireEvent.click(station("far"));
    expect(fetchMock.mock.calls.every(([url]) => url === MAP_URL)).toBe(true);
  });
});

describe("the first view", () => {
  it("shows names at their real size, centred on where the learner is", async () => {
    const { startView } = await import("../whole-map-view");
    const fitted = fitView({ x: 0, y: 0, w: 4000, h: 2000 }, { width: 1000, height: 500 });
    const view = startView({ x: 3000, y: 1500 }, { width: 1000, height: 500 }, fitted);
    expect(view.w).toBeCloseTo(1000); // one map unit to one pixel
    expect(view.x + view.w / 2).toBeCloseTo(3000);
    expect(view.y + view.h / 2).toBeCloseTo(1500);
  });
});

describe("framing a route", () => {
  it("frames every station on the route, and never closer than the zoom limit", async () => {
    const { frameBoxes, boundsOf, zoomOf: zoom } = await import("../whole-map-view");
    const fitted = fitView({ x: 0, y: 0, w: 4000, h: 2000 }, { width: 1000, height: 500 });
    const route = [{ x: 100, y: 100, w: 100, h: 20 }, { x: 900, y: 600, w: 120, h: 20 }];
    const view = frameBoxes(route, { width: 1000, height: 500 }, fitted)!;
    const all = boundsOf(route)!;
    expect(view.x).toBeLessThanOrEqual(all.x);
    expect(view.y).toBeLessThanOrEqual(all.y);
    expect(view.x + view.w).toBeGreaterThanOrEqual(all.x + all.w);
    expect(view.y + view.h).toBeGreaterThanOrEqual(all.y + all.h);
    const one = frameBoxes([{ x: 10, y: 10, w: 2, h: 2 }], { width: 1000, height: 500 }, fitted)!;
    expect(zoom(one, fitted)).toBeLessThanOrEqual(MAX_ZOOM + 1e-9);
    expect(frameBoxes([], { width: 1000, height: 500 }, fitted)).toBeNull();
  });
});

describe("a reached goal", () => {
  it("says so instead of listing a route", async () => {
    serve(made({ goal: "alone", route: [], reached: true }));
    await open();
    fireEvent.click(station("alone"));
    expect(screen.getByTestId("coach-whole-map-reached")).toBeInTheDocument();
    expect(screen.queryByTestId("coach-whole-map-route")).toBeNull();
  });
});

describe("story 30: the tube map in the coach's style", () => {
  it("TC-09 stations take the coach's shape for their criticality, filled when covered, faint otherwise", async () => {
    serve(made());
    await open();
    const dot = (id: string) => station(id).querySelector(".coach-whole-map__dot")!;
    expect(dot("start")).toHaveClass("coach-crit--grey", "coach-whole-map__dot--covered");
    expect(dot("middle")).toHaveClass("coach-crit--amber");
    expect(dot("side")).toHaveClass("coach-crit--red");
    expect(dot("side")).not.toHaveClass("coach-whole-map__dot--covered");
    expect(dot("far")).toHaveClass("coach-crit--none");
    expect(station("side")).toHaveClass("coach-whole-map__station--faint");
    expect(station("far")).toHaveClass("coach-whole-map__station--dest");
  });

  it("TC-10 a track carries its area's line colour; a better-with link is dotted", async () => {
    serve(made());
    await open();
    const track = document.querySelector('[data-kind="track"]') as SVGPathElement;
    expect(track).toHaveClass("coach-whole-map__link--track");
    expect(track.getAttribute("style")).toContain("--map-line-trunk");
    expect(document.querySelector('[data-kind="better"]')).toHaveClass("coach-whole-map__link--better");
    expect(document.querySelectorAll('[data-kind="link"]')).toHaveLength(2);
  });

  it("TC-11 every name sits on a plate", async () => {
    serve(made());
    await open();
    expect(screen.getAllByTestId("coach-whole-map-plate")).toHaveLength(5);
    for (const id of ["start", "far"]) expect(within(station(id)).getByTestId("coach-whole-map-plate")).toBeInTheDocument();
  });

  it("TC-12 nothing explains the map in words: only names, You are here and the controls", async () => {
    serve(made());
    await open();
    const svgText = Array.from(document.querySelectorAll(".coach-whole-map__svg text")).map((t) => t.textContent);
    expect(svgText.sort()).toEqual(["Made-up alone", "Made-up far", "Made-up middle", "Made-up side", "Made-up start", "You are here"].sort());
    const outside = screen.getByTestId("coach-whole-map").textContent!.replace(document.querySelector(".coach-whole-map__svg")!.textContent!, "");
    expect(outside.replace(/\s+/g, "")).toBe("+−FitClose");
  });

  it("TC-13 a layout in the old format can't be drawn and says so", async () => {
    const old = made();
    (old.layout as unknown as { stations: Record<string, unknown> }).stations = { start: { x: 1, y: 2, w: 3, h: 4 } };
    serve(old);
    render(<WholeMap onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_LOADED);
  });
});

describe("the view stays on the map", () => {
  it("never moves past an edge into blank space; a view bigger than the map is centred", async () => {
    const { clampView, EDGE_MARGIN } = await import("../whole-map-view");
    const map = { x: 0, y: 0, w: 1000, h: 4000 };
    // You are here in the top-right corner: the view is pulled back onto the map.
    expect(clampView({ x: 700, y: -300, w: 800, h: 600 }, map)).toEqual({ x: 1000 + EDGE_MARGIN - 800, y: -EDGE_MARGIN, w: 800, h: 600 });
    // Inside the map it stays where it is.
    expect(clampView({ x: 100, y: 1000, w: 800, h: 600 }, map)).toEqual({ x: 100, y: 1000, w: 800, h: 600 });
    // Wider than the map: centred across it.
    expect(clampView({ x: -900, y: 0, w: 3000, h: 600 }, map).x).toBe(500 - 1500);
  });
});

