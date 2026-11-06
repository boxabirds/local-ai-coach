/**
 * Restart coach (Ceetrix story 23): the agent moves the learner's progress and permission into
 * a dated backup. The coach's own page only; the agent is asked without an Origin.
 */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: "Only the coach itself can restart." }, FORBIDDEN);
  return agent("/coach/restart", "POST");
}
