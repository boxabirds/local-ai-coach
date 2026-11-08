import { chromium, expect, test, type Page } from "@playwright/test";

/**
 * Smoke test of the real coach (Ceetrix story 22, TC-18): the page `make dev` serves, against
 * the real agent, in a real browser. Every earlier shell fault (a key save refused from
 * 127.0.0.1, API keys dead during a run) passed tests that faked the network; this doesn't.
 * It never types a key and never sends a message, so it costs nothing and changes nothing.
 */
const DIALOG_MS = 5_000;
const LOAD_MS = 180_000; // generous: the agent's first reply after a start can be slow

test("the real page loads, API keys opens, typing works, and a reload keeps saved-key state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const savedState = async () => (await page.request.get("/api/coach-keys")).json();
  await page.goto("/", { timeout: LOAD_MS });
  await expect(page.getByText("Mastering Local AI coach")).toBeVisible({ timeout: LOAD_MS });
  const before = await savedState();

  const keys = page.getByRole("button", { name: /^API keys/ }).first();
  await expect(keys).toBeEnabled();
  await keys.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: DIALOG_MS });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: DIALOG_MS });

  const box = page.getByRole("textbox").first();
  await box.fill("A sample question, not sent");
  await expect(box).toHaveValue("A sample question, not sent");

  await page.reload({ timeout: LOAD_MS });
  await expect(page.getByText("Mastering Local AI coach")).toBeVisible({ timeout: LOAD_MS });
  expect(await savedState()).toEqual(before);
  expect(errors).toEqual([]);
});

test("the real coach, not the stub: no stub badge, and with no keys a message opens API keys and isn't sent (story 36)", async () => {
  // A browser of its own: in --single-process mode a browser crashes if it opens a second context.
  const browser = await chromium.launch({ args: ["--single-process"] });
  try {
    await realCoachAsksForKeys(await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage());
  } finally {
    await browser.close();
  }
});

async function realCoachAsksForKeys(page: Page) {
  await page.goto("/", { timeout: LOAD_MS });
  await expect(page.getByText("Mastering Local AI coach")).toBeVisible({ timeout: LOAD_MS });
  await expect(page.getByTestId("coach-stub-banner")).toHaveCount(0);

  // Only where no keys are saved: with keys, sending would reach the model, and this test never does.
  const { saved } = await (await page.request.get("/api/coach-keys")).json();
  test.skip(saved === true, "keys are saved here, so sending would reach the model");
  const box = page.getByTestId("copilot-chat-textarea");
  await box.fill("A sample question, kept for later");
  await box.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: DIALOG_MS });
  await expect(page.getByRole("link", { name: "Get an OpenAI key" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get a Jev key" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveValue("A sample question, kept for later");
  await expect(page.getByTestId("copilot-assistant-message")).toHaveCount(0);
  await expect(page.getByTestId("copilot-user-message")).toHaveCount(0);
}
