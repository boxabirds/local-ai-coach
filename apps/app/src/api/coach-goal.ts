/**
 * The learner's goal on the whole map (Ceetrix story 29): a destination, or null to clear it. The
 * coach's own page only; the agent is asked without an Origin and keeps it in the progress record.
 */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";

const UNPROCESSABLE = 422;
const RECORD = process.env.COACH_STUB === "1" ? "?record=stub" : "";

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: "Only the coach itself can set a goal." }, FORBIDDEN);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "That isn't a destination on the map." }, UNPROCESSABLE);
  }
  return agent(`/coach/goal${RECORD}`, "POST", body);
}
