import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end tests against the stub coach (no model, no keys), in a real browser.
 * The agent and the app run on their own ports so a developer's own servers on
 * 8123 and 3000 are left alone. Run with `pnpm test:e2e` from apps/app, which
 * builds the stub app first.
 */
const AGENT_PORT = 8125;
const APP_PORT = 3100;
const AGENT_URL = `http://127.0.0.1:${AGENT_PORT}`;

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
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
  webServer: [
    {
      command: `uv run --directory ../agent uvicorn main:app --host 127.0.0.1 --port ${AGENT_PORT}`,
      url: `${AGENT_URL}/health`,
      env: { COACH_HOME: process.env.COACH_E2E_HOME },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next start -H 127.0.0.1 -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/api/health`,
      env: {
        COACH_AGENT_URL: AGENT_URL,
        LANGGRAPH_DEPLOYMENT_URL: `${AGENT_URL}/stub`,
        DO_NOT_TRACK: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
