/**
 * `pnpm dev` (story 31): build the page, rebuild it on every change, and serve it. Run under
 * `bun --watch`, so a change to the server's own code restarts the server too. Reload the page
 * to see a change: there is no in-place hot reload.
 */
import { WEB_OUT, buildPage, rebuildOnChange } from "./build";
import { startServer } from "./server";

const DEFAULT_PORT = 3000;

await buildPage();
rebuildOnChange();
const server = startServer({ port: Number(process.env.PORT) || DEFAULT_PORT, webDir: WEB_OUT });
console.log(`The coach is at ${server.url.href} (rebuilds on change; reload the page to see it)`);
