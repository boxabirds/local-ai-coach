import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { quotable } from "@/components/chat/ask-about";
import { DEFAULT_STATIONS, TubeMap, type MapStation } from "../tube-map";

/** The map opens full screen (Ceetrix story 15, TC-01 to TC-09). jsdom has no top layer, so
 * showModal is stubbed as in provider-keys.test.tsx; the e2e run uses the real one. */

const realShowModal = HTMLDialogElement.prototype.showModal;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

afterEach(() => {
  HTMLDialogElement.prototype.showModal = realShowModal;
  cleanup();
});

/** A snapshot in the shape the agent sends: every default station, one reported. */
const SNAPSHOT: MapStation[] = DEFAULT_STATIONS.map((s, i) => (i === 1 ? { ...s, status: "reported" } : s));
const FOCUS = SNAPSHOT[1].id;

const lightbox = () => screen.queryByTestId("coach-map-lightbox");
const stops = (root: Element) =>
  Array.from(root.querySelectorAll("g[data-station]")).map((g) => [g.getAttribute("data-station"), g.getAttribute("data-status")]);

describe("the map opens full screen", () => {
  it("TC-01 a click on the map opens it, titled Your map", () => {
    render(<TubeMap stations={SNAPSHOT} />);
    expect(lightbox()).toBeNull();
    fireEvent.click(screen.getByTestId("coach-map-drawing").querySelector("svg")!);
    expect(lightbox()).toHaveAttribute("open");
    expect(within(lightbox()!).getByRole("heading", { name: "Your map" })).toBeInTheDocument();
  });

  it("TC-02 the Full screen button opens it", () => {
    render(<TubeMap stations={SNAPSHOT} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(lightbox()).toHaveAttribute("open");
  });

  it("TC-03 it shows the same stations, statuses and highlight as the card", () => {
    render(<TubeMap stations={SNAPSHOT} focus={FOCUS} />);
    const card = screen.getByTestId("coach-map-drawing");
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(stops(lightbox()!)).toEqual(stops(card));
    expect(stops(lightbox()!)).toHaveLength(SNAPSHOT.length);
    const focused = (root: Element) => root.querySelector(".coach-map__outline--focus")?.closest("g[data-station]")?.getAttribute("data-station");
    expect(focused(lightbox()!)).toBe(FOCUS);
    expect(focused(card)).toBe(FOCUS);
  });

  it("TC-04 with no snapshot it shows the default stations", () => {
    render(<TubeMap stations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(stops(lightbox()!).map(([id]) => id)).toEqual(DEFAULT_STATIONS.map((s) => s.id));
  });
});

describe("closing it", () => {
  it("TC-05 Close shuts it and puts focus back on Full screen", () => {
    render(<TubeMap stations={SNAPSHOT} />);
    const opener = screen.getByRole("button", { name: "Full screen" });
    fireEvent.click(opener);
    fireEvent.click(within(lightbox()!).getByRole("button", { name: "Close" }));
    expect(lightbox()).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("TC-06 Escape (the dialog's cancel) shuts it", () => {
    render(<TubeMap stations={SNAPSHOT} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent(lightbox()!, new Event("cancel", { cancelable: true }));
    expect(lightbox()).toBeNull();
  });

  it("TC-07 a click outside the map shuts it; a click on the map inside doesn't", () => {
    render(<TubeMap stations={SNAPSHOT} />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(lightbox()!.querySelector("svg")!);
    expect(lightbox()).toHaveAttribute("open");
    fireEvent.click(lightbox()!);
    expect(lightbox()).toBeNull();
  });
});

describe("no side effects", () => {
  it("TC-08 opening and closing calls nothing and starts no quote", () => {
    const onClick = vi.fn();
    render(
      <div data-testid="copilot-assistant-message" onClick={onClick}>
        <TubeMap stations={SNAPSHOT} />
      </div>,
    );
    const root = screen.getByTestId("copilot-assistant-message");
    const drawing = screen.getByTestId("coach-map-drawing").querySelector("svg")!;
    expect(quotable(drawing, root)).toBeNull();
    fireEvent.click(drawing);
    fireEvent.click(within(lightbox()!).getByRole("button", { name: "Close" }));
    expect(lightbox()).toBeNull();
    expect(root.querySelector("[data-ask-selected]")).toBeNull();
  });

  it("TC-09 without modal dialogs it still opens, without throwing", () => {
    // @ts-expect-error simulating a browser without showModal
    HTMLDialogElement.prototype.showModal = undefined;
    render(<TubeMap stations={SNAPSHOT} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Full screen" }))).not.toThrow();
    expect(lightbox()).toHaveAttribute("open");
  });
});
