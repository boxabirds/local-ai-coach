/**
 * How many ratings and notes aren't in a feedback file yet (Ceetrix story 34). A browser sends no
 * Origin on a same-origin GET, so fromTheCoach can't judge this one: like the keys' GET, it's a
 * read, refused only when the browser says another site asked. The agent refuses browsers itself.
 */
import { FORBIDDEN, agent, reply } from "@/lib/coach-routes";

const OUR_PAGE = "same-origin";

export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== OUR_PAGE) return reply({ error: "Only the coach itself can ask that." }, FORBIDDEN);
  return agent("/coach/feedback", "GET");
}
