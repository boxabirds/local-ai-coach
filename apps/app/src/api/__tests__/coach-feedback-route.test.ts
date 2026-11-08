import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postNote } from "../coach-note";
import { GET as getCount } from "../coach-feedback";
import { POST as postFile } from "../coach-feedback-file";
import { MAX_RATING_BYTES } from "@/lib/rating-limits";

/** The app's routes in front of the agent's feedback (Ceetrix story 34, TC-21, TC-22). */
const APP = "http://127.0.0.1:3000";
const OURS = { origin: APP, host: new URL(APP).host, "sec-fetch-site": "same-origin" };
const THEIRS = { origin: "https://evil.example", host: new URL(APP).host, "sec-fetch-site": "cross-site" };
const NOTE = { thread_id: "t", note: "made up", coach: "stub", messages: [{ id: "a1", role: "assistant", content: "made up" }] };
const noteRequest = (headers: Record<string, string>, body: string = JSON.stringify(NOTE)) =>
  new Request(`${APP}/api/coach-note`, { method: "POST", headers, body });
const plain = (path: string, method: string, headers: Record<string, string>) => new Request(`${APP}${path}`, { method, headers });

afterEach(() => vi.unstubAllGlobals());

describe("feedback routes", () => {
  it.each([
    ["note", () => postNote(noteRequest(THEIRS))],
    ["count", () => getCount(plain("/api/coach-feedback", "GET", THEIRS))],
    ["file", () => postFile(plain("/api/coach-feedback-file", "POST", THEIRS))],
    ["note with no origin", () => postNote(noteRequest({ host: new URL(APP).host }))],
  ])("TC-21 refuses the %s from another site without asking the agent", async (_label, call) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the count answers the page's own GET, which a browser sends with no Origin (found by TC-29)", async () => {
    const fetchMock = vi.fn(async () => Response.json({ unsent: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await getCount(plain("/api/coach-feedback", "GET", { host: new URL(APP).host, "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unsent: 2 });
  });

  it("TC-21 refuses a note over the limit, or not JSON, without asking the agent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const over = JSON.stringify({ ...NOTE, pad: "x".repeat(MAX_RATING_BYTES) });
    expect((await postNote(noteRequest(OURS, over))).status).toBe(413);
    expect((await postNote(noteRequest(OURS, "{nope"))).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["note", () => postNote(noteRequest(OURS)), /\/coach\/note$/, "POST", NOTE],
    ["count", () => getCount(plain("/api/coach-feedback", "GET", OURS)), /\/coach\/feedback$/, "GET", undefined],
    ["file", () => postFile(plain("/api/coach-feedback-file", "POST", OURS)), /\/coach\/feedback\/file$/, "POST", undefined],
  ])("forwards the coach's own %s with no Origin, and passes the reply on", async (_label, call, path, method, sent) => {
    const fetchMock = vi.fn(async () => Response.json({ made: "up" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ made: "up" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(path);
    expect(init.method).toBe(method);
    expect(init.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(sent);
    expect(new Headers(init.headers).has("origin")).toBe(false);
  });

  it("TC-22 an agent that isn't running gives 502 and says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const response = await postFile(plain("/api/coach-feedback-file", "POST", OURS));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/can't reach my agent/);
  });
});
