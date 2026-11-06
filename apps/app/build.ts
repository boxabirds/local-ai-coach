/**
 * Build the coach's page with Bun (story 31): src/web/index.html and everything it imports,
 * with Tailwind, into dist/web. The server serves that folder.
 *
 *   bun build.ts    build once (dev.ts also rebuilds on every change)
 *
 * COACH_STUB=1 builds the stub coach (no model, no keys); OPEN_LINK_ALLOWED_ORIGINS is the
 * sandbox's extra link origins. Both are fixed into the page at build time.
 */
import { rmSync, watch } from "node:fs";
import { resolve } from "node:path";
import tailwind from "bun-plugin-tailwind";

const ROOT = import.meta.dir;
export const WEB_OUT = resolve(ROOT, process.env.COACH_WEB_OUT ?? "dist/web");
const ENTRY = resolve(ROOT, "src/web/index.html");
const WATCHED = [resolve(ROOT, "src"), resolve(ROOT, "../../packages/design-system/src")];
/** Edits arrive in bursts (save, format); wait this long after the last before building. */
const SETTLE_MS = 150;

export async function buildPage(outdir = WEB_OUT): Promise<boolean> {
  rmSync(outdir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [ENTRY],
    outdir,
    publicPath: "/",
    target: "browser",
    minify: true,
    sourcemap: "linked",
    plugins: [tailwind],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.COACH_STUB": JSON.stringify(process.env.COACH_STUB ?? ""),
      "process.env.OPEN_LINK_ALLOWED_ORIGINS": JSON.stringify(process.env.OPEN_LINK_ALLOWED_ORIGINS ?? ""),
    },
  });
  for (const log of result.logs) if (log.level === "error") console.error(String(log));
  if (result.success) console.log(`Built the page into ${outdir}`);
  return result.success;
}

/** Build again whenever src/ or the design system changes (used by dev.ts). */
export function rebuildOnChange(outdir = WEB_OUT): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  for (const dir of WATCHED) {
    watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void buildPage(outdir), SETTLE_MS);
    });
  }
}

if (import.meta.main && !(await buildPage())) process.exit(1);
