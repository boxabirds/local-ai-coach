/**
 * Saved API keys (Ceetrix story 16): ask whether keys are saved, save them, forget them.
 *
 * The keys live with the local agent (the macOS Keychain on a Mac), never in the browser.
 * This route is the only way the browser reaches them, and it only lets the coach's own
 * page save or forget: a request from any other site is refused before the agent is asked.
 * The agent refuses anything that arrives with browser headers, and this route never
 * forwards them. No response ever contains a key.
 */

import { fromTheCoach } from "@/lib/coach-routes";

const AGENT_URL = process.env.COACH_AGENT_URL ?? "http://127.0.0.1:8123";
const TIMEOUT_MS = 10_000;
const FORBIDDEN = 403;
const UNREACHABLE = 502;
const NOT_OURS = "Only the coach itself can change your keys.";
const NO_AGENT = "I can't reach my agent, so nothing changed. Check the coach is running.";

const reply = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function agent(method: "GET" | "POST" | "DELETE", body?: string): Promise<Response> {
  try {
    // A server-side fetch sends no Origin, which is how the agent knows it's us.
    const upstream = await fetch(`${AGENT_URL}/coach/keys`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await upstream.json();
    // Pass on only the fields the agent's contract defines.
    const out: Record<string, unknown> = { saved: data?.saved === true, where: typeof data?.where === "string" ? data.where : null };
    if (typeof data?.error === "string") out.error = data.error;
    return reply(out, upstream.status);
  } catch {
    return reply({ saved: false, where: null, error: NO_AGENT }, UNREACHABLE);
  }
}

export async function GET() {
  return agent("GET");
}

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: NOT_OURS }, FORBIDDEN);
  let keys: { openai?: unknown; jev?: unknown };
  try {
    keys = await request.json();
  } catch {
    keys = {};
  }
  return agent("POST", JSON.stringify({ openai: keys.openai, jev: keys.jev }));
}

export async function DELETE(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: NOT_OURS }, FORBIDDEN);
  return agent("DELETE");
}
