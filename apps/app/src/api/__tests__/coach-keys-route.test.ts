import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "../coach-keys";

/** The app's route in front of the agent's saved keys (Ceetrix story 16, TC-15, TC-16, TC-23). */
const APP = "http://localhost:3000";
const OPENAI = "sk-proj-" + "a1B2c3D4".repeat(6);
const JEV = "k9Z8y7X6".repeat(5);

function request(method: string, headers: Record<string, string>, body?: object) {
  return new Request(`${APP}/api/coach-keys`, { method, headers: { ...headers, ...(body && { "content-type": "application/json" }) }, body: body ? JSON.stringify(body) : undefined });
}
const OURS = { origin: APP, host: new URL(APP).host, "sec-fetch-site": "same-origin" };

afterEach(() => vi.unstubAllGlobals());

describe("/api/coach-keys", () => {
  it.each([
    ["another site", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
    ["no origin", {}],
    ["the right origin but not same-origin", { origin: APP, "sec-fetch-site": "cross-site" }],
  ])("TC-15 refuses a save or forget from %s without asking the agent", async (_label, headers) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request("POST", headers, { openai: OPENAI, jev: JEV }))).status).toBe(403);
    expect((await DELETE(request("DELETE", headers))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TC-16 forwards a save from the coach itself, with no Origin, and never echoes a key", async () => {
    const fetchMock = vi.fn(async () => Response.json({ saved: true, where: "keychain" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request("POST", OURS, { openai: OPENAI, jev: JEV, extra: "dropped" }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ saved: true, where: "keychain" });
    expect(text).not.toContain(OPENAI);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/coach\/keys$/);
    expect(new Headers(init.headers).has("origin")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ openai: OPENAI, jev: JEV });
  });

  it("passes the agent's refusal on, with only its message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ saved: false, where: "keychain", error: "Your Keychain didn't save the keys.", debug: "x" }, { status: 422 })));
    const response = await POST(request("POST", OURS, { openai: OPENAI, jev: JEV }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ saved: false, where: "keychain", error: "Your Keychain didn't save the keys." });
  });

  it("GET reports without needing an origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ saved: false, where: null })));
    expect(await (await GET()).json()).toEqual({ saved: false, where: null });
  });

  it.each([["POST"], ["DELETE"], ["GET"]])("TC-23 an agent that isn't running gives 502 on %s", async (method) => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const response = method === "GET" ? await GET() : method === "POST" ? await POST(request("POST", OURS, { openai: OPENAI, jev: JEV })) : await DELETE(request("DELETE", OURS));
    expect(response.status).toBe(502);
    expect((await response.json()).saved).toBe(false);
  });
});
