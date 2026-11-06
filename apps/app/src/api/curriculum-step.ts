/**
 * One lesson step, for the show_next_step card (Ceetrix story 19), read from the local agent
 * (`GET /curriculum/step/{station}/{step}` in apps/agent/main.py). The agent decides which
 * steps exist; this route only refuses ids that could not be one.
 */

const AGENT_URL = process.env.COACH_AGENT_URL ?? "http://127.0.0.1:8123";
const ID = /^[a-z0-9_.-]{1,64}$/;
const TIMEOUT_MS = 5000;

export async function GET(_req: Request, { params }: { params: Promise<{ station: string; step: string }> }) {
  const { station, step } = await params;
  if (!ID.test(station) || !ID.test(step)) return Response.json({}, { status: 404 });
  try {
    const upstream = await fetch(`${AGENT_URL}/curriculum/step/${station}/${step}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!upstream.ok) return Response.json({}, { status: upstream.status === 404 ? 404 : 502 });
    return Response.json(await upstream.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({}, { status: 502 });
  }
}
