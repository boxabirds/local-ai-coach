/**
 * The feedback file (Ceetrix story 34): the agent puts every new rating, note and error in one
 * file, and the page hands it to the browser as a download. Nothing is sent anywhere.
 */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: "Only the coach itself can make that file." }, FORBIDDEN);
  return agent("/coach/feedback/file", "POST");
}
