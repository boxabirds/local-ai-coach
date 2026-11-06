"use client";

/**
 * What the learner sees when the coach uses one of its own tools (story 10):
 * one plain sentence when it reads this computer, nothing for the coach's
 * housekeeping (saving progress, closing a session, its own working-out).
 * Raw tool names and arguments are never shown.
 */

/** Housekeeping: the learner already sees the result (the card, the check card). */
// user_navigated records a detour the learner can already see in the chat (story 19).
// The agent framework's own tools (deepagents: reading its skills, planning) are the coach's
// working-out, not something the learner did; they showed as a raw "read_file" row.
const FRAMEWORK_TOOLS = ["read_file", "ls", "glob", "grep", "write_file", "edit_file", "write_todos", "task", "execute"];
// Saving progress and closing a session are bookkeeping too: "Saved: ..., step 3, done, on your
// word." was the coach narrating itself (Julian, 2026-11-06; CLAUDE.md, no explanatory metadata).
export const QUIET_TOOLS = new Set(["run_check", "user_navigated", "set_progress", "end_session", ...FRAMEWORK_TOOLS]);

const PROBE_WORDS: Record<string, string> = {
  memory: "how much memory this computer has",
  process: "which model servers are running",
  listening: "what is listening on a port",
  model_file: "the model files in the usual folders",
  connections: "where the chat app is connected",
  tailnet: "the machines on your private link",
  history_has: "your recent shell commands",
};

/** The sentence for a tool, or null when the tool should stay quiet or is not the coach's. */
export function coachNoteText(name: string, args: Record<string, unknown> = {}): string | null {
  if (name === "probe") return `Looked at ${PROBE_WORDS[String(args.name)] ?? "this computer"}.`;
  return null;
}

export function CoachNote({ text, status }: { text: string; status?: string }) {
  return (
    <p className="coach-note" data-testid="coach-note" aria-busy={status !== "complete"}>
      {text}
    </p>
  );
}
