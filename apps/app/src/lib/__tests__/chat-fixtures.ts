import type { ChatMessage } from "../chat-store";

/** AG-UI messages in the shape a real stub run produces. */
export const STUB_RUN: ChatMessage[] = [
  { id: "u1", role: "user", content: "Read Priya's story" },
  {
    id: "a1",
    role: "assistant",
    content: "",
    toolCalls: [{ id: "c1", type: "function", function: { name: "story", arguments: '{"story_id":"legal-letter"}' } }],
  },
  { id: "t1", role: "tool", toolCallId: "c1", content: '{"read":true,"answer":"Where her words went."}' },
  { id: "a2", role: "assistant", content: "Thanks. That's Priya's story, chapter 0." },
];
export const SNAPSHOT = { progress_snapshot: [{ id: "d_legal", name: "Private legal drafting", status: "read" }] };
