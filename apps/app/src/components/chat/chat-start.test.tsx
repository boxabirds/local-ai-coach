import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import type { CopilotChatInput, CopilotChatView } from "@copilotkit/react-core/v2";
import { ChatStartContext, focusStartBox, glideFrom, glideToChat, takeStartBox } from "./chat-start";
import { ProviderKeysProvider, useProviderKeys } from "./provider-keys";
import { KeyGatedChatView } from "./key-gated-chat-view";
import { QuotedInput } from "./quoted-input";
import { QuoteContext } from "./quote-block";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatView: (props: ComponentProps<typeof CopilotChatView>) => (
    <>
      <button onClick={() => props.onSubmitMessage?.("hello")}>Send</button>
      {(props.suggestions ?? []).map((s) => <button key={s.title}>{s.title}</button>)}
    </>
  ),
  CopilotChatInput: (props: ComponentProps<typeof CopilotChatInput>) => (
    <div data-testid="input" data-autofocus={String(Boolean(props.autoFocus))} data-disclaimer={String(Boolean(props.showDisclaimer))} />
  ),
}));

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
  takeStartBox(); // forget anything a test noted
  vi.restoreAllMocks();
});

function rectAt(left: number, top: number): DOMRect {
  return { left, top, right: left + 100, bottom: top + 40, width: 100, height: 40, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function startBox(left: number, top: number): Document {
  const doc = document.implementation.createHTMLDocument("start");
  const box = doc.createElement("div");
  box.setAttribute("data-testid", "copilot-chat-input");
  box.getBoundingClientRect = () => rectAt(left, top);
  doc.body.append(box);
  return doc;
}

describe("glideToChat", () => {
  it("sends at once and notes where the start box was, for one message box only", () => {
    const update = vi.fn();
    glideToChat(update, startBox(200, 300));
    expect(update).toHaveBeenCalledOnce();
    expect(takeStartBox()).toMatchObject({ left: 200, top: 300 });
    expect(takeStartBox()).toBeNull();
  });

  it("notes nothing when there is no start box", () => {
    glideToChat(vi.fn(), document.implementation.createHTMLDocument("empty"));
    expect(takeStartBox()).toBeNull();
  });

  it("forgets a start box noted too long ago", () => {
    glideToChat(vi.fn(), startBox(200, 300));
    expect(takeStartBox(Date.now() + 60_000)).toBeNull();
  });
});

describe("glideFrom", () => {
  const box = (left: number, top: number) => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => rectAt(left, top);
    return el;
  };

  it("starts the box where the start box was, then lets it glide home", () => {
    const el = box(200, 700);
    expect(glideFrom(el, rectAt(200, 300))).toBe(true);
    expect(el.style.transform).toBe("");
    expect(el.style.transition).toContain("transform");
  });

  it("does nothing with no start box, or none to travel", () => {
    expect(glideFrom(box(0, 0), null)).toBe(false);
    expect(glideFrom(box(200, 300), rectAt(200, 300))).toBe(false);
  });

  it("does nothing when the computer asks for less motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const el = box(200, 700);
    expect(glideFrom(el, rectAt(200, 300))).toBe(false);
    expect(el.style.transition).toBe("");
  });
});

describe("only the first message notes the start box", () => {
  it.each([
    ["the start screen", [], true],
    ["a chat under way", [{ id: "m1", role: "user", content: "hi" }], false],
  ])("on %s", async (_, messages, notes) => {
    const submit = vi.fn();
    function WithKeys() {
      const { save } = useProviderKeys();
      return <button onClick={() => save({ openai: "test", jev: "test" })}>Save tested keys</button>;
    }
    render(
      <ProviderKeysProvider>
        <div data-testid="copilot-chat-input" />
        <KeyGatedChatView messages={messages as never} onSubmitMessage={submit} />
        <WithKeys />
      </ProviderKeysProvider>,
    );
    fireEvent.click(screen.getByText("Save tested keys"));
    await waitFor(() => {
      fireEvent.click(screen.getByText("Send"));
      expect(submit).toHaveBeenCalled();
    });
    expect(takeStartBox() !== null).toBe(notes);
  });
});

describe("the message box", () => {
  const quote = { quote: null, clear: () => {} };
  const box = (welcome: boolean) => {
    render(
      <QuoteContext.Provider value={quote}>
        <ChatStartContext.Provider value={{ welcome }}>
          <QuotedInput showDisclaimer />
        </ChatStartContext.Provider>
      </QuoteContext.Provider>,
    );
    return screen.getByTestId("input");
  };

  it("takes the focus on the start screen", () => {
    expect(box(true)).toHaveAttribute("data-autofocus", "true");
  });

  it("doesn't take the focus once the chat is under way (a card may hold it)", () => {
    expect(box(false)).toHaveAttribute("data-autofocus", "false");
  });
});

describe("the starters belong to the start screen, judged by the conversation on screen", () => {
  const STARTERS = [{ title: "Made-up starter", message: "Made-up starter", isLoading: false }];
  it.each([
    ["an empty conversation shows them", [], 1],
    ["a conversation under way (or restored) hides them", [{ id: "u1", role: "user", content: "hi" }], 0],
  ])("%s", (_label, messages, shown) => {
    render(
      <ProviderKeysProvider>
        <KeyGatedChatView messages={messages as never} suggestions={STARTERS} />
      </ProviderKeysProvider>,
    );
    expect(screen.queryAllByRole("button", { name: "Made-up starter" })).toHaveLength(shown);
  });
});


describe("focusStartBox", () => {
  function startScreen() {
    document.body.innerHTML = `<div id="wrap"><textarea data-testid="copilot-chat-textarea"></textarea></div><input id="other" />`;
    return { wrap: document.getElementById("wrap")!, box: document.querySelector("textarea")!, other: document.getElementById("other") as HTMLInputElement };
  }
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("takes the focus back from a button (a closing dialog returns it to its opener)", () => {
    const { wrap, box } = startScreen();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    expect(focusStartBox(wrap)).toBe(true);
    expect(box).toHaveFocus();
  });

  it("leaves the focus alone while a dialog is open", () => {
    const { wrap, box } = startScreen();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    expect(focusStartBox(wrap)).toBe(false);
    expect(box).not.toHaveFocus();
  });

  it("never takes the focus from somewhere the learner is typing", () => {
    const { wrap, other } = startScreen();
    other.focus();
    expect(focusStartBox(wrap)).toBe(false);
    expect(other).toHaveFocus();
  });

  it("does nothing without a start box", () => {
    expect(focusStartBox(null)).toBe(false);
  });
});
