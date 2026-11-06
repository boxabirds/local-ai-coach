import { expect, test } from "@playwright/test";

/**
 * Smoke test of the real coach (Ceetrix story 22, TC-18): the page `make dev` serves, against
 * the real agent, in a real browser. Every earlier shell fault (a key save refused from
 * 127.0.0.1, API keys dead during a run) passed tests that faked the network; this doesn't.
 * It never types a key and never sends a message, so it costs nothing and changes nothing.
 */
const DIALOG_MS = 5_000;
const LOAD_MS = 180_000; // next dev compiles the page on its first visit

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
