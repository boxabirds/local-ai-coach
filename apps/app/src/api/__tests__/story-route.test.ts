import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../curriculum-story";

/** The Next route in front of the agent's story endpoint. */
const call = (id: string) => GET(new Request(`http://127.0.0.1/api/curriculum/story/${id}`), { params: Promise.resolve({ id }) });

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/curriculum/story/[id]", () => {
  it.each(["../scope", "Legal-Letter", "a b", "x".repeat(65), ""])("refuses %j with 404 without asking the agent", async (id) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call(id)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Bug: the model asked for the story by its station id (d_legal); the underscore was refused here.
  it.each(["legal-letter", "d_legal"])("asks the agent for %j", async (id) => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("# A story", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(id);
    expect(response.status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`/curriculum/story/${id}$`));
  });
});
