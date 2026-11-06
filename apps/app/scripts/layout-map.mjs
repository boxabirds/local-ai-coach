#!/usr/bin/env node
/**
 * Lay out the whole map as a tube map (Ceetrix stories 29 and 30): read a curriculum folder's
 * stations.json and write map-layout.json beside it. The layout is ported from Julian's design,
 * curriculum/local-ai-tube-map.html: one track per area, each station to the right of what it
 * needs on that track, forks onto branch rows below, destinations in a column on the right, and
 * octilinear links (straight runs, rounded corners). The coach draws it in its own style. Run by
 * `make map-layout`; the output is committed and checked by curriculum/validate.py (MAP_LAYOUT).
 * Deterministic: the same stations.json gives the same file.
 *
 *   node apps/app/scripts/layout-map.mjs <curriculum folder> [...more folders]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LAYOUT_FILE = "map-layout.json";
const VERSION = 2;
// Geometry, as in the design file (its row labels are gone, so the left margin is smaller).
const X0 = 90;
const DX = 122;
const Y0 = 70;
const SUB = 70;
const GAP = 30;
/** How far past the deepest station the destinations' column stands, in columns. */
const DEST_GAP_COLS = 1.6;
const RIGHT_PAD = 90;
/** Rounded corners on links. */
const CORNER = 12;
/** Siblings leaving one station share its channel, this far apart. */
const LANE_SPREAD = 5;
/** Where a link runs along the target's row: above it going down, below its label going up. */
const LANE_ABOVE = 22;
const LANE_BELOW = 46;
/** A station name longer than this goes on two lines (destinations stay on one). */
export const LABEL_CHARS = 15;

const r1 = (n) => Math.round(n * 10) / 10;

export function labelLines(name, dest) {
  if (dest || name.length <= LABEL_CHARS) return [name];
  const words = name.split(" ");
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean);
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
  // that parent is continued; otherwise it opens a branch row below.
  let yCursor = Y0;
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
      n.x = X0 + n.col * DX;
      n.y = yCursor + n.sub * SUB;
    }
    yCursor += Math.max(1, sub) * SUB + GAP;
  }

  // Destinations: a column after the deepest station, spread down the map in area order.
  const maxCol = Math.max(...all.filter((n) => !n.dest).map((n) => n.col));
  const destCol = maxCol + DEST_GAP_COLS;
  const areaIndex = new Map(areas.map((a, i) => [a.id, i]));
  const dests = all.filter((n) => n.dest).sort((a, b) => (areaIndex.get(a.line) ?? 0) - (areaIndex.get(b.line) ?? 0));
  const span = yCursor - GAP - Y0 - SUB;
  dests.forEach((n, i) => {
    n.col = destCol;
    n.x = X0 + destCol * DX;
    n.y = Y0 + (dests.length > 1 ? (i * span) / (dests.length - 1) : 0);
  });

  // Links: octilinear, each sibling leaving a station in its own lane of that station's channel.
  const channel = {};
  for (const n of all) for (const p of [...n.needs, ...n.opt]) (channel[p] ??= []).push(n.id);
  for (const list of Object.values(channel)) list.sort((x, y) => node[x].y - node[y].y);
  const octo = (a, b) => {
    if (a.y === b.y) return `M${r1(a.x)} ${r1(a.y)} L${r1(b.x)} ${r1(b.y)}`;
    const list = channel[a.id] ?? [];
    const k = list.indexOf(b.id);
    const off = (k - (list.length - 1) / 2) * LANE_SPREAD;
    const c = CORNER;
    const dir = b.y > a.y ? 1 : -1;
    const xv = a.x + DX * 0.5 + off;
    const lane = dir > 0 ? b.y - LANE_ABOVE : b.y + LANE_BELOW;
    const sw = dir > 0 ? 1 : 0;
    if (Math.abs(lane - a.y) <= 2 * c) {
      return `M${r1(a.x)} ${r1(a.y)} L${r1(b.x - c)} ${r1(a.y)} A${c} ${c} 0 0 ${sw} ${r1(b.x)} ${r1(a.y + dir * c)} L${r1(b.x)} ${r1(b.y)}`;
    }
    return (
      `M${r1(a.x)} ${r1(a.y)} L${r1(xv - c)} ${r1(a.y)} A${c} ${c} 0 0 ${sw} ${r1(xv)} ${r1(a.y + dir * c)} ` +
      `L${r1(xv)} ${r1(lane - dir * c)} A${c} ${c} 0 0 ${1 - sw} ${r1(xv + c)} ${r1(lane)} ` +
      `L${r1(b.x - c)} ${r1(lane)} A${c} ${c} 0 0 ${sw} ${r1(b.x)} ${r1(lane + dir * c)} L${r1(b.x)} ${r1(b.y)}`
    );
  };

  const edges = [];
  for (const b of all) {
    for (const p of b.needs) {
      const a = node[p];
      edges.push({ from: p, to: b.id, kind: a.line === b.line && !b.dest ? "track" : "link", area: b.line, d: octo(a, b) });
    }
    for (const p of b.opt) edges.push({ from: p, to: b.id, kind: "better", area: b.line, d: octo(node[p], b) });
  }

  const out = {
    version: VERSION,
    generatedBy: "apps/app/scripts/layout-map.mjs (tube layout from curriculum/local-ai-tube-map.html)",
    width: r1(X0 + (destCol + 1) * DX + RIGHT_PAD),
    height: r1(yCursor),
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
