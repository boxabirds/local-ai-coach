/**
 * The Bun server and page build, run under Bun (story 31, TC-01, TC-05 to TC-08, TC-10):
 * `pnpm test:bun`. A real server on a free port serving a real build of the page.
 */
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { startServer as StartServer } from "../server";

/** A port nothing listens on, so the agent is "down". */
const CLOSED_PORT = 9;
const BUILD_MS = 120_000;
setDefaultTimeout(BUILD_MS);

let webDir: string;
let server: ReturnType<typeof StartServer>;
let HOST: string;
let base: string;

beforeAll(async () => {
  // Before the routes load: they read the agent's address once, when imported.
  process.env.COACH_AGENT_URL = `http://127.0.0.1:${CLOSED_PORT}`;
  const { buildPage } = await import("../build");
  const serverModule = await import("../server");
  HOST = serverModule.HOST;
  const startServer = serverModule.startServer;
  webDir = mkdtempSync(join(tmpdir(), "coach-web-"));
  expect(await buildPage(webDir)).toBe(true);
  server = startServer({ port: 0, webDir });
  base = server.url.href.replace(/\/$/, "");
});

afterAll(() => {
  server?.stop(true);
  rmSync(webDir, { recursive: true, force: true });
});

describe("the built page", () => {
  it("TC-01: names its CSS, script and icon by absolute paths that the server serves", async () => {
    const html = readFileSync(join(webDir, "index.html"), "utf8");
    const refs = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
    expect(refs.some((r) => r.endsWith(".css"))).toBe(true);
    expect(refs.some((r) => r.endsWith(".js"))).toBe(true);
    expect(refs.some((r) => r.endsWith(".svg"))).toBe(true);
    expect(html).not.toContain("/../");
    for (const ref of refs) expect((await fetch(base + ref)).status, ref).toBe(200);
  });
});

describe("the server", () => {
  it("TC-05: health answers and / is the page", async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ status: "ok" });
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    expect(page.headers.get("cache-control")).toBe("no-cache");
  });

  it.each(["/nothing-here", "/api/nothing", "/../package.json", "/%2e%2e/package.json"])("TC-06: %s is not found", async (path) => {
    expect((await fetch(base + path)).status).toBe(404);
  });

  it("TC-07: a method a route does not have is 405", async () => {
    const res = await fetch(`${base}/api/health`, { method: "DELETE" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });

  it("TC-08: listens on 127.0.0.1 only", () => {
    expect(HOST).toBe("127.0.0.1");
    expect(server.hostname).toBe("127.0.0.1");
  });

  it("TC-10: with the agent down, a coach route says so with 502 and changes nothing", async () => {
    const map = await fetch(`${base}/api/curriculum/map`);
    expect(map.status).toBe(502);
    const goal = await fetch(`${base}/api/coach-goal`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ goal: "x" }),
    });
    expect(goal.status).toBe(502);
    expect(JSON.stringify(await goal.json())).toContain("I can't reach my agent");
  });

  it("TC-10b: a request from another site changes no setting (403)", async () => {
    const res = await fetch(`${base}/api/coach-goal`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://elsewhere.example", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ goal: "x" }),
    });
    expect(res.status).toBe(403);
  });
});
