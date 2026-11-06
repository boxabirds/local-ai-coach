/**
 * Shared by the app's routes in front of the local agent's settings (stories 16 and 21).
 * Route files may only export HTTP handlers, so helpers live here.
 */

export const AGENT_URL = process.env.COACH_AGENT_URL ?? "http://127.0.0.1:8123";
export const FORBIDDEN = 403;
export const UNREACHABLE = 502;
const TIMEOUT_MS = 30_000;
const NO_AGENT = "I can't reach my agent, so nothing changed. Check the coach is running.";

export const reply = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The names this computer answers to; any other Host is a site rebound to us, not the coach. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The coach's own page: same origin, and the browser says so. Judged against the Host the
 * browser sent, because Next's dev server reports request.url as localhost whatever address
 * the page was opened at (a page at 127.0.0.1 was refused every save).
 */
export function fromTheCoach(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const host = request.headers.get("host");
  if (origin === null || host === null || site !== "same-origin") return false;
  let sent: URL;
  try {
    sent = new URL(origin);
  } catch {
    return false;
  }
  return sent.host === host && LOOPBACK_HOSTS.has(sent.hostname) && origin === sent.origin;
}

/** Ask the agent from the server side, which sends no Origin: that is how the agent knows it's us. */
export async function agent(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<Response> {
  try {
    const upstream = await fetch(`${AGENT_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return reply(await upstream.json(), upstream.status);
  } catch {
    return reply({ server: null, ok: false, error: NO_AGENT }, UNREACHABLE);
  }
}
