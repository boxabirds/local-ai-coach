import { defineConfig, devices } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The smoke test of the real coach (story 22): no servers of its own; it tests what
 * `make dev` is serving at SMOKE_URL. Run with `make smoke`.
 */
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(homedir(), ".cache", "hardened-harness", "ms-playwright");
const SMOKE_URL = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
const TEST_MS = 400_000;

export default defineConfig({
  testDir: "./e2e/real",
  workers: 1,
  retries: 0,
  timeout: TEST_MS,
  reporter: [["list"]],
  outputDir: "./test-results/smoke",
  use: {
    baseURL: SMOKE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // As playwright.config.ts: the sandbox denies Chromium's helper processes.
    launchOptions: { args: ["--single-process"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--single-process"] } } }],
});
