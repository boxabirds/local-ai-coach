import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../coach-restart";

/** The app's route in front of the agent's restart (Ceetrix story 23, TC-12, TC-13). */
const APP = "http://127.0.0.1:3000";
const OURS = { origin: APP, host: new URL(APP).host, "sec-fetch-site": "same-origin" };
const request = (headers: Record<string, string>) => new Request(`${APP}/api/coach-restart`, { method: "POST", headers });

afterEach(() => vi.unstubAllGlobals());

describe("/api/coach-restart", () => {
  it.each([
    ["another site", { origin: "https://evil.example", host: new URL(APP).host, "sec-fetch-site": "cross-site" }],
    ["no origin", { host: new URL(APP).host }],
  ])("TC-12 refuses a restart from %s without asking the agent", async (_label, headers) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(headers))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TC-13 forwards the coach's own restart with no Origin, and passes the result on", async () => {
    const fetchMock = vi.fn(async () => Response.json({ archived: "old/20261106T043000Z", moved: ["progress.json"] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(OURS));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archived: "old/20261106T043000Z", moved: ["progress.json"] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/coach\/restart$/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("origin")).toBe(false);
  });

  it("TC-13 an agent that isn't running gives 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await POST(request(OURS))).status).toBe(502);
  });
});
