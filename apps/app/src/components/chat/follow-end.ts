/**
 * The chat's one scrolling rule (Ceetrix story 28), as plain decisions with no React: follow the
 * end of the conversation while the learner is at the end; leave them alone once they scroll up
 * to reread; follow again when they act. FollowEnd (follow-end-view.tsx) applies them.
 */

/** Within this distance of the bottom still counts as at the end (a line short is still there). */
export const END_THRESHOLD_PX = 48;

const TEXT_FIELD = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const ACTING_KEYS = new Set([" ", "Enter"]);
const ANSWER_ROLES = new Set(["user", "tool"]);

/** Whether the scroller is at its end, or close enough to count. */
export function atEnd(el: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return el.scrollHeight - el.clientHeight - el.scrollTop <= END_THRESHOLD_PX;
}

/**
 * Whether an event is the learner acting in the chat: a button pressed inside it, or Space or
 * Enter outside a text field (the story's Space, a focused card button). Typing in the message box,
 * clicking on words, and anything outside the chat (the rating palette) are not.
 */
export function learnerActed(event: Event, root: Element): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (event.type === "click") return Boolean(target && root.contains(target) && target.closest("button"));
  if (event.type === "keydown") {
    const key = (event as KeyboardEvent).key;
    return ACTING_KEYS.has(key) && !(target && target.closest(TEXT_FIELD));
  }
  return false;
}

/** How many messages the learner has sent or cards they have answered. */
export function answers(messages: readonly { role?: string }[]): number {
  return messages.filter((message) => ANSWER_ROLES.has(message.role ?? "")).length;
}

/**
 * Whether the chat should follow after a scroll. Only scrolling up leaves the end: content
 * arriving never moves the chat up, but it can make the end move away between FollowEnd's own
 * scroll and the browser reporting it, which must not count as the learner leaving. Reaching the
 * end (within the threshold) follows again; scrolling down short of it changes nothing.
 */
export function followAfterScroll(
  following: boolean,
  previousTop: number,
  el: { scrollTop: number; scrollHeight: number; clientHeight: number },
): boolean {
  if (atEnd(el)) return true;
  if (el.scrollTop < previousTop - 1) return false;
  return following;
}

