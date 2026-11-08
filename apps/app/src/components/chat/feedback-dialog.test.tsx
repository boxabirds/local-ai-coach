import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FeedbackDialog, feedbackLabel } from "./feedback-dialog";
import { FEEDBACK_FILE_URL, NOTE_URL } from "./feedback";

/** Send feedback (Ceetrix story 34, TC-23 to TC-28). The agent is faked at fetch. */
const FILENAME = "coach-feedback-20261108-100000.json";
const MESSAGES = [{ id: "a1", role: "assistant", content: "made up" }];
const FILE_OK = () => Response.json({ filename: FILENAME, file: { schema: 1, ratings: [], notes: [], errors: [] } });
const NOTE_OK = () => Response.json({ saved: "notes/x.json" });
type Reply = () => Response;

let clicked: string[];
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  clicked = [];
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:made-up"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function open({ unsent = 2, note = NOTE_OK, file = FILE_OK }: { unsent?: number; note?: Reply; file?: Reply } = {}) {
  const replies = { note: [note], file: [file] };
  const fetchMock = vi.fn(async (url: string) => (url === NOTE_URL ? replies.note.shift()?.() ?? NOTE_OK() : replies.file.shift()?.() ?? FILE_OK()));
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<FeedbackDialog unsent={unsent} threadId="thread-1" messages={MESSAGES} coach="stub" onClose={onClose} onSaved={onSaved} />);
  const calls = () => fetchMock.mock.calls.map(([url]) => url);
  return { fetchMock, onClose, onSaved, calls, replies };
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save feedback file" }));
const type = (text: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });

describe("Send feedback", () => {
  it("TC-28 the header button counts unsaved feedback, and shows no count at zero", () => {
    expect(feedbackLabel(3)).toBe("Send feedback (3)");
    expect(feedbackLabel(0)).toBe("Send feedback");
    expect(feedbackLabel(null)).toBe("Send feedback");
  });

  it("TC-23 with nothing new and no note, there's nothing to save", () => {
    open({ unsent: 0 });
    expect(screen.getByRole("button", { name: "Save feedback file" })).toBeDisabled();
    type("a note");
    expect(screen.getByRole("button", { name: "Save feedback file" })).toBeEnabled();
    type("   ");
    expect(screen.getByRole("button", { name: "Save feedback file" })).toBeDisabled();
  });

  it("TC-24 keeps the note with the conversation, then saves the file and says the tester sends it", async () => {
    const { fetchMock, onSaved, calls } = open();
    type("I got lost");
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(calls()).toEqual([NOTE_URL, FEEDBACK_FILE_URL]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ thread_id: "thread-1", note: "I got lost", coach: "stub", messages: MESSAGES });
    expect(clicked).toEqual([FILENAME]);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(FILENAME);
    expect(status).toHaveTextContent(/Nothing has been sent/);
    expect(status).toHaveTextContent(/email/);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("TC-24 with no note, only the file is asked for", async () => {
    const { onSaved, calls } = open();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(calls()).toEqual([FEEDBACK_FILE_URL]);
  });

  it("TC-25 a file that can't be made says so, keeps the note and saves nothing", async () => {
    const { onSaved } = open({ file: () => Response.json({ error: "I couldn't put your feedback in a file." }, { status: 500 }) });
    type("I got lost");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't put your feedback in a file.");
    expect(screen.getByRole("textbox")).toHaveValue("I got lost");
    expect(clicked).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("TC-26 a note that can't be kept says so and asks for no file", async () => {
    const { calls, onSaved } = open({ note: () => Response.json({ error: "I couldn't keep that note." }, { status: 500 }) });
    type("I got lost");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't keep that note.");
    expect(calls()).toEqual([NOTE_URL]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("TC-27 trying again after the file failed doesn't keep the note twice", async () => {
    const { calls, onSaved } = open({ file: () => Response.json({}, { status: 502 }) });
    type("I got lost");
    save();
    await screen.findByRole("alert");
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(calls()).toEqual([NOTE_URL, FEEDBACK_FILE_URL, FEEDBACK_FILE_URL]);
  });

  it("Close and Escape save nothing", () => {
    const { fetchMock, onClose } = open();
    type("I got lost");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
