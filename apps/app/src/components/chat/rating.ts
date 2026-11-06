/**
 * Sends a rating of one of the coach's turns to the app's own route (Ceetrix story 26), with the
 * conversation as this browser holds it (agent.messages). The agent keeps it on this computer.
 */
import type { RateRequest, RateResult } from "@/hooks/use-ask-about";

export const RATING_ROUTE = "/api/coach-rating";
const NOT_SAVED = "I couldn't save that rating.";

export function ratingBody(threadId: string, messages: readonly unknown[], request: RateRequest) {
  return {
    thread_id: threadId,
    message_id: request.messageId,
    rating: request.rating,
    reason: request.reason ?? null,
    item: request.item,
    messages,
  };
}

export async function sendRating(threadId: string, messages: readonly unknown[], request: RateRequest, post: typeof fetch = fetch): Promise<RateResult> {
  try {
    const response = await post(RATING_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ratingBody(threadId, messages, request)),
    });
    if (response.ok) return { ok: true };
    const reply = (await response.json().catch(() => ({}))) as { error?: unknown };
    return { ok: false, error: typeof reply.error === "string" ? reply.error : NOT_SAVED };
  } catch {
    return { ok: false, error: NOT_SAVED };
  }
}
