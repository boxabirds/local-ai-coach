"use client";

import { useEffect, useRef, useState } from "react";
import { CoachCard, useArrivalScroll } from "./card";

/**
 * The V1 line of the map: the story's destination and the three lessons, in
 * reading order. There is no earlier map artwork in the repo to port, so this is
 * a plain SVG line; the 139-station map is later work.
 *
 * Two facts per station, on separate visual channels (Ceetrix story 5):
 * - criticality, fixed by the curriculum: colour and shape together (grey circle,
 *   amber diamond, red triangle with "!") plus a word in the key;
 * - the learner's progress: how full the marker is, plus a word. Progress never
 *   changes a marker's colour or shape.
 */

export type Criticality = "grey" | "amber" | "red";
export type MapStation = { id: string; name: string; status: string; criticality?: Criticality };

/** Shown before the coach has sent a snapshot. Names and ratings match curriculum/stations.json. */
export const DEFAULT_STATIONS: MapStation[] = [
  { id: "d_legal", name: "Private legal drafting", status: "unseen", criticality: "red" },
  { id: "machine", name: "What can my computer do?", status: "unseen", criticality: "amber" },
  { id: "localchat", name: "Local chat", status: "unseen", criticality: "grey" },
  { id: "prove", name: "Is my chat app talking to anyone else?", status: "unseen", criticality: "red" },
  { id: "accountable", name: "You're accountable", status: "unseen", criticality: "red" },
  { id: "trust", name: "Decide what you trust", status: "unseen", criticality: "amber" },
];

const DEFAULT_CRITICALITY: Record<string, Criticality | undefined> = Object.fromEntries(
  DEFAULT_STATIONS.map((station) => [station.id, station.criticality]),
);

export const STATUS_WORD: Record<string, string> = {
  unseen: "not started",
  read: "read",
  rehearsed: "practised",
  reported: "you told me",
  assisted: "done for you",
  verified: "checked",
  skipped: "skipped",
};

/** The book's words for each criticality (panel/authoring-policy.md, principle 11). */
export const CRITICALITY_WORD: Record<Criticality, string> = {
  grey: "press go",
  amber: "know what it does",
  red: "must understand",
};

const FILL: Record<string, number> = {
  unseen: 0,
  read: 0.25,
  rehearsed: 0.25,
  reported: 0.5,
  assisted: 0.5,
  verified: 1,
  skipped: 0,
};

/** How full a marker is for a progress status: 0, a quarter, a half or full. */
export function progressFill(status: string): number {
  return FILL[status] ?? 0;
}

const STEP_X = 160;
/** Half the widest station name at 13px, so end labels are never clipped. */
const PAD_X = 100;
const LINE_Y = 40;
/** Half the marker's height; every shape fits a box of this half-size. */
const R = 15;
const NAME_DY = 38;
/** A station name longer than this wraps onto a second line, so neighbours never overlap. */
const MAX_NAME_CHARS = 18;
const NAME_LINE = 16;
const STATUS_DY = 74;
const KEY_Y = 148;
const KEY_GAP = 190;
const KEY_MARK = 7;
const HEIGHT = 168;

/** One line, or two split at the space nearest the middle. */
export function nameLines(name: string): string[] {
  if (name.length <= MAX_NAME_CHARS || !name.includes(" ")) return [name];
  const spaces = [...name].flatMap((ch, i) => (ch === " " ? [i] : []));
  const cut = spaces.reduce((best, i) => (Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best));
  return [name.slice(0, cut), name.slice(cut + 1)];
}

