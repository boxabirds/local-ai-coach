#!/usr/bin/env node
/**
 * Lay out the whole map as a tube map (Ceetrix stories 29, 30 and 33): read a curriculum folder's
 * stations.json and write map-layout.json beside it. The layout is ported from Julian's design,
 * curriculum/local-ai-tube-map.html: one track per area, each station to the right of what it
 * needs on that track, forks onto branch rows below, destinations in a column on the right, and
 * octilinear links (straight runs, rounded corners). The coach draws it in its own style. Run by
 * `make map-layout`; the output is committed and checked by curriculum/validate.py (MAP_LAYOUT).
 * Deterministic: the same stations.json gives the same file.
 *
 * Story 33: every link has lanes of its own. A link that leaves its row runs along its source's
 * row into the channel after the source's column, takes its own vertical lane there to the gap
 * beside its target's row, takes its own horizontal lane in that gap to the target's column, and
 * drops into the target. Channels and gaps are as wide as the lanes they carry, so no two links
 * run on top of each other however many stations the map has.
 *
 *   node apps/app/scripts/layout-map.mjs <curriculum folder> [...more folders]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LAYOUT_FILE = "map-layout.json";
const VERSION = 2;
// Geometry, as in the design file (its row labels are gone, so the left margin is smaller).
const X0 = 90;
/** The narrowest step from one column to the next, and from one row to the next. */
const DX = 122;
const Y0 = 70;
const SUB = 70;
/** Extra room between one area's rows and the next area's. */
const GAP = 30;
/** How far past the deepest station the destinations' column stands, at least, in columns. */
const DEST_GAP_COLS = 1.6;
const RIGHT_PAD = 90;
const BOTTOM_PAD = 40;
/** Rounded corners on links. */
const CORNER = 12;
/** Distance between two lanes side by side: more than the widest line (6), so they never touch. */
export const LANE_PITCH = 9;
/** Half a two-line label's width: a channel's lanes stay clear of the labels either side. */
const LABEL_HALF = 56;
/** Room inside a channel before its first lane and after its last. */
const CHANNEL_MARGIN = 10;
/** A gap's lanes start below the label of the row above, and stop short of the row below. */
const LABEL_CLEAR = 46;
const ABOVE_CLEAR = 22;
/** A station name longer than this goes on two lines (destinations stay on one). */
export const LABEL_CHARS = 15;

const r1 = (n) => Math.round(n * 10) / 10;

export function labelLines(name, dest) {
  if (dest || name.length <= LABEL_CHARS) return [name];
  const words = name.split(" ");
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean);
}

/**
 * Lanes for intervals that must not share one: first fit, in a stable order. Each item is
 * { lo, hi, key }; returns how many lanes were used and sets item.lane.
 */
function assignLanes(items) {
  const ends = [];
  const ordered = [...items].sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.key.localeCompare(b.key));
  for (const item of ordered) {
    let lane = ends.findIndex((end) => end < item.lo);
    if (lane === -1) lane = ends.push(item.hi) - 1;
    else ends[lane] = item.hi;
    item.lane = lane;
  }
  return ends.length;
}

/** An orthogonal polyline as an SVG path with rounded corners. */
function roundedPath(points) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const inLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const outLen = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
    const r = Math.min(CORNER, inLen / 2, outLen / 2);
    const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y);
    const vx = Math.sign(c.x - b.x), vy = Math.sign(c.y - b.y);
    const sweep = ux * vy - uy * vx > 0 ? 1 : 0;
    d += ` L${r1(b.x - ux * r)} ${r1(b.y - uy * r)} A${r1(r)} ${r1(r)} 0 0 ${sweep} ${r1(b.x + vx * r)} ${r1(b.y + vy * r)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${r1(last.x)} ${r1(last.y)}`;
}

