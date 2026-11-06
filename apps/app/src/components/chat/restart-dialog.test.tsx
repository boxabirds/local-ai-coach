import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RESTART_URL, RestartDialog } from "./restart-dialog";

/** The Restart coach confirmation (Ceetrix story 23, TC-08 to TC-11). The agent is faked at fetch. */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function open(reply: () => Promise<Response> | Response = () => Response.json({ archived: "old/x", moved: ["progress.json"] })) {
  const fetchMock = vi.fn(async () => reply());
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  const onRestarted = vi.fn();
  render(<RestartDialog onClose={onClose} onRestarted={onRestarted} />);
  return { fetchMock, onClose, onRestarted };
}

describe("Restart coach", () => {
  it("TC-08 says what goes and what stays, with Restart focused, so Enter restarts (Julian, 2026-11-06)", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Start the coach again?" })).toBeVisible();
    expect(screen.getByText(/This clears your progress/)).toBeInTheDocument();
    expect(screen.getByText(/keys and server stay/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart" })).toHaveFocus();
  });

  it("TC-09 Cancel sends nothing and changes nothing", () => {
    const { fetchMock, onClose, onRestarted } = open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRestarted).not.toHaveBeenCalled();
  });

  it("TC-09 Escape sends nothing and changes nothing", () => {
    const { fetchMock, onClose, onRestarted } = open();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRestarted).not.toHaveBeenCalled();
  });

  it("TC-10 Restart posts once, then starts again and closes", async () => {
    const { fetchMock, onClose, onRestarted } = open();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(onRestarted).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(RESTART_URL, expect.objectContaining({ method: "POST" }));
  });

  it.each([
    ["the agent is down", () => Response.json({ error: "I can't reach my agent." }, { status: 502 })],
    ["the agent refuses", () => Response.json({ error: "Only the coach itself can restart." }, { status: 403 })],
    ["the network fails", () => { throw new TypeError("fetch failed"); }],
  ])("TC-11 when %s, it says nothing changed and stays open", async (_label, reply) => {
    const { onClose, onRestarted } = open(reply as () => Response);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nothing changed");
    expect(onRestarted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
