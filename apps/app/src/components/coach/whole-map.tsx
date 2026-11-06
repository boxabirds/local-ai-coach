import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { critClass, shapePath, type Criticality } from "./tube-map";
import { ZOOM_STEP, centreOn, clampView, fitView, frameBoxes, pan, startView, toMap, zoomAt, type Box, type Size, type View } from "./whole-map-view";

/**
 * The whole map (Ceetrix story 29): every station and how they connect, where the learner is, and
 * the route to the goal they choose. Opened from the header's Map button, full screen. Panning and
 * zooming move the SVG's viewBox directly, so they never redraw React. Plain React, no CopilotKit.
 */

export const MAP_URL = "/api/curriculum/map";
export const GOAL_URL = "/api/coach-goal";
// Learner-facing, in the coach's voice.
export const NOT_LOADED = "I couldn't load the map.";
export const NOT_SAVED = "I couldn't save that goal.";
const YOU_ARE_HERE = "You are here";
const REACHED = "You've covered everything this needs.";

const COVERED = new Set(["reported", "assisted", "verified", "skipped"]);
/** The station shape's half-size; destinations are bigger, as on the tube map. */
const DOT_R = 8;
const DEST_R = 11;
/** Label plates: a station's name sits under it, a destination's to its right (tube-map layout). */
const LABEL_DY = 22;
const LINE_DY = 11;
const DEST_LABEL_DX = 20;
const DEST_LABEL_DY = 5;
const CHAR_PX = 6.1;
const DEST_CHAR_PX = 7.6;
const PLATE_PAD_X = 4;
const PLATE_PAD_TOP = 9;
const PLATE_PAD_BOTTOM = 4;
const DEST_PLATE_TOP = 13;
const DEST_PLATE_BOTTOM = 5;
const HERE_DY = 18;
/** Room around a station when a route is framed. */
const FRAME_PAD = 60;
/** A drag shorter than this (pixels) is a tap, not a move. */
const DRAG_PX = 4;
/** How strongly one wheel notch zooms. */
const WHEEL_ZOOM = 0.0015;

export type WholeMapStation = {
  id: string;
  name: string;
  area?: string;
  needs?: string[];
  unlocks?: string;
  destination?: boolean;
  criticality?: Criticality | null;
  status: string;
};

export type WholeMapData = {
  stations: WholeMapStation[];
  layout: {
    width: number;
    height: number;
    stations: Record<string, { x: number; y: number; dest: boolean; label: string[] }>;
    edges: { from: string; to: string; kind: "track" | "link" | "better"; area: string; d: string }[];
  };
  current: string;
  goal: string | null;
  route: string[];
  reached: boolean;
};

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; data: WholeMapData };

type Spot = WholeMapData["layout"]["stations"][string];

/** The plate behind a station's name, sized from its text so a track never runs through it. */
function plateOf(spot: Spot): Box {
  const longest = Math.max(...spot.label.map((line) => line.length));
  if (spot.dest) {
    const w = longest * DEST_CHAR_PX + 2 * PLATE_PAD_X;
    return { x: spot.x + DEST_LABEL_DX - PLATE_PAD_X, y: spot.y + DEST_LABEL_DY - DEST_PLATE_TOP, w, h: DEST_PLATE_TOP + DEST_PLATE_BOTTOM };
  }
  const w = longest * CHAR_PX + 2 * PLATE_PAD_X;
  const top = spot.y + LABEL_DY - PLATE_PAD_TOP;
  const h = PLATE_PAD_TOP + (spot.label.length - 1) * LINE_DY + PLATE_PAD_BOTTOM;
  return { x: spot.x - w / 2, y: top, w, h };
}

function hitArea(spot: Spot, r: number, plate: Box): { x: number; y: number; width: number; height: number } {
  const x = Math.min(spot.x - r, plate.x);
  const y = spot.y - r;
  return { x, y, width: Math.max(spot.x + r, plate.x + plate.w) - x, height: Math.max(spot.y + r, plate.y + plate.h) - y };
}

