/**
 * The line under the conversation when a turn fails (Ceetrix story 37). The agent ends a turn a
 * provider refused with a RUN_ERROR carrying TURN_FAILED_CODE and a line in the coach's voice
 * (apps/agent/src/coach/refusals.py); CopilotKit passes the code on as runtimeErrorCode. Any
 * other error gets the cut-off line, so a provider's own text, which can hold part of a key,
 * is never shown.
 */
export const TURN_FAILED_CODE = "coach_turn_failed";
export const CUT_OFF = "Something cut my answer off. Try again, or ask me something else.";

/** CopilotChat's onError event. Its prop is typed as the DOM's onError, so the shape is checked here. */
type ChatError = { error?: { message?: unknown }; context?: { runtimeErrorCode?: unknown } };

export function turnErrorLine(event: unknown): string {
  const { error, context } = (event ?? {}) as ChatError;
  const line = typeof error?.message === "string" ? error.message.trim() : "";
  return context?.runtimeErrorCode === TURN_FAILED_CODE && line ? line : CUT_OFF;
}
