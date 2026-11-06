import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../curriculum-figure";

/** TC-19 (Ceetrix story 7): the Next route in front of the agent's figure endpoint. */
const call = (id: string) => GET(new Request(`http://127.0.0.1/api/curriculum/figure/${id}`), { params: Promise.resolve({ id }) });

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/curriculum/figure/[id]", () => {
  it.each(["../scope", "Will-It-Fit", "a b", "x".repeat(65), ""])("refuses %j with 404 without asking the agent", async (id) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(id);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a figure through", async () => {
    const body = { id: "will-it-fit", title: "Will it fit?", alt: "a", caption: "c", controls: [], svg: "<svg/>" };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(body)));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call("will-it-fit");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/curriculum\/figure\/will-it-fit$/);
  });

  it("keeps the agent's 404", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({}, { status: 404 }))));
    expect((await call("nope")).status).toBe(404);
  });

  it.each([
    ["an agent error", () => Promise.resolve(Response.json({}, { status: 500 }))],
    ["an agent that is not running", () => Promise.reject(new TypeError("fetch failed"))],
  ])("turns %s into 502", async (_label, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    expect((await call("will-it-fit")).status).toBe(502);
  });
});