function shapePath(criticality: Criticality | undefined, x: number, y: number, r: number): string {
  if (criticality === "amber") return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
  if (criticality === "red") return `M ${x} ${y - r} L ${x + r * 1.1} ${y + r * TRIANGLE_BASE} L ${x - r * 1.1} ${y + r * TRIANGLE_BASE} Z`;
  // grey, or unrated: a circle
  return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

/** Top and bottom of each shape around its centre y, so a fill fraction means the same visible share. */
const TRIANGLE_BASE = 0.85;
function shapeBounds(criticality: Criticality | undefined, y: number, r: number): { top: number; bottom: number } {
  if (criticality === "red") return { top: y - r, bottom: y + r * TRIANGLE_BASE };
  return { top: y - r, bottom: y + r };
}

function critClass(criticality: Criticality | undefined): string {
  return criticality ? `coach-crit coach-crit--${criticality}` : "coach-crit coach-crit--none";
}

function Marker({ station, x, focus }: { station: MapStation; x: number; focus: boolean }) {
  const { id, status, criticality } = station;
  const fill = progressFill(status);
  const { top, bottom } = shapeBounds(criticality, LINE_Y, R);
  const height = bottom - top;
  const filled = height * fill;
  const clipId = `coach-map-clip-${id}`;
  const path = shapePath(criticality, x, LINE_Y, R);
  return (
    <g
      data-station={id}
      data-status={status}
      data-criticality={criticality ?? "none"}
      data-fill={fill}
      role="img"
      aria-label={`${station.name}: ${criticality ? CRITICALITY_WORD[criticality] : "not rated"}, ${STATUS_WORD[status] ?? status}`}
    >
      <clipPath id={clipId}>
        <path d={path} />
      </clipPath>
      <path d={path} className="coach-map__paper" />
      <rect
        x={x - 2 * R}
        y={top + height - filled}
        width={4 * R}
        height={filled}
        clipPath={`url(#${clipId})`}
        className={`coach-map__fill ${critClass(criticality)}`}
        data-testid="coach-map-fill"
      />
      <path
        d={path}
        className={`coach-map__outline ${critClass(criticality)}${status === "skipped" ? " coach-map__outline--skipped" : ""}${focus ? " coach-map__outline--focus" : ""}`}
        data-testid="coach-map-outline"
      />
      {criticality === "red" && (
        <text x={x} y={LINE_Y + R * 0.6} textAnchor="middle" className="coach-map__alert" aria-hidden="true">
          !
        </text>
      )}
    </g>
  );
}

function KeyItem({ criticality, x }: { criticality: Criticality; x: number }) {
  return (
    <g data-key={criticality}>
      <path d={shapePath(criticality, x, KEY_Y - 4, KEY_MARK)} className={`coach-map__outline coach-map__outline--key ${critClass(criticality)}`} />
      <text x={x + KEY_MARK * 2} y={KEY_Y} className="coach-map__key">
        {CRITICALITY_WORD[criticality]}
      </text>
    </g>
  );
}

/** The map itself, drawn once and used both in the card and full screen. */
function MapDrawing({ list, focus, label }: { list: MapStation[]; focus?: string; label: string }) {
  const width = PAD_X * 2 + STEP_X * (list.length - 1);
  const keyStart = width / 2 - KEY_GAP * 1.25;
  return (
    <svg className="coach-map" viewBox={`0 0 ${width} ${HEIGHT}`} role="group" aria-label={label}>
      <line x1={PAD_X} y1={LINE_Y} x2={width - PAD_X} y2={LINE_Y} className="coach-map__line" />
      {list.map((station, i) => {
        const x = PAD_X + STEP_X * i;
        return (
          <g key={station.id}>
            <Marker station={station} x={x} focus={station.id === focus} />
            <text x={x} y={LINE_Y + NAME_DY} textAnchor="middle" className="coach-map__name">
              {nameLines(station.name).map((line, n) => (
                <tspan key={n} x={x} dy={n === 0 ? 0 : NAME_LINE}>
                  {line}
                </tspan>
              ))}
            </text>
            <text x={x} y={LINE_Y + STATUS_DY} textAnchor="middle" className="coach-map__status">
              {station.status === "verified" ? `✓ ${STATUS_WORD.verified}` : (STATUS_WORD[station.status] ?? station.status)}
            </text>
          </g>
        );
      })}
      <g data-testid="coach-map-key" aria-label="Key: circle, press go. Diamond, know what it does. Triangle, must understand.">
        {(["grey", "amber", "red"] as const).map((criticality, i) => (
          <KeyItem key={criticality} criticality={criticality} x={keyStart + KEY_GAP * i} />
        ))}
      </g>
    </svg>
  );
}

/**
 * The same map, as large as the screen allows (Ceetrix story 15). A native modal dialog:
 * Close, Escape or a click outside the map closes it; a click on the map itself doesn't.
 */
function MapLightbox({ list, focus, onClose }: { list: MapStation[]; focus?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    // Browsers without modal dialogs still show it, just without dimming the page.
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }, []);
  return (
    <dialog
      ref={dialog}
      className="coach-map-lightbox"
      aria-labelledby="coach-map-lightbox-title"
      data-testid="coach-map-lightbox"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="coach-map-lightbox__frame">
        <div className="coach-map-lightbox__head">
          <h2 id="coach-map-lightbox-title" className="coach-map-lightbox__title">
            Your map
          </h2>
          <button type="button" className="coach-button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <MapDrawing list={list} focus={focus} label="Your map, full screen" />
      </div>
    </dialog>
  );
}

export function TubeMap({ stations = DEFAULT_STATIONS, focus }: { stations?: MapStation[]; focus?: string }) {
  // Snapshots saved before criticality was added lack it; the V1 stations' ratings are known.
  const list = (stations.length ? stations : DEFAULT_STATIONS).map((station) =>
    station.criticality ? station : { ...station, criticality: DEFAULT_CRITICALITY[station.id] },
  );
  const { cardRef } = useArrivalScroll();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Focus goes back to Full screen once the lightbox has gone: focusing earlier loses out to
  // the browser, which moves focus when an open modal dialog is removed.
  useEffect(() => {
    if (wasOpen.current && !open) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const close = () => setOpen(false);
  return (
    <CoachCard label="Your map" testId="coach-map" cardRef={cardRef}>
      {/* Clicking the map opens it large; keyboard users have the button. The wrapper is a
          control, so a click here never starts an Ask about this quote. */}
      <div className="coach-map__open" data-ask-control onClick={() => setOpen(true)} data-testid="coach-map-drawing">
        <MapDrawing list={list} focus={focus} label="Your map" />
      </div>
      <div className="coach-map__actions">
        <button ref={opener} type="button" className="coach-link" onClick={() => setOpen(true)}>
          Full screen
        </button>
      </div>
      {open ? <MapLightbox list={list} focus={focus} onClose={close} /> : null}
    </CoachCard>
  );
}
