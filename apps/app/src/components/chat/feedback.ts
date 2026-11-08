/**
 * Send feedback (Ceetrix story 34): the page's side of notes, the unsent count and the feedback
 * file. The file is handed to the browser as a download; the tester sends it themselves.
 */
export const NOTE_URL = "/api/coach-note";
export const FEEDBACK_URL = "/api/coach-feedback";
export const FEEDBACK_FILE_URL = "/api/coach-feedback-file";
export type Coach = "stub" | "model";
export type Outcome = { ok: true } | { ok: false; error: string };
export type FileOutcome = { ok: true; filename: string } | { ok: false; error: string };

const NO_AGENT = "I can't reach my agent. Check the coach is still running, then try again.";
const NOTE_NOT_KEPT = "I couldn't keep that note.";
const NO_FILE = "I couldn't put your feedback in a file.";
const JSON_INDENT = 2;

async function errorOf(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : fallback;
}

/** How many ratings and notes aren't in a file yet; null when the agent can't say. */
export async function unsentCount(get: typeof fetch = fetch): Promise<number | null> {
  try {
    const response = await get(FEEDBACK_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { unsent?: unknown };
    return typeof body.unsent === "number" ? body.unsent : null;
  } catch {
    return null;
  }
}

export async function keepNote(threadId: string, note: string, coach: Coach, messages: readonly unknown[]): Promise<Outcome> {
  try {
    const response = await fetch(NOTE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, note, coach, messages }),
    });
    return response.ok ? { ok: true } : { ok: false, error: await errorOf(response, NOTE_NOT_KEPT) };
  } catch {
    return { ok: false, error: NO_AGENT };
  }
}

/** Hand the file to the browser as a download, under its own name. */
export function download(file: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, JSON_INDENT)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveFeedbackFile(): Promise<FileOutcome> {
  try {
    const response = await fetch(FEEDBACK_FILE_URL, { method: "POST", cache: "no-store" });
    if (!response.ok) return { ok: false, error: await errorOf(response, NO_FILE) };
    const body = (await response.json()) as { filename?: unknown; file?: unknown };
    if (typeof body.filename !== "string" || body.file === undefined) return { ok: false, error: NO_FILE };
    download(body.file, body.filename);
    return { ok: true, filename: body.filename };
  } catch {
    return { ok: false, error: NO_AGENT };
  }
}
