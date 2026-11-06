/**
 * The whole map's viewport (Ceetrix story 29), as plain maths with no React: which part of the
 * map is on screen (a viewBox in map units), fitted, zoomed around a point, or moved.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
/** The part of the map on screen, in map units: an SVG viewBox. */
export type View = Box;

/** Room around the map when it is fitted, as a share of its size. */
export const FIT_MARGIN = 0.04;
/** Zoom limits, relative to the fitted view: from a little smaller than fit to eight times closer. */
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 8;
/** One press of zoom in or out. */
export const ZOOM_STEP = 1.4;

/** The whole map, centred, with the frame's proportions. */
export function fitView(box: Box, frame: Size): View {
  const w = box.w * (1 + 2 * FIT_MARGIN);
  const h = box.h * (1 + 2 * FIT_MARGIN);
  const aspect = frame.width > 0 && frame.height > 0 ? frame.width / frame.height : w / h;
  const vw = Math.max(w, h * aspect);
  const vh = vw / aspect;
  return { x: box.x + box.w / 2 - vw / 2, y: box.y + box.h / 2 - vh / 2, w: vw, h: vh };
}

/** How close the view is, relative to the fitted view (1 = fitted, 2 = twice as close). */
export function zoomOf(view: View, fitted: View): number {
  return fitted.w / view.w;
}

/**
 * Zoom by `factor` (above 1 closer) keeping `at` (map units) where it is on screen, within
 * MIN_ZOOM and MAX_ZOOM of the fitted view.
 */
export function zoomAt(view: View, factor: number, at: Point, fitted: View): View {
  const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomOf(view, fitted) * factor));
  const w = fitted.w / target;
  const h = (view.h / view.w) * w;
  const scale = w / view.w;
  return { x: at.x - (at.x - view.x) * scale, y: at.y - (at.y - view.y) * scale, w, h };
}

/** Move the view by a screen distance (pixels), dragging the map with the pointer. */
export function pan(view: View, dx: number, dy: number, frame: Size): View {
  const unit = frame.width > 0 ? view.w / frame.width : 1;
  return { ...view, x: view.x - dx * unit, y: view.y - dy * unit };
}

/** Centre the view on a point, keeping the zoom. */
export function centreOn(view: View, at: Point): View {
  return { ...view, x: at.x - view.w / 2, y: at.y - view.h / 2 };
}

/** A screen point (relative to the frame) in map units. */
export function toMap(view: View, frame: Size, screen: Point): Point {
  const unit = frame.width > 0 ? view.w / frame.width : 1;
  return { x: view.x + screen.x * unit, y: view.y + screen.y * unit };
}

/**
 * The first view: names at their real size (one map unit to one pixel), centred on where the
 * learner is. Fitting all of it at once made every name unreadable; Fit is a press away.
 */
export function startView(at: Point, frame: Size, fitted: View): View {
  const readable = { x: 0, y: 0, w: frame.width || fitted.w, h: frame.height || fitted.h };
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomOf(readable, fitted)));
  const w = fitted.w / zoom;
  const h = (fitted.h / fitted.w) * w;
  return centreOn({ x: 0, y: 0, w, h }, at);
}

/** The smallest box holding all of these boxes; null for none. */
export function boundsOf(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Frame a set of stations (the route to a goal), never closer than MAX_ZOOM of the whole map. */
export function frameBoxes(boxes: readonly Box[], frame: Size, fitted: View): View | null {
  const bounds = boundsOf(boxes);
  if (!bounds) return null;
  const view = fitView(bounds, frame);
  if (zoomOf(view, fitted) <= MAX_ZOOM) return view;
  return zoomAt(view, 1, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }, fitted);
}

/** How far past its edge the map may be moved, in map units. */
export const EDGE_MARGIN = 40;

/**
 * Keep the view on the map: never panned or zoomed out into blank space past its edges. A view
 * wider (or taller) than the map is centred on it in that direction.
 */
export function clampView(view: View, map: Box, margin = EDGE_MARGIN): View {
  const axis = (start: number, size: number, from: number, extent: number) => {
    if (size >= extent + 2 * margin) return from + extent / 2 - size / 2;
    return Math.min(Math.max(start, from - margin), from + extent + margin - size);
  };
  return { ...view, x: axis(view.x, view.w, map.x, map.w), y: axis(view.y, view.h, map.y, map.h) };
}

