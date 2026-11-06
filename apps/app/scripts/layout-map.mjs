#!/usr/bin/env node
/**
 * Lay out the whole map (Ceetrix story 29): read a curriculum folder's stations.json and write
 * map-layout.json beside it, with every station's place and every "needs" link's path. Run by
 * `make map-layout`; the output is committed so the coach (and later the book) draw the same map
 * and the author can adjust it. Deterministic: the same stations.json gives the same file.
 *
 *   node apps/app/scripts/layout-map.mjs <curriculum folder> [...more folders]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ELK from "elkjs/lib/elk.bundled.js";

const LAYOUT_FILE = "map-layout.json";
/** A station's box: a dot with its name beside it. */
const DOT_PX = 16;
const CHAR_PX = 7;
const NAME_PAD_PX = 12;
const MAX_NAME_PX = 220;
const ROW_PX = 28;
const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.spacing.nodeNodeBetweenLayers": "90",
  "elk.spacing.nodeNode": "14",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
  "elk.randomSeed": "1",
};

const round = (n) => Math.round(n);

function boxWidth(name) {
  return Math.min(DOT_PX + NAME_PAD_PX + name.length * CHAR_PX, MAX_NAME_PX);
}

export async function layout(stationsJson) {
  const { areas, stations } = stationsJson;
  const ids = new Set(stations.map((s) => s.id));
  for (const s of stations) {
    for (const need of s.needs ?? []) {
      if (!ids.has(need)) throw new Error(`${s.id} needs ${need}, which is not a station`);
    }
  }
  // Areas in their listed order, so each area's stations sit together.
  const areaOrder = new Map(areas.map((a, i) => [a.id, i]));
  const ordered = [...stations].sort(
    (a, b) => (areaOrder.get(a.area) ?? 0) - (areaOrder.get(b.area) ?? 0) || stations.indexOf(a) - stations.indexOf(b),
  );
  const graph = {
    id: "map",
    layoutOptions: OPTIONS,
    children: ordered.map((s) => ({ id: s.id, width: boxWidth(s.name), height: ROW_PX })),
    edges: ordered.flatMap((s) => (s.needs ?? []).map((need) => ({ id: `${need}>${s.id}`, sources: [need], targets: [s.id] }))),
  };
  const placed = await new ELK().layout(graph);
  const out = { generatedBy: "apps/app/scripts/layout-map.mjs (elkjs layered)", width: round(placed.width), height: round(placed.height), stations: {}, edges: [] };
  for (const node of [...placed.children].sort((a, b) => a.id.localeCompare(b.id))) {
    out.stations[node.id] = { x: round(node.x), y: round(node.y), w: round(node.width), h: round(node.height) };
  }
  for (const edge of [...placed.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const section = edge.sections?.[0];
    const points = section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => [round(p.x), round(p.y)]) : [];
    out.edges.push({ from: edge.sources[0], to: edge.targets[0], points });
  }
  return out;
}

async function main(folders) {
  if (!folders.length) throw new Error("usage: layout-map.mjs <curriculum folder> [...]");
  for (const folder of folders) {
    const dir = resolve(folder);
    const result = await layout(JSON.parse(readFileSync(join(dir, "stations.json"), "utf8")));
    writeFileSync(join(dir, LAYOUT_FILE), `${JSON.stringify(result, null, 1)}\n`);
    console.log(`${join(dir, LAYOUT_FILE)}: ${Object.keys(result.stations).length} stations, ${result.edges.length} links, ${result.width}x${result.height}`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
