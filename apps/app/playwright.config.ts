import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * End-to-end tests against the stub coach (no model, no keys), in a real browser.
 * The agent and the app run on their own ports so a developer's own servers on
 * 8123 and 3000 are left alone. Run with `pnpm test:e2e` from apps/app, which
 * builds the stub app first.
 */
const AGENT_PORT = 8125;
// Not 3100: `make dev` runs the MCP server there, so the suite and a dev session clashed.
const APP_PORT = 3110;
const AGENT_URL = `http://127.0.0.1:${AGENT_PORT}`;

// Browsers live in a folder the agent's sandbox can write (see e2e/README.md).
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(homedir(), ".cache", "hardened-harness", "ms-playwright");

// One fresh progress folder per run; the specs read it through this variable.
process.env.COACH_E2E_HOME ??= mkdtempSync(join(tmpdir(), "coach-e2e-"));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${APP_PORT}`,
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
    // Claude Code issue #82660: the sandbox denies the Mach service Chromium's
    // helper processes register; single-process mode skips those helpers.
    launchOptions: { args: ["--single-process"] },
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 }, launchOptions: { args: ["--single-process"] } },
    },
  ],
  // With E2E_BASE_URL set the suite tests a coach that is already running (an installed
  // release), so it starts no servers of its own.
  webServer: process.env.E2E_BASE_URL ? [] : [
    {
      command: `uv run --directory ../agent uvicorn main:app --host 127.0.0.1 --port ${AGENT_PORT}`,
      url: `${AGENT_URL}/health`,
      // The tests' frozen curriculum (story 13), so editing the book never changes an e2e result.
      env: { COACH_HOME: process.env.COACH_E2E_HOME, COACH_CURRICULUM: resolve(__dirname, "../../fixtures/curriculum") },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next start -H 127.0.0.1 -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/api/health`,
      env: {
        COACH_AGENT_URL: AGENT_URL,
        // The test build lives in its own folder (package.json test:e2e), apart from make dev's.
        NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-e2e",
        LANGGRAPH_DEPLOYMENT_URL: `${AGENT_URL}/stub`,
        DO_NOT_TRACK: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
