import { CoachCard } from "./card";

/**
 * The V1 line of the map: the story's destination and the three lessons, in
 * reading order. There is no earlier map artwork in the repo to port, so this is
 * a plain SVG line; the 139-station map is later work.
 */

export type MapStation = { id: string; name: string; status: string };

/** Shown before the coach has sent a snapshot. Names match curriculum/stations.json. */
export const DEFAULT_STATIONS: MapStation[] = [
  { id: "d_legal", name: "Private legal drafting", status: "unseen" },
  { id: "machine", name: "Know your machine", status: "unseen" },
  { id: "localchat", name: "Local chat", status: "unseen" },
  { id: "prove", name: "Prove it stays local", status: "unseen" },
];

export const STATUS_WORD: Record<string, string> = {
  unseen: "not started",
  read: "read",
  rehearsed: "practised",
  reported: "you told me",
  assisted: "done for you",
  verified: "checked",
  skipped: "skipped",
};

const STEP_X = 160;
const PAD_X = 60;
const LINE_Y = 40;
const RADIUS = 14;
const HEIGHT = 120;

export function TubeMap({ stations = DEFAULT_STATIONS, focus }: { stations?: MapStation[]; focus?: string }) {
  const list = stations.length ? stations : DEFAULT_STATIONS;
  const width = PAD_X * 2 + STEP_X * (list.length - 1);
  return (
    <CoachCard label="Your map" testId="coach-map">
      <svg
        className="coach-map"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={list.map((s) => `${s.name}: ${STATUS_WORD[s.status] ?? s.status}`).join(". ")}
      >
        <line x1={PAD_X} y1={LINE_Y} x2={width - PAD_X} y2={LINE_Y} className="coach-map__line" />
        {list.map((station, i) => {
          const x = PAD_X + STEP_X * i;
          return (
            <g key={station.id} data-station={station.id} data-status={station.status}>
              <circle
                cx={x}
                cy={LINE_Y}
                r={RADIUS}
                className={`coach-map__stop coach-map__stop--${station.status}${station.id === focus ? " coach-map__stop--focus" : ""}`}
              />
              <text x={x} y={LINE_Y + 36} textAnchor="middle" className="coach-map__name">
                {station.name}
              </text>
              <text x={x} y={LINE_Y + 56} textAnchor="middle" className="coach-map__status">
                {STATUS_WORD[station.status] ?? station.status}
              </text>
            </g>
          );
        })}
      </svg>
    </CoachCard>
  );
}
