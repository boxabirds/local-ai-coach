/**
 * A figure for the coach (Ceetrix story 7), read from the local agent
 * (`GET /curriculum/figure/{id}` in apps/agent/main.py): its words, choices and
 * SVG as JSON. The agent decides which ids exist; this route only refuses ids
 * that could not be one, without asking the agent.
 */

const AGENT_URL = process.env.COACH_AGENT_URL ?? "http://127.0.0.1:8123";
const FIGURE_ID = /^[a-z0-9-]{1,64}$/;
const TIMEOUT_MS = 5000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!FIGURE_ID.test(id)) return Response.json({}, { status: 404 });
  try {
    const upstream = await fetch(`${AGENT_URL}/curriculum/figure/${id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!upstream.ok) return Response.json({}, { status: upstream.status === 404 ? 404 : 502 });
    return Response.json(await upstream.json(), { status: 200 });
  } catch {
    return Response.json({}, { status: 502 });
  }
}
