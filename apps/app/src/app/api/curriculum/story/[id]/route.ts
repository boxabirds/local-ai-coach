/**
 * Story text for the story card, read from the local agent
 * (`GET /curriculum/story/{id}` in apps/agent/main.py). The agent decides which
 * ids exist; this route only refuses ids that could not be one.
 */

const AGENT_URL = process.env.COACH_AGENT_URL ?? "http://127.0.0.1:8123";
const STORY_ID = /^[a-z0-9-]{1,64}$/;
const TIMEOUT_MS = 5000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!STORY_ID.test(id)) return new Response("", { status: 404 });
  try {
    const upstream = await fetch(`${AGENT_URL}/curriculum/story/${id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!upstream.ok) return new Response("", { status: upstream.status === 404 ? 404 : 502 });
    return new Response(await upstream.text(), {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return new Response("", { status: 502 });
  }
}
