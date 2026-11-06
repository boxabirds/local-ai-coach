/** Test connection for an OpenAI-compatible server and Jev (Ceetrix story 21); the coach's own page only. */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ ok: false, error: "Only the coach itself can test a server." }, FORBIDDEN);
  const body = await request.json().catch(() => ({}));
  return agent("/coach/provider/check", "POST", { base_url: body?.base_url, model: body?.model, key: body?.key, jev: body?.jev });
}
