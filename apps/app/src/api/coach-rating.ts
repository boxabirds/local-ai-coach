/**
 * A rating of one of the coach's turns (Ceetrix story 26). The coach's own page only; the agent is
 * asked without an Origin, and writes the rating to this computer. Nothing is sent anywhere else.
 */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";
import { MAX_RATING_BYTES } from "@/lib/rating-limits";

const TOO_LARGE = 413;
const UNPROCESSABLE = 422;

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: "Only the coach itself can save a rating." }, FORBIDDEN);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_RATING_BYTES) return reply({ error: "That conversation is too long to keep as one rating." }, TOO_LARGE);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_RATING_BYTES) {
    return reply({ error: "That conversation is too long to keep as one rating." }, TOO_LARGE);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: "I couldn't read that rating." }, UNPROCESSABLE);
  }
  return agent("/coach/rating", "POST", body);
}