export function layout(stationsJson) {
  const { areas, stations } = stationsJson;
  const node = Object.fromEntries(
    stations.map((s) => [s.id, { id: s.id, name: s.name, line: s.area, needs: [...(s.needs ?? [])], opt: [...(s.betterWith ?? [])], dest: Boolean(s.destination) }]),
  );
  for (const n of Object.values(node)) {
    for (const ref of [...n.needs, ...n.opt]) {
      if (!node[ref]) throw new Error(`${n.id} names ${ref}, which is not a station`);
    }
  }
  const all = stations.map((s) => node[s.id]);

  // Depth: the longest prerequisite chain.
  const depth = {};
  const dep = (id) => {
    if (depth[id] != null) return depth[id];
    const n = node[id];
    depth[id] = n.needs.length ? 1 + Math.max(...n.needs.map(dep)) : 0;
    return depth[id];
  };
  all.forEach((n) => dep(n.id));

  // Rows: one group per area. A station continues its first same-area parent's row the first time
  // that parent is continued; otherwise it opens a branch row below. Rows are numbered down the map.
  let rowCount = 0;
  /** Rows that start a new area, after the first: they get GAP more room above. */
  const areaStarts = new Set();
  for (const area of areas) {
    const row = all.filter((n) => n.line === area.id && !n.dest).sort((a, b) => depth[a.id] - depth[b.id]);
    let sub = 0;
    const taken = new Set();
    for (const n of row) {
      n.col = depth[n.id];
      const parent = n.needs.map((p) => node[p]).find((p) => p.line === area.id);
      if (parent && !taken.has(parent.id)) {
        n.sub = parent.sub;
        taken.add(parent.id);
      } else {
        n.sub = sub++;
      }
      n.row = rowCount + n.sub;
    }
    if (rowCount > 0) areaStarts.add(rowCount);
    rowCount += Math.max(1, sub);
  }

  // Destinations: a column after the deepest station, each on a row of its own, spread down the map
  // in area order (a row of its own: its last stretch never lies on another link's).
  const ordinary = all.filter((n) => !n.dest);
  const maxCol = ordinary.length ? Math.max(...ordinary.map((n) => n.col)) : 0;
  const destCol = maxCol + 1;
  const areaIndex = new Map(areas.map((a, i) => [a.id, i]));
  const dests = all.filter((n) => n.dest).sort((a, b) => (areaIndex.get(a.line) ?? 0) - (areaIndex.get(b.line) ?? 0));
  if (dests.length > rowCount) rowCount = dests.length;
  dests.forEach((n, i) => {
    n.col = destCol;
    n.row = dests.length > 1 ? Math.round((i * (rowCount - 1)) / (dests.length - 1)) : 0;
  });

  // Plan every link. Order along a channel: row r is 2r + 1, the gap below it 2r + 2 (gap -1 is
  // above the first row). Order along a gap: column c is 2c, the channel after it 2c + 1.
  const byRowCol = new Map(all.map((n) => [`${n.row}:${n.col}`, n]));
  const blocked = (a, b) => {
    const [lo, hi] = a.col < b.col ? [a.col, b.col] : [b.col, a.col];
    for (let c = lo + 1; c < hi; c++) if (byRowCol.has(`${a.row}:${c}`)) return true;
    return false;
  };
  const plans = [];
  for (const b of all) {
    for (const [p, kind] of [...b.needs.map((p) => [p, "need"]), ...b.opt.map((p) => [p, "better"])]) {
      const a = node[p];
      const plan = { a, b, kind, key: `${a.id}>${b.id}:${kind}` };
      if (a.row === b.row && a.col < b.col && !blocked(a, b)) {
        plan.straight = true;
      } else {
        // Down (or along a blocked row): the gap above the target. Up: the gap below its label.
        plan.side = b.row > a.row || b.row === a.row ? "down" : "up";
        plan.gap = plan.side === "down" ? b.row - 1 : b.row;
        plan.channel = a.col;
        const ends = [2 * a.row + 1, 2 * plan.gap + 2];
        plan.v = { lo: Math.min(...ends), hi: Math.max(...ends), key: plan.key };
        const across = [2 * a.col + 1, 2 * b.col];
        plan.h = { lo: Math.min(...across), hi: Math.max(...across), key: plan.key };
      }
      plans.push(plan);
    }
  }
  const routed = plans.filter((p) => !p.straight);
  const group = (keyOf) => {
    const groups = new Map();
    for (const p of routed) {
      const k = keyOf(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    return groups;
  };
  // One lane per source in a channel (its links branch off it, like a tube line forking) and one
  // lane per target in a gap (its links join it before arriving): a lane spans all its links.
  const shared = (list, owner, span) => {
    const lanes = new Map();
    for (const p of list) {
      const k = owner(p);
      const s = span(p);
      const lane = lanes.get(k);
      if (lane) {
        lane.lo = Math.min(lane.lo, s.lo);
        lane.hi = Math.max(lane.hi, s.hi);
      } else lanes.set(k, { lo: s.lo, hi: s.hi, key: k });
    }
    const count = assignLanes([...lanes.values()]);
    for (const p of list) span(p).lane = lanes.get(owner(p)).lane;
    return count;
  };
  const channelLanes = new Map();
  for (const [c, list] of group((p) => p.channel)) channelLanes.set(c, shared(list, (p) => p.a.id, (p) => p.v));
  const gapLanes = new Map();
  for (const [k, list] of group((p) => `${p.gap}:${p.side}`)) gapLanes.set(k, shared(list, (p) => p.b.id, (p) => p.h));

  // Columns: each step wide enough for its channel's lanes between the labels either side.
  const channelWidth = (c) => 2 * CHANNEL_MARGIN + Math.max(0, (channelLanes.get(c) ?? 0) - 1) * LANE_PITCH;
  const colX = [X0];
  for (let c = 0; c < destCol; c++) {
    const least = c === destCol - 1 ? DX * DEST_GAP_COLS : DX;
    colX.push(colX[c] + Math.max(least, 2 * LABEL_HALF + channelWidth(c)));
  }
  const channelLeft = (c) => {
    const right = c + 1 < colX.length ? colX[c + 1] : colX[c] + 2 * LABEL_HALF + channelWidth(c);
    return (colX[c] + right) / 2 - channelWidth(c) / 2 + CHANNEL_MARGIN;
  };

  // Rows: each step tall enough for the gap's lanes, below the labels and above the next row.
  const lanesIn = (g, side) => gapLanes.get(`${g}:${side}`) ?? 0;
  const gapHeight = (g) => LABEL_CLEAR + (lanesIn(g, "up") + lanesIn(g, "down")) * LANE_PITCH + ABOVE_CLEAR;
  const rowY = [Y0 + lanesIn(-1, "down") * LANE_PITCH];
  for (let r = 1; r < rowCount; r++) rowY.push(rowY[r - 1] + Math.max(SUB, gapHeight(r - 1)) + (areaStarts.has(r) ? GAP : 0));
  const upLaneY = (g, lane) => rowY[g] + LABEL_CLEAR + lane * LANE_PITCH;
  const downLaneY = (g, lane) => (g + 1 < rowCount ? rowY[g + 1] : rowY[g] + SUB) - ABOVE_CLEAR - lane * LANE_PITCH;

  for (const n of all) {
    n.x = colX[n.col];
    n.y = rowY[n.row];
  }

  const edges = [];
  const byPair = new Map(plans.map((p) => [p.key, p]));
  for (const b of all) {
    for (const [p, kind] of [...b.needs.map((p) => [p, "need"]), ...b.opt.map((p) => [p, "better"])]) {
      const plan = byPair.get(`${p}>${b.id}:${kind}`);
      const a = plan.a;
      let d;
      if (plan.straight) {
        d = `M${r1(a.x)} ${r1(a.y)} L${r1(b.x)} ${r1(b.y)}`;
      } else {
        const xv = channelLeft(plan.channel) + plan.v.lane * LANE_PITCH;
        const yl = plan.side === "up" ? upLaneY(plan.gap, plan.h.lane) : downLaneY(plan.gap, plan.h.lane);
        d = roundedPath([{ x: a.x, y: a.y }, { x: xv, y: a.y }, { x: xv, y: yl }, { x: b.x, y: yl }, { x: b.x, y: b.y }]);
      }
      const edgeKind = kind === "better" ? "better" : a.line === b.line && !b.dest ? "track" : "link";
      edges.push({ from: p, to: b.id, kind: edgeKind, area: b.line, d });
    }
  }

  const lastRow = rowY[rowY.length - 1];
  const out = {
    version: VERSION,
    generatedBy: "apps/app/scripts/layout-map.mjs (tube layout from curriculum/local-ai-tube-map.html)",
    width: r1(colX[destCol] + DX + RIGHT_PAD),
    height: r1(lastRow + Math.max(SUB, gapHeight(rowCount - 1)) + BOTTOM_PAD),
    stations: {},
    edges,
  };
  for (const n of [...all].sort((a, b) => a.id.localeCompare(b.id))) {
    out.stations[n.id] = { x: r1(n.x), y: r1(n.y), dest: n.dest, label: labelLines(n.name, n.dest) };
  }
  return out;
}

function main(folders) {
  if (!folders.length) throw new Error("usage: layout-map.mjs <curriculum folder> [...]");
  for (const folder of folders) {
    const dir = resolve(folder);
    const result = layout(JSON.parse(readFileSync(join(dir, "stations.json"), "utf8")));
    writeFileSync(join(dir, LAYOUT_FILE), `${JSON.stringify(result, null, 1)}\n`);
    console.log(`${join(dir, LAYOUT_FILE)}: ${Object.keys(result.stations).length} stations, ${result.edges.length} links, ${result.width}x${result.height}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
