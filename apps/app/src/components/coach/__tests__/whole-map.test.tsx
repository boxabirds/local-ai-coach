import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GOAL_URL, MAP_URL, NOT_LOADED, NOT_SAVED, WholeMap, type WholeMapData } from "../whole-map";
import { MAX_ZOOM, MIN_ZOOM, centreOn, fitView, linkPath, pan, toMap, zoomAt, zoomOf } from "../whole-map-view";

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

  it("draws spline links as curves and anything else as lines", () => {
    expect(linkPath([[0, 0], [1, 1], [2, 2], [3, 3]])).toBe("M0 0 C1 1 2 2 3 3");
    expect(linkPath([[0, 0], [5, 5]])).toBe("M0 0 L5 5");
    expect(linkPath([[0, 0]])).toBe("");
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

const box = (x: number, y: number) => ({ x, y, w: 120, h: 28 });

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
      stations: { start: box(0, 0), middle: box(200, 0), side: box(200, 100), far: box(400, 50), alone: box(0, 200) },
      edges: [
        { from: "start", to: "middle", points: [[120, 14], [200, 14]] },
        { from: "middle", to: "far", points: [[320, 14], [400, 64]] },
        { from: "side", to: "far", points: [[320, 114], [400, 64]] },
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

const station = (id: string) => document.querySelector(`[data-station="${id}"]`) as SVGGElement;

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
    expect(document.querySelectorAll(".coach-whole-map__link")).toHaveLength(3);
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
    expect(document.querySelectorAll('.coach-whole-map__link[data-route="true"]')).toHaveLength(3);
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

