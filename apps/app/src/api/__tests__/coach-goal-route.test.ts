import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../coach-goal";
import { GET } from "../curriculum-map";

/** The app's routes in front of the whole map and the goal (Ceetrix story 29, TC-10, TC-15). */
const APP = "http://127.0.0.1:3000";
const OURS = { origin: APP, host: new URL(APP).host, "sec-fetch-site": "same-origin" };
const post = (headers: Record<string, string>, body = JSON.stringify({ destination: "made-up-destination" })) =>
  new Request(`${APP}/api/coach-goal`, { method: "POST", headers, body });

afterEach(() => vi.unstubAllGlobals());

describe("/api/curriculum/map (TC-10)", () => {
  it("passes the agent's map on", async () => {
    const fetchMock = vi.fn(async () => Response.json({ stations: [], current: "a" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stations: [], current: "a" });
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toMatch(/\/curriculum\/map/);
  });

  it("an agent that isn't running gives 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await GET()).status).toBe(502);
  });
});

describe("/api/coach-goal (TC-15)", () => {
  it.each([
    ["another site", { origin: "https://evil.example", host: new URL(APP).host, "sec-fetch-site": "cross-site" }],
    ["no origin", { host: new URL(APP).host }],
  ])("refuses a goal from %s without asking the agent", async (_label, headers) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(post(headers))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON without asking the agent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(post(OURS, "{nope"))).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the coach's own goal with no Origin, and passes the map on", async () => {
    const fetchMock = vi.fn(async () => Response.json({ goal: "made-up-destination", route: ["a", "made-up-destination"] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(post(OURS));
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/coach\/goal/);
    expect(JSON.parse(String(init.body))).toEqual({ destination: "made-up-destination" });
    expect(new Headers(init.headers).has("origin")).toBe(false);
  });

  it("an agent that isn't running gives 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await POST(post(OURS))).status).toBe(502);
  });
});
