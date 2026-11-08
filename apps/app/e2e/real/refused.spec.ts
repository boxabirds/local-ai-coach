import { chromium, expect, test, type Page } from "@playwright/test";

/**
 * A turn a provider refuses ends with the coach saying so (Ceetrix story 37). Runs only with
 * COACH_E2E_REFUSED=1, which the Mac app's release test sets once it has saved made-up keys
 * under a throwaway Keychain service: Jev refuses the made-up key, and the coach must say Jev,
 * not go silent and not show Jev's own text. It never types a key.
 */
const LOAD_MS = 180_000;
const SAID_MS = 30_000;

test("a turn Jev refuses ends with a line naming Jev", async () => {
  test.skip(process.env.COACH_E2E_REFUSED !== "1", "set COACH_E2E_REFUSED=1 with made-up keys saved");
  // A browser of its own: in --single-process mode a browser crashes if it opens a second context.
  const browser = await chromium.launch({ args: ["--single-process"] });
  try {
    await refusedTurn(await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage());
  } finally {
    await browser.close();
  }
});

async function refusedTurn(page: Page) {
  await page.goto("/", { timeout: LOAD_MS });
  await expect(page.getByText("Mastering Local AI coach")).toBeVisible({ timeout: LOAD_MS });
  const box = page.getByTestId("copilot-chat-textarea");
  await box.fill("Hello");
  await box.press("Enter");
  const said = page.getByRole("alert");
  await expect(said).toContainText(/^Jev /, { timeout: SAID_MS });
  await expect(said).not.toContainText(/HTTP|visualization|Something cut my answer off/);
  await expect(page.getByTestId("copilot-assistant-message")).toHaveCount(0);
}
