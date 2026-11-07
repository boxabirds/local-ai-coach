/**
 * A chat reply whose stream the agent drops halfway leaves the server running
 * (2026-11-07: the agent hit an error mid-turn, the dropped stream became an error nothing
 * caught, Bun exited, and the page said it couldn't load the map). The server runs as its
 * own process here, because the failure ends the process.
 */
import { afterAll, beforeAll, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const START_MS = 15_000;
const POLL_MS = 100;
/** Long enough for the agent's error to reach the server, short of the test's timeout. */
const AFTER_DROP_MS = 1_000;
setDefaultTimeout(START_MS * 2);

let webDir: string;
let agent: Bun.TCPSocketListener;
let app: ReturnType<typeof Bun.spawn>;
let base: string;

function sse(event: object): string {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  return `${line.length.toString(16)}\r\n${line}\r\n`;
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port;
  probe.stop(true);
  if (port === undefined) throw new Error("no free port");
  return port;
}

beforeAll(async () => {
  // A fake agent: it starts a reply stream, then closes the connection without finishing it.
  agent = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket) {
        socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n");
        socket.write(sse({ type: "RUN_STARTED", threadId: "t", runId: "r" }));
        socket.terminate();
      },
    },
  });
  webDir = mkdtempSync(join(tmpdir(), "coach-web-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  app = Bun.spawn([process.execPath, resolve(import.meta.dir, "..", "server.ts")], {
    env: { ...process.env, PORT: String(port), COACH_WEB_DIR: webDir, LANGGRAPH_DEPLOYMENT_URL: `http://127.0.0.1:${agent.port}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  const until = Date.now() + START_MS;
  while (Date.now() < until) {
    const up = await fetch(`${base}/api/health`).then((res) => res.ok, () => false);
    if (up) return;
    await Bun.sleep(POLL_MS);
  }
  throw new Error("the server did not start");
});

afterAll(() => {
  app?.kill();
  agent?.stop(true);
  rmSync(webDir, { recursive: true, force: true });
});

it("a chat stream the agent drops leaves the server answering", async () => {
  const chat = await fetch(`${base}/api/copilotkit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "agent/run",
      params: { agentId: "default" },
      body: { threadId: "t", runId: "r", messages: [], tools: [], context: [], state: {}, forwardedProps: {} },
    }),
  });
  await chat.text().catch(() => "");
  await Bun.sleep(AFTER_DROP_MS);
  expect(app.exitCode).toBeNull();
  expect((await fetch(`${base}/api/health`)).ok).toBe(true);
});