/** A layout this view can draw (version 2: stations as points, links as paths). */
export function drawable(data: WholeMapData): boolean {
  const { layout } = data;
  if (!layout || typeof layout !== "object" || !Array.isArray(layout.edges) || !layout.stations) return false;
  return Object.values(layout.stations).every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Array.isArray(s.label)) && layout.edges.every((e) => typeof e.d === "string");
}

function frameOf(svg: SVGSVGElement | null): Size {
  return { width: svg?.clientWidth ?? 0, height: svg?.clientHeight ?? 0 };
}

export function WholeMap({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const view = useRef<View | null>(null);
  const fitted = useRef<View | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    fetch(MAP_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: WholeMapData) => live && setLoad(drawable(data) ? { state: "ready", data } : { state: "failed" }))
      .catch(() => live && setLoad({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [attempt]);

  // Every move goes through here, and none leaves the map for blank space.
  const bounds = useRef<Box | null>(null);
  const show = useCallback((next: View) => {
    const kept = bounds.current ? clampView(next, bounds.current) : next;
    view.current = kept;
    svg.current?.setAttribute("viewBox", `${kept.x} ${kept.y} ${kept.w} ${kept.h}`);
  }, []);

  const fit = useCallback(() => {
    if (load.state !== "ready") return;
    const { width, height } = load.data.layout;
    fitted.current = fitView({ x: 0, y: 0, w: width, h: height }, frameOf(svg.current));
    show(fitted.current);
  }, [load, show]);

  // Once loaded: names at their real size, centred on where the learner is (Fit shows all of it).
  // Only the first time: a goal change brings new data but must not move the learner's view.
  const started = useRef(false);
  useEffect(() => {
    if (load.state !== "ready") return;
    const { width, height, stations } = load.data.layout;
    const frame = frameOf(svg.current);
    bounds.current = { x: 0, y: 0, w: width, h: height };
    fitted.current = fitView(bounds.current, frame);
    if (started.current) return;
    started.current = true;
    const here = stations[load.data.current];
    const at = here ? { x: here.x, y: here.y } : { x: width / 2, y: height / 2 };
    show(startView(at, frame, fitted.current));
  }, [load, show]);
  useEffect(() => {
    if (load.state !== "ready") return;
    const { width, height } = load.data.layout;
    const refit = () => {
      fitted.current = fitView({ x: 0, y: 0, w: width, h: height }, frameOf(svg.current));
    };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [load]);

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      const current = view.current;
      if (!current || !fitted.current) return;
      const point = at ?? { x: current.x + current.w / 2, y: current.y + current.h / 2 };
      show(zoomAt(current, factor, point, fitted.current));
    },
    [show],
  );

  // Wheel zoom at the pointer; not passive, so the page itself doesn't scroll.
  useEffect(() => {
    const el = svg.current;
    if (!el || load.state !== "ready") return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = el.getBoundingClientRect();
      const current = view.current;
      if (!current) return;
      const at = toMap(current, frameOf(el), { x: event.clientX - box.left, y: event.clientY - box.top });
      zoomBy(Math.exp(-event.deltaY * WHEEL_ZOOM), at);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [load.state, zoomBy]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start || !view.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!start.moved) svg.current?.setPointerCapture?.(event.pointerId);
    start.moved = true;
    show(pan(view.current, dx, dy, frameOf(svg.current)));
    start.x = event.clientX;
    start.y = event.clientY;
  };
  const onPointerUp = () => {
    // A drag ends on the next tick, so the click that follows it isn't taken as a tap.
    setTimeout(() => {
      drag.current = null;
    });
  };

  const data = load.state === "ready" ? load.data : null;
  const byId = useMemo(() => new Map((data?.stations ?? []).map((s) => [s.id, s])), [data]);
  const onRoute = useMemo(() => new Set(data?.route ?? []), [data]);

  const select = (id: string, centre = false) => {
    if (drag.current?.moved) return;
    setSelected(id);
    setSaveError(false);
    const spot = data?.layout.stations[id];
    if (centre && spot && view.current) show(centreOn(view.current, { x: spot.x, y: spot.y }));
  };

  const setGoal = async (destination: string | null) => {
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch(GOAL_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as WholeMapData;
      setLoad({ state: "ready", data: next });
      // A new goal: frame where the learner is and the whole route to it.
      const boxes: Box[] = [next.current, ...next.route]
        .map((id) => next.layout.stations[id])
        .filter(Boolean)
        .map((spot) => ({ x: spot.x - FRAME_PAD, y: spot.y - FRAME_PAD, w: 2 * FRAME_PAD, h: 2 * FRAME_PAD }));
      const framed = fitted.current && destination ? frameBoxes(boxes, frameOf(svg.current), fitted.current) : null;
      if (framed) show(framed);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const onStationKey = (event: ReactKeyboardEvent, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(id);
    }
  };

  const chosen = selected ? byId.get(selected) : undefined;

  return (
    <dialog
      ref={dialog}
      className="coach-whole-map"
      aria-label="Map"
      data-testid="coach-whole-map"
      onCancel={(event) => {
        event.preventDefault();
        if (selected) setSelected(null);
        else onClose();
      }}
    >
      <div className="coach-whole-map__tools">
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={!data}>
          +
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!data}>
          −
        </button>
        <button type="button" onClick={fit} disabled={!data}>
          Fit
        </button>
        <button type="button" className="coach-whole-map__close" onClick={onClose}>
          Close
        </button>
      </div>

      {load.state === "loading" && <p className="coach-muted coach-whole-map__note">Loading the map…</p>}
      {load.state === "failed" && (
        <div className="coach-whole-map__note" role="alert">
          <p>{NOT_LOADED}</p>
          <button type="button" onClick={() => { setLoad({ state: "loading" }); setAttempt((n) => n + 1); }}>
            Try again
          </button>
        </div>
      )}

      {data && (
        <svg
          ref={svg}
          className="coach-whole-map__svg"
          data-testid="coach-whole-map-svg"
          data-goal={data.goal ?? ""}
          data-has-route={data.route.length > 0 ? "true" : undefined}
          role="group"
          aria-label="Every station"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g className="coach-whole-map__links">
            {data.layout.edges.map((edge) => {
              // A route is made of requirements: a better-with link is never part of it.
              const lit = edge.kind !== "better" && onRoute.has(edge.to) && (onRoute.has(edge.from) || COVERED.has(byId.get(edge.from)?.status ?? ""));
              const touched = selected !== null && (edge.from === selected || edge.to === selected);
              return (
                <path
                  key={`${edge.kind}:${edge.from}>${edge.to}`}
                  d={edge.d}
                  // Each area's track in its own colour (coach.css --map-line-<area>).
                  style={{ "--line": `var(--map-line-${edge.area}, var(--coach-line))` } as CSSProperties}
                  className={`coach-whole-map__link coach-whole-map__link--${edge.kind}${lit ? " coach-whole-map__link--route" : ""}${touched ? " coach-whole-map__link--touched" : ""}`}
                  data-kind={edge.kind}
                  data-area={edge.area}
                  data-route={lit ? "true" : undefined}
                />
              );
            })}
          </g>
          {data.stations.map((station) => {
            const spot = data.layout.stations[station.id];
            if (!spot) return null;
            const covered = COVERED.has(station.status);
            const route = onRoute.has(station.id);
            const strong = covered || route || station.id === data.current || station.id === data.goal;
            const criticality = station.criticality ?? undefined;
            const r = spot.dest ? DEST_R : DOT_R;
            const plate = plateOf(spot);
            return (
              <g
                key={station.id}
                className={`coach-whole-map__station${spot.dest ? " coach-whole-map__station--dest" : ""}${strong ? "" : " coach-whole-map__station--faint"}${route ? " coach-whole-map__station--route" : ""}${selected === station.id ? " coach-whole-map__station--selected" : ""}`}
                data-station={station.id}
                data-covered={covered ? "true" : "false"}
                data-route={route ? "true" : undefined}
                role="button"
                tabIndex={0}
                aria-label={station.name}
                aria-pressed={selected === station.id}
                onClick={() => select(station.id)}
                onKeyDown={(event) => onStationKey(event, station.id)}
              >
                {/* The shape and the name's plate together are the tap target. */}
                <rect {...hitArea(spot, r, plate)} className="coach-whole-map__hit" />
                <path d={shapePath(criticality, spot.x, spot.y, r)} className={`coach-whole-map__dot ${critClass(criticality)}${covered ? " coach-whole-map__dot--covered" : ""}`} />
                {station.id === data.goal && <circle cx={spot.x} cy={spot.y} r={r + 5} className="coach-whole-map__goal-ring" data-testid="coach-whole-map-goal" />}
                <rect x={plate.x} y={plate.y} width={plate.w} height={plate.h} rx={4} className="coach-whole-map__plate" data-testid="coach-whole-map-plate" />
                {spot.label.map((line, i) => (
                  <text
                    key={line}
                    x={spot.dest ? spot.x + DEST_LABEL_DX : spot.x}
                    y={spot.dest ? spot.y + DEST_LABEL_DY : spot.y + LABEL_DY + i * LINE_DY}
                    textAnchor={spot.dest ? "start" : "middle"}
                    className="coach-whole-map__name"
                  >
                    {line}
                  </text>
                ))}
                {station.id === data.current && (
                  <text x={spot.x} y={spot.y - r - HERE_DY / 2} textAnchor="middle" className="coach-whole-map__here" data-testid="coach-whole-map-here">
                    {YOU_ARE_HERE}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {chosen && data && (
        <aside className="coach-whole-map__panel" data-testid="coach-whole-map-panel" aria-label={chosen.name}>
          <h2>{chosen.name}</h2>
          {chosen.unlocks && <p>{chosen.unlocks}</p>}
          {(chosen.needs ?? []).length > 0 && (
            <>
              <p className="coach-whole-map__first">Needs first:</p>
              <div className="coach-whole-map__needs">
                {(chosen.needs ?? []).map((need) => (
                  <button key={need} type="button" className="coach-link" onClick={() => select(need, true)}>
                    {byId.get(need)?.name ?? need}
                  </button>
                ))}
              </div>
            </>
          )}
          {data.goal === chosen.id && data.route.length > 0 && (
            <>
              <p className="coach-whole-map__first">The way there:</p>
              <ol className="coach-whole-map__route" data-testid="coach-whole-map-route">
                {data.route.map((id) => (
                  <li key={id}>
                    <button type="button" className="coach-link" onClick={() => select(id, true)}>
                      {byId.get(id)?.name ?? id}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          {data.goal === chosen.id && data.reached && <p data-testid="coach-whole-map-reached">{REACHED}</p>}
          {chosen.destination &&
            (data.goal === chosen.id ? (
              <button type="button" onClick={() => void setGoal(null)} disabled={saving}>
                Clear my goal
              </button>
            ) : (
              <button type="button" className="coach-button coach-button--primary" onClick={() => void setGoal(chosen.id)} disabled={saving}>
                Make this my goal
              </button>
            ))}
          {saveError && <p role="alert">{NOT_SAVED}</p>}
          <button type="button" className="coach-whole-map__panel-close" aria-label="Close this station" title="Close this station" onClick={() => setSelected(null)}>
            ×
          </button>
        </aside>
      )}
    </dialog>
  );
}
