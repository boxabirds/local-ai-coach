import { inline } from "./markdown";

/**
 * Something to know before a task (Ceetrix story 25): a pale yellow bubble that starts with a
 * light bulb, so a fact never looks like a thing to do. Plain React, no CopilotKit.
 */
export function FactBubble({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="coach-fact" data-testid="coach-fact">
      <span aria-hidden="true">💡</span> {inline(text)}
    </p>
  );
}
