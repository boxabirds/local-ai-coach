import { chromium, expect, test, type Page } from "@playwright/test";

/**
 * One real turn with the real coach (Ceetrix story 36, TC-A4): a message through the page,
 * answered by the model with the keys already saved on this computer. It sends a message, so
 * it costs money: it runs only with COACH_E2E_REAL=1, which the release test sets only when
 * Julian asks for the keyed check (COACH_RELEASE_REAL=1). It never types a key.
 */
const LOAD_MS = 180_000;
const REPLY_MS = 240_000;
const MESSAGE = "Hello. In one sentence, what will you help me with?";

test("a message to the real coach gets a reply from the model", async () => {
  test.skip(process.env.COACH_E2E_REAL !== "1", "set COACH_E2E_REAL=1: this sends a real message");
  // A browser of its own: in --single-process mode a browser crashes if it opens a second context.
  const browser = await chromium.launch({ args: ["--single-process"] });
  try {
    await oneRealTurn(await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage());
  } finally {
    await browser.close();
  }
});

async function oneRealTurn(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/", { timeout: LOAD_MS });
  await expect(page.getByText("Mastering Local AI coach")).toBeVisible({ timeout: LOAD_MS });
  const { saved } = await (await page.request.get("/api/coach-keys")).json();
  expect(saved, "no keys are saved on this computer for the coach to use").toBe(true);

  const box = page.getByTestId("copilot-chat-textarea");
  await box.fill(MESSAGE);
  await box.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const reply = page.getByTestId("copilot-assistant-message").last();
  await expect(reply).toBeVisible({ timeout: REPLY_MS });
  await expect(reply).not.toHaveText(/^\s*$/, { timeout: REPLY_MS });
  await expect(page.getByTestId("coach-stub-banner")).toHaveCount(0);
  expect(errors).toEqual([]);
}
