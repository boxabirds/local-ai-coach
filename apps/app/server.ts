/**
 * The coach's web server (story 31): the built page from the web folder and the routes in
 * src/server/routes.ts, on 127.0.0.1 only.
 *
 *   bun server.ts                      serves dist/web on 127.0.0.1:3000
 *   PORT=3110 COACH_WEB_DIR=... bun server.ts
 *
 * Build the page first with `bun build.ts`. The release compiles this file into one executable.
 */
import { resolve } from "node:path";
import { ROUTES, dispatch } from "@/server/routes";
import { NOT_FOUND, cacheControl, staticPath } from "@/server/static";

/** Only this computer may reach the coach (CLAUDE.md hard rules). */
export const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
/** Seconds a streamed chat reply may stay quiet before Bun closes it; 0 turns the limit off. */
const NO_IDLE_LIMIT = 0;

export function startServer(options: { port: number; webDir: string }) {
  const routes = Object.fromEntries(
    Object.entries(ROUTES).map(([path, mod]) => [path, (req: Bun.BunRequest) => dispatch(mod, req, req.params as Record<string, string>)]),
  );
  return Bun.serve({
    hostname: HOST,
    port: options.port,
    idleTimeout: NO_IDLE_LIMIT,
    routes,
    async fetch(req) {
      const path = staticPath(options.webDir, new URL(req.url).pathname);
      const file = path ? Bun.file(path) : null;
      if (!file || !(await file.exists())) return new Response("Not found", { status: NOT_FOUND });
      return new Response(file, { headers: { "Cache-Control": cacheControl(path!) } });
    },
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const webDir = resolve(process.env.COACH_WEB_DIR ?? resolve(import.meta.dir, "dist", "web"));
  const server = startServer({ port, webDir });
  console.log(`The coach is at ${server.url.href}`);
}
