// @vitest-environment node
/** The server's route table (story 31, TC-03, TC-04, TC-09). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { METHOD_NOT_ALLOWED, ROUTES, dispatch, type HandlerModule } from "../routes";
import { staticPath } from "../static";

/** Every path and method the page used under the old file-system routes (made-up list, not content). */
const OLD_ROUTES: Record<string, string[]> = {
  "/api/health": ["GET"],
  "/api/copilotkit": ["POST"],
  "/api/provider-keys": ["POST"],
  "/api/coach-keys": ["GET", "POST", "DELETE"],
  "/api/coach-provider": ["GET", "POST", "DELETE"],
  "/api/coach-provider/check": ["POST"],
  "/api/coach-rating": ["POST"],
  // Story 34.
  "/api/coach-note": ["POST"],
  "/api/coach-feedback": ["GET"],
  "/api/coach-feedback-file": ["POST"],
  "/api/coach-restart": ["POST"],
  "/api/coach-goal": ["POST"],
  "/api/curriculum/map": ["GET"],
  "/api/curriculum/figure/:id": ["GET"],
  "/api/curriculum/story/:id": ["GET"],
  "/api/curriculum/step/:station/:step": ["GET"],
};

afterEach(() => vi.unstubAllGlobals());

describe("route table", () => {
  it("TC-03: holds every old path with exactly its methods", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(OLD_ROUTES).sort());
    for (const [path, methods] of Object.entries(OLD_ROUTES)) {
      const has = (["GET", "POST", "DELETE"] as const).filter((m) => typeof ROUTES[path][m] === "function");
      expect(has, path).toEqual(methods);
    }
  });

  it("TC-04: a path's parameters reach its handler", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("http://127.0.0.1/api/curriculum/step/machine/memory");
    const res = await dispatch(ROUTES["/api/curriculum/step/:station/:step"], req, { station: "machine", step: "memory" });
    expect(res.status).toBe(200);
    expect(String((fetchMock.mock.calls as unknown[][])[0][0])).toMatch(/\/curriculum\/step\/machine\/memory$/);
  });

  it("TC-07 (unit): a method the path does not have is 405 with Allow", async () => {
    const mod: HandlerModule = { GET: () => new Response("ok") };
    const res = await dispatch(mod, new Request("http://127.0.0.1/x", { method: "DELETE" }), {});
    expect(res.status).toBe(METHOD_NOT_ALLOWED);
    expect(res.headers.get("Allow")).toBe("GET");
  });

  it("TC-09: a malformed provider header is refused with 400 and reaches no agent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("http://127.0.0.1/api/copilotkit", { method: "POST", headers: { "x-openai-api-key": "has a space", "x-jev-api-key": "jev-test" }, body: "{}" });
    const res = await dispatch(ROUTES["/api/copilotkit"], req, {});
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TC-09b: with rate limiting on, the request past the limit is 429 and reaches no agent", async () => {
    const LIMIT = 2;
    vi.resetModules();
    vi.stubEnv("RATE_LIMIT_ENABLED", "true");
    vi.stubEnv("RATE_LIMIT_MAX", String(LIMIT));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { POST } = await import("@/api/copilotkit");
      const ask = () =>
        POST(new Request("http://127.0.0.1/api/copilotkit", { method: "POST", headers: { "x-forwarded-for": "10.0.0.9", "x-openai-api-key": "has a space", "x-jev-api-key": "j" }, body: "{}" }));
      for (let i = 0; i < LIMIT; i += 1) expect((await ask()).status).toBe(400);
      const over = await ask();
      expect(over.status).toBe(429);
      expect(await over.text()).toBe("Too many requests");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("static files", () => {
  const web = "/srv/web";
  it.each([
    ["/", "/srv/web/index.html"],
    ["/chunk-abc.js", "/srv/web/chunk-abc.js"],
    ["/a/b.css", "/srv/web/a/b.css"],
  ])("TC-05 (unit): %s is %s", (path, file) => expect(staticPath(web, path)).toBe(file));

  it.each(["/../secret", "/%2e%2e/secret", "/a/../../secret", "/%00", "/%E0%A4%A"])("TC-06 (unit): %s never leaves the folder", (path) =>
    expect(staticPath(web, path)).toBeNull(),
  );
});
