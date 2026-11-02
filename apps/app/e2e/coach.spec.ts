import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The stub coach end to end, in a real browser. Screenshots land in
 * test-results/screens/ for a human (or the agent) to look at.
 *
 * Chromium runs with --single-process (Claude Code issue #82660: the sandbox
 * denies the Mach service its helper processes need). In that mode a browser
 * crashes if it opens a second context, so every browser here has exactly one.
 */

const SENTENCES = 102;
const ACCENT = "rgb(29, 78, 216)";
const QUESTION = "The day after, what did Priya check?";
const ANSWER = "Where her words went.";
const BASE = "http://127.0.0.1:3100";
const VIEWPORT = { width: 1280, height: 860 };

async function openBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ args: ["--single-process"] });
  const page = await (await browser.newContext({ baseURL: BASE, viewport: VIEWPORT })).newPage();
  return { browser, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });
const progress = () => JSON.parse(readFileSync(join(process.env.COACH_E2E_HOME!, "progress.stub.json"), "utf8"));

async function inViewport(page: Page, testId: string) {
  const box = await page.getByTestId(testId).last().boundingBox();
  expect(box, `${testId} has a box`).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height);
}

/** Starts clean: a browser of its own, no kept conversation. */
test("home: the coach, the stub badge and the three starters, no demo", async () => {
  const { browser, page } = await openBrowser();
  try {
    await page.goto("/");
    await expect(page).toHaveTitle("Mastering Local AI coach");
    await expect(page.getByTestId("coach-stub-banner")).toHaveText("Stub coach, no model");
    for (const starter of ["Read Priya's story", "Find my number", "Where am I on the map?"]) {
      await expect(page.getByRole("button", { name: starter })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /GitHub/ })).toHaveCount(0);
    await shot(page, "01-home");
  } finally {
    await browser.close();
  }
});

/**
 * One learner's conversation, start to finish, in one browser: suite-level setup
 * and teardown, tests in order, each picking up where the last left off.
 */
test.describe("one conversation: story, Know your machine, reload, New chat", () => {
  test.describe.configure({ mode: "serial" });
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    ({ browser, page } = await openBrowser());
    await page.goto("/");
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test("story: one sentence per bubble, Space to go on, and the answer sticks", async () => {
    await page.getByRole("button", { name: "Read Priya's story" }).click();

    const goOn = page.getByRole("button", { name: "Go on" });
    await expect(goOn).toBeFocused();
    await expect(page.getByTestId("coach-beat")).toHaveCount(1);
    await expect(page.getByTestId("coach-beat-count")).toHaveText(`1 of ${SENTENCES}`);
    await expect(goOn).toHaveCSS("background-color", ACCENT);

    for (let i = 0; i < 6; i += 1) await page.keyboard.press("Space");
    await expect(page.getByTestId("coach-beat")).toHaveCount(7);
    await expect(page.getByTestId("coach-beat-count")).toHaveText(`7 of ${SENTENCES}`);
    await page.waitForTimeout(500); // smooth scroll settles
    await inViewport(page, "coach-story-footer");

    // The Go on row never overhangs the bubbles.
    const bubble = (await page.getByTestId("coach-beat").last().boundingBox())!;
    const footer = (await page.getByTestId("coach-story-footer").boundingBox())!;
    expect(footer.x).toBeGreaterThanOrEqual(bubble.x - 1);
    expect(footer.x + footer.width).toBeLessThanOrEqual(bubble.x + bubble.width + 1);
    await shot(page, "02-story-reading");

    await page.getByRole("button", { name: "Show the rest" }).click();
    await expect(page.getByText(QUESTION)).toBeVisible();
    await expect(page.getByRole("button", { name: ANSWER })).toBeFocused();
    await page.getByRole("button", { name: ANSWER }).click();

    // The coach replies, and the card stays answered: it must not reset.
    await expect(page.getByText("Thanks. That's Priya's story, chapter 0.")).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("coach-record")).toContainText(ANSWER);
    await expect(page.getByRole("button", { name: "Go on" })).toHaveCount(0);
    await shot(page, "03-story-answered");

    await page.getByRole("button", { name: "Read it again" }).click();
    await expect(page.getByTestId("coach-beat")).toHaveCount(SENTENCES);
    await page.getByRole("button", { name: "Hide the story" }).click();
    expect(progress().stations.d_legal.status).toBe("read");
  });

  test("know your machine: step, number, sample check, map", async () => {
    await page.getByRole("button", { name: "Find my number" }).click();

    const claim = page.getByRole("button", { name: "I did it" });
    await expect(claim).toBeFocused();
    await expect(claim).toHaveCSS("background-color", ACCENT);
    await claim.click();

    const number = page.getByLabel("Memory in GB");
    await expect(number).toBeFocused();
    await page.keyboard.type("16");
    await page.keyboard.press("Enter");
    await expect(page.getByText("You said: 16 GB")).toBeVisible();

    await expect(page.getByText("Passed")).toBeVisible();
    await expect(page.getByText("Sample result. The real probe arrives in step 3.")).toBeVisible();
    await page.getByRole("button", { name: "Show me what you looked at" }).click();
    await expect(page.getByText("sysctl -n hw.memsize")).toBeVisible();
    await expect(page.getByText("17179869184")).toBeVisible();
    await shot(page, "04-check-result");

    await page.getByRole("button", { name: "I did it" }).last().click();
    const map = page.getByTestId("coach-map");
    await expect(map).toBeVisible();
    await expect(map.locator("[data-station='machine']")).toHaveAttribute("data-status", "reported");
    await expect(map.locator("[data-station='d_legal']")).toHaveAttribute("data-status", "read");
    await shot(page, "05-map");
    expect(progress().stations.machine.status).toBe("reported");
  });

  test("the conversation survives a reload", async () => {
    await page.waitForTimeout(500); // the last save lands
    await page.reload();
    await expect(page.getByTestId("coach-record").first()).toContainText(ANSWER);
    await expect(page.getByText("You said: 16 GB")).toBeVisible();
    await expect(page.getByText("Passed")).toBeVisible();
    await expect(page.getByTestId("coach-map")).toBeVisible();
    await shot(page, "06-after-reload");
  });

  test("a card left waiting at reload does not come back dead", async () => {
    await page.getByRole("button", { name: "Find my number" }).click();
    await expect(page.getByRole("button", { name: "I did it" }).last()).toBeFocused();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText("You said: 16 GB")).toBeVisible();
    await expect(page.locator(".coach-card--active")).toHaveCount(0);
    await page.getByRole("button", { name: "Find my number" }).click();
    await expect(page.getByRole("button", { name: "I did it" }).last()).toBeFocused();
  });

  test("New chat clears the conversation, and a reload stays clear", async () => {
    await page.getByRole("button", { name: "New chat" }).click();
    await expect(page.getByText("You said: 16 GB")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("You said: 16 GB")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read Priya's story" })).toBeVisible();
    await shot(page, "07-new-chat");
  });
});
