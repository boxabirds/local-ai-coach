import { afterEach, describe, expect, it } from "vitest";
import { CHAT_KEY, clearChat, loadChat, restorable, saveChat, type ChatMessage } from "../chat-store";
import { SNAPSHOT, STUB_RUN } from "./chat-fixtures";

const throwing = (op: "get" | "set"): Storage =>
  ({
    getItem: () => {
      if (op === "get") throw new Error("SecurityError");
      return null;
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  }) as Storage;

afterEach(() => localStorage.clear());

describe("loadChat and saveChat", () => {
  it("TC-01 nothing kept gives null", () => {
    expect(loadChat(localStorage)).toBeNull();
  });

  it("TC-02 unreadable data gives null and is removed", () => {
    localStorage.setItem(CHAT_KEY, "{not json");
    expect(loadChat(localStorage)).toBeNull();
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();
  });

  it.each([
    [{ version: 0, messages: STUB_RUN, state: {} }],
    [{ version: 1, state: {} }],
    [{ version: 1, messages: [{ role: "user" }], state: {} }],
  ])("TC-03 old or wrong-shape data gives null and is removed: %j", (value) => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(value));
    expect(loadChat(localStorage)).toBeNull();
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();
  });

  it("TC-04 a saved conversation and map state come back the same", () => {
    expect(saveChat(localStorage, STUB_RUN, SNAPSHOT)).toBe(true);
    expect(loadChat(localStorage)).toEqual({ version: 1, messages: STUB_RUN, state: SNAPSHOT });
  });

  it("TC-05 an empty conversation is not kept", () => {
    expect(saveChat(localStorage, [], SNAPSHOT)).toBe(false);
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();
  });

  it("TC-06 a full or disabled store returns false instead of throwing", () => {
    expect(saveChat(throwing("set"), STUB_RUN, SNAPSHOT)).toBe(false);
    expect(saveChat(undefined, STUB_RUN, SNAPSHOT)).toBe(false);
  });

  it("TC-07 a store that cannot be read gives null instead of throwing", () => {
    expect(loadChat(throwing("get"))).toBeNull();
    expect(loadChat(undefined)).toBeNull();
  });

  it("TC-08 clearChat forgets the conversation", () => {
    saveChat(localStorage, STUB_RUN, SNAPSHOT);
    clearChat(localStorage);
    expect(loadChat(localStorage)).toBeNull();
    expect(() => clearChat(undefined)).not.toThrow();
  });
});

describe("restorable", () => {
  const waitingCard: ChatMessage = {
    id: "a3",
    role: "assistant",
    content: "",
    toolCalls: [{ id: "c2", type: "function", function: { name: "step_card", arguments: '{"step_id":"machine.1"}' } }],
  };

  it("TC-09 a conversation whose cards were all answered is unchanged", () => {
    expect(restorable(STUB_RUN)).toEqual(STUB_RUN);
  });

  it("TC-10 a card still waiting, with no text, is dropped", () => {
    expect(restorable([...STUB_RUN, waitingCard])).toEqual(STUB_RUN);
  });

  it("TC-11 a card still waiting, with text, keeps the text", () => {
    const withText = { ...waitingCard, content: "Here's your first step." };
    const restored = restorable([...STUB_RUN, withText]);
    expect(restored.at(-1)).toEqual({ id: "a3", role: "assistant", content: "Here's your first step." });
  });

  it("TC-12 of two calls, only the unanswered one goes", () => {
    const two: ChatMessage = {
      id: "a4",
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "c3", type: "function", function: { name: "check_result", arguments: "{}" } },
        { id: "c4", type: "function", function: { name: "step_card", arguments: "{}" } },
      ],
    };
    const result: ChatMessage = { id: "t3", role: "tool", toolCallId: "c3", content: "rendered" };
    const restored = restorable([two, result]);
    expect(restored[0].toolCalls?.map((c) => c.id)).toEqual(["c3"]);
    expect(restored[1]).toEqual(result);
  });

  it("TC-13 no messages gives no messages", () => {
    expect(restorable([])).toEqual([]);
  });
});
