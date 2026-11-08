import { chromium, expect, test, type Page } from "@playwright/test";

/**
 * The coach opens the whole map itself (Ceetrix story 38, TC-07): asked in words, the real coach
 * opens the dialog the header's Map button opens. It sends a message to the real model, so it runs
 * only with COACH_E2E_REAL=1 (the release test sets it with COACH_RELEASE_REAL=1). Never types a key.
 */
const LOAD_MS = 180_000;
const REPLY_MS = 240_000;
const MAP_DIALOG = "Map";

test("asking for the whole map opens the Map button's map", async () => {
  test.skip(process.env.COACH_E2E_REAL !== "1", "set COACH_E2E_REAL=1: this sends a real message");
  // A browser of its own: in --single-process mode a browser crashes if it opens a second context.
  const browser = await chromium.launch({ args: ["--single-process"] });
  try {
    await askForTheMap(await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage());
  } finally {
    await browser.close();
  }
});

async function askForTheMap(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { timeout: LOAD_MS });
  await expect(page.getByText("Mastering Local AI coach")).toBeVisible({ timeout: LOAD_MS });
  await expect(page.getByRole("dialog", { name: MAP_DIALOG })).toHaveCount(0);

  const box = page.getByTestId("copilot-chat-textarea");
  await box.fill("Can I see the whole map?");
  await box.press("Enter");

  const map = page.getByRole("dialog", { name: MAP_DIALOG });
  await expect(map).toBeVisible({ timeout: REPLY_MS });
  await expect(map.getByRole("img", { name: "Every station" }).or(map.getByLabel("Every station"))).toBeVisible({ timeout: LOAD_MS });
  await expect(page.getByRole("region", { name: "Conversation" })).not.toContainText("show_big_map");
  await map.getByRole("button", { name: "Close" }).click();
  await expect(map).toHaveCount(0);
  expect(errors).toEqual([]);
}
