/**
 * The OpenAI-compatible server the coach uses instead of OpenAI (Ceetrix story 21): read it,
 * save it, clear it. Only the coach's own page may save or clear; the agent refuses anything
 * that arrives with browser headers, and this route never forwards them.
 */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";

const NOT_OURS = "Only the coach itself can change the server.";

export async function GET() {
  return agent("/coach/provider", "GET");
}

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: NOT_OURS }, FORBIDDEN);
  const body = await request.json().catch(() => ({}));
  return agent("/coach/provider", "POST", { base_url: body?.base_url, model: body?.model });
}

export async function DELETE(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: NOT_OURS }, FORBIDDEN);
  return agent("/coach/provider", "DELETE");
}
