/**
 * The whole map for the coach (Ceetrix story 29), read from the local agent
 * (`GET /curriculum/map` in apps/agent/src/coach/whole_map.py): every station, its place, the
 * learner's statuses, where they are, their goal and its route. The stub coach keeps its own
 * record, so it asks for that one.
 */
import { agent } from "@/lib/coach-routes";

const RECORD = process.env.NEXT_PUBLIC_COACH_STUB === "1" ? "?record=stub" : "";

export async function GET() {
  return agent(`/curriculum/map${RECORD}`, "GET");
}
