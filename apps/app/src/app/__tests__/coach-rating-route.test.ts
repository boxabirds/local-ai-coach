import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../api/coach-rating/route";
import { MAX_RATING_BYTES } from "@/lib/rating-limits";

/** The app's route in front of the agent's rating store (Ceetrix story 26, TC-22, TC-23). */
const APP = "http://127.0.0.1:3000";
const OURS = { origin: APP, host: new URL(APP).host, "sec-fetch-site": "same-origin" };
const RATING = { thread_id: "t", message_id: "a1", rating: "up", messages: [{ id: "a1", role: "assistant", content: "made up" }] };
const request = (headers: Record<string, string>, body: string = JSON.stringify(RATING)) =>
  new Request(`${APP}/api/coach-rating`, { method: "POST", headers, body });

afterEach(() => vi.unstubAllGlobals());

describe("/api/coach-rating", () => {
  it.each([
    ["another site", { origin: "https://evil.example", host: new URL(APP).host, "sec-fetch-site": "cross-site" }],
    ["no origin", { host: new URL(APP).host }],
  ])("TC-22 refuses a rating from %s without asking the agent", async (_label, headers) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(headers))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TC-22 refuses a body over the limit without asking the agent, and takes one at the limit", async () => {
    const fetchMock = vi.fn(async () => Response.json({ saved: "ratings/x.json" }));
    vi.stubGlobal("fetch", fetchMock);
    const padding = (size: number) => JSON.stringify({ ...RATING, pad: "" }).length + size;
    const over = JSON.stringify({ ...RATING, pad: "x".repeat(MAX_RATING_BYTES - padding(0) + 1) });
    expect((await POST(request(OURS, over))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    const at = JSON.stringify({ ...RATING, pad: "x".repeat(MAX_RATING_BYTES - padding(0)) });
    expect((await POST(request(OURS, at))).status).toBe(200);
  });

  it("TC-22 refuses a body that isn't JSON without asking the agent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(OURS, "{nope"))).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the coach's own rating with no Origin, and passes the result on", async () => {
    const fetchMock = vi.fn(async () => Response.json({ saved: "ratings/20261106T090000Z-ab12cd34.json" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(OURS));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: "ratings/20261106T090000Z-ab12cd34.json" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/coach\/rating$/);
    expect(JSON.parse(String(init.body))).toEqual(RATING);
    expect(new Headers(init.headers).has("origin")).toBe(false);
  });

  it("TC-23 an agent that isn't running gives 502 and says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const response = await POST(request(OURS));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/can't reach my agent/);
  });
});
