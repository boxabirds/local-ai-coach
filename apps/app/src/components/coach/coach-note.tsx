"use client";

import { DEFAULT_STATIONS } from "./tube-map";

/**
 * What the learner sees when the coach uses one of its own tools (story 10):
 * one plain sentence for the ones that change or read something, nothing for
 * the coach's housekeeping. Raw tool names and arguments are never shown.
 */

/** Housekeeping: the learner already sees the result (the card, the check card). */
// user_navigated records a detour the learner can already see in the chat (story 19).
export const QUIET_TOOLS = new Set(["run_check", "user_navigated"]);

const STATUS_WORDS: Record<string, string> = {
  read: "read",
  reported: "done, on your word",
  verified: "checked",
  skipped: "skipped",
};

const PROBE_WORDS: Record<string, string> = {
  memory: "how much memory this computer has",
  process: "which model servers are running",
  listening: "what is listening on a port",
  model_file: "the model files in the usual folders",
  connections: "where the chat app is connected",
  tailnet: "the machines on your private link",
  history_has: "your recent shell commands",
};

function place(stationId?: string, stepId?: string): string {
  const station = DEFAULT_STATIONS.find((s) => s.id === stationId)?.name ?? stationId ?? "this station";
  const step = stepId?.split(".")[1];
  return step ? `${station}, step ${step}` : station;
}

/** The sentence for a tool, or null when the tool should stay quiet or is not the coach's. */
export function coachNoteText(name: string, args: Record<string, unknown> = {}): string | null {
  if (name === "set_progress") {
    const status = STATUS_WORDS[String(args.status)] ?? String(args.status ?? "");
    return `Saved: ${place(args.station_id as string, args.step_id as string | undefined)}, ${status}.`;
  }
  if (name === "probe") return `Looked at ${PROBE_WORDS[String(args.name)] ?? "this computer"}.`;
  if (name === "end_session") return "Saved a note of today's session.";
  return null;
}

export function CoachNote({ text, status }: { text: string; status?: string }) {
  return (
    <p className="coach-note" data-testid="coach-note" aria-busy={status !== "complete"}>
      {text}
    </p>
  );
}
