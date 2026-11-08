/**
 * A tester's note about the coach (Ceetrix story 34), with the conversation on screen. The coach's
 * own page only; the agent is asked without an Origin and keeps it on this computer.
 */
import { FORBIDDEN, agent, fromTheCoach, reply } from "@/lib/coach-routes";
import { MAX_RATING_BYTES } from "@/lib/rating-limits";

const TOO_LARGE = 413;
const UNPROCESSABLE = 422;
const TOO_LONG = "That conversation is too long to keep with a note.";

export async function POST(request: Request) {
  if (!fromTheCoach(request)) return reply({ error: "Only the coach itself can keep a note." }, FORBIDDEN);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_RATING_BYTES) return reply({ error: TOO_LONG }, TOO_LARGE);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_RATING_BYTES) return reply({ error: TOO_LONG }, TOO_LARGE);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: "I couldn't read that note." }, UNPROCESSABLE);
  }
  return agent("/coach/note", "POST", body);
}
