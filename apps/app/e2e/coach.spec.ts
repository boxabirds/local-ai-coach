import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
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
const FIGURES = 3; // chapter 0's figures, each a unit of its own (Ceetrix story 7)
const UNITS = SENTENCES + FIGURES;
const MAX_PRESSES = 60;
const SCROLL_SETTLE_MS = 3000;
const ACCENT = "rgb(29, 78, 216)";
const QUESTION = "The day after, what did Priya check?";
const ANSWER = "Where her words went.";
/** The coach under test: our own servers by default, or an installed release (E2E_BASE_URL). */
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const VIEWPORT = { width: 1280, height: 860 };
const PAPER = "rgb(255, 255, 255)";
/** The reserved criticality colours (coach.css --crit-*), light theme. */
const CRIT = { grey: "rgb(107, 114, 128)", amber: "rgb(180, 83, 9)", red: "rgb(185, 28, 28)" } as const;
/** A one-line user message: bubble plus breathing room, no reserved toolbar. */
const MAX_USER_BLOCK = 80;

async function openBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ args: ["--single-process"] });
  const page = await (await browser.newContext({ baseURL: BASE, viewport: VIEWPORT })).newPage();
  return { browser, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });
const progress = () => JSON.parse(readFileSync(join(process.env.COACH_E2E_HOME!, "progress.stub.json"), "utf8"));
/** The progress file exactly as it is on disk, or null before the coach has written one. */
const progressRaw = () => (existsSync(join(process.env.COACH_E2E_HOME!, "progress.stub.json")) ? readFileSync(join(process.env.COACH_E2E_HOME!, "progress.stub.json"), "utf8") : null);

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
    await expect(page.getByTestId("coach-beat-count")).toHaveText(`1 of ${UNITS}`);
    await expect(goOn).toHaveCSS("background-color", ACCENT);

    for (let i = 0; i < 6; i += 1) await page.keyboard.press("Space");
    await expect(page.getByTestId("coach-beat")).toHaveCount(7);
    await expect(page.getByTestId("coach-beat-count")).toHaveText(`7 of ${UNITS}`);
    await page.waitForTimeout(500); // smooth scroll settles
    await inViewport(page, "coach-story-footer");

    // The Go on row never overhangs the bubbles.
    const bubble = (await page.getByTestId("coach-beat").last().boundingBox())!;
    const footer = (await page.getByTestId("coach-story-footer").boundingBox())!;
    expect(footer.x).toBeGreaterThanOrEqual(bubble.x - 1);
    expect(footer.x + footer.width).toBeLessThanOrEqual(bubble.x + bubble.width + 1);
    await shot(page, "02-story-reading");

    // Story 7, TC-24: the first figure arrives right after its sentence, as a unit of its own.
    // Wait on the figure's beat, which is there before the drawing has loaded.
    const figureBeat = page.locator(".coach-beat--figure");
    for (let i = 0; i < MAX_PRESSES && (await figureBeat.count()) === 0; i += 1) await page.keyboard.press("Space");
    await expect(figureBeat).toHaveCount(1);
    const figure = page.getByTestId("coach-figure");
    await expect(figure).toHaveCount(1);
    await expect(figure).toHaveAttribute("data-figure", "where-words-go");
    const beats = page.getByTestId("coach-beat");
    await expect(beats.nth((await beats.count()) - 2)).toContainText("A box on a shelf, talking to a laptop on a desk, above a bakery.");
    await expect(figure.locator("svg").getByText("Tuesday: the letter stays on her network.")).toBeVisible();
    await expect(figure.getByRole("button", { name: "Tuesday" })).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(500);
    // The figure grows once its drawing loads; the Go on row must come back into view (the scroll is smooth).
    await expect
      .poll(async () => {
        const box = await page.getByTestId("coach-story-footer").boundingBox();
        return box !== null && box.y >= 0 && box.y + box.height <= VIEWPORT.height;
      }, { timeout: SCROLL_SETTLE_MS })
      .toBe(true);
    await shot(page, "02b-figure-tuesday");

    // Choosing redraws it and records nothing; the focus stays on Go on (TC-27).
    const before = progressRaw();
    await figure.getByRole("button", { name: "Last year" }).click();
    await expect(figure.locator("svg").getByText("Last year: the letter left her network.")).toBeVisible();
    await expect(figure.getByTestId("coach-figure-result")).toHaveText("Last year: the letter left her network.");
    await expect(figure.locator("svg").getByText("Tuesday: the letter stays on her network.")).toBeHidden();
    expect(progressRaw()).toBe(before);
    await expect(page.getByRole("button", { name: "Go on" })).toBeFocused();
    await shot(page, "02c-figure-last-year");
    const shownBefore = await beats.count();
    await page.keyboard.press("Space");
    await expect(beats).toHaveCount(shownBefore + 1);
    await expect(beats.last()).toHaveClass(/coach-bubble/);

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
    await expect(page.getByTestId("coach-beat")).toHaveCount(UNITS);
    await expect(page.getByTestId("coach-figure")).toHaveCount(FIGURES);
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
    // Story 7: the number step shows the room and the warehouse above its text.
    await expect(page.getByTestId("coach-number").getByTestId("coach-figure")).toHaveAttribute("data-figure", "room-and-warehouse");
    await page.keyboard.type("16");
    await page.keyboard.press("Enter");
    await expect(page.getByText("You said: 16 GB")).toBeVisible();

    await expect(page.getByText("Passed")).toBeVisible();
    await expect(page.getByText("Sample result. The real probe arrives in step 3.")).toBeVisible();
    await page.getByRole("button", { name: "Show me what you looked at" }).click();
    await expect(page.getByText("sysctl -n hw.memsize")).toBeVisible();
    await expect(page.getByText("17179869184")).toBeVisible();
    await shot(page, "04-check-result");

    // Story 7, TC-25: the fits test step draws Will it fit?; 8 GB and a 5 GB file fits.
    const step3 = page.getByTestId("coach-step").last();
    const fitFigure = step3.getByTestId("coach-figure");
    await expect(fitFigure).toHaveAttribute("data-figure", "will-it-fit");
    await expect(fitFigure.locator("svg").getByText("Doesn't run: 20 GB is bigger than 16 GB.")).toBeVisible();
    await fitFigure.getByRole("button", { name: "8 GB", exact: true }).click();
    await fitFigure.getByRole("button", { name: "5 GB", exact: true }).click();
    await expect(fitFigure.locator("svg").getByText("Fits: 5 GB is under three quarters of 8 GB.")).toBeVisible();
    await fitFigure.scrollIntoViewIfNeeded();
    await shot(page, "04b-will-it-fit");

    await page.getByRole("button", { name: "I did it" }).last().click();
    // TC-26: the answered step keeps a record, without its figure.
    await expect(step3.getByTestId("coach-record")).toBeVisible();
    await expect(step3.getByTestId("coach-figure")).toHaveCount(0);
    const map = page.getByTestId("coach-map");
    await expect(map).toBeVisible();
    await expect(map.locator("[data-station='machine']")).toHaveAttribute("data-status", "reported");
    await expect(map.locator("[data-station='d_legal']")).toHaveAttribute("data-status", "read");

    // Story 5: criticality by shape and colour, progress by fill.
    const marker = (id: string) => map.locator(`[data-station='${id}']`);
    for (const [id, criticality, fill] of [
      ["d_legal", "red", "0.25"],
      ["machine", "amber", "0.5"],
      ["localchat", "grey", "0"],
      ["prove", "red", "0"],
    ] as const) {
      await expect(marker(id)).toHaveAttribute("data-criticality", criticality);
      await expect(marker(id)).toHaveAttribute("data-fill", fill);
      await expect(marker(id).getByTestId("coach-map-outline")).toHaveCSS("stroke", CRIT[criticality]);
    }
    await expect(marker("machine").getByTestId("coach-map-fill")).toHaveCSS("fill", CRIT.amber);
    await expect(map.getByTestId("coach-map-key")).toContainText("must understand");
    // Every station name fits inside the map: none clipped at the edges.
    const svg = (await map.locator("svg").boundingBox())!;
    for (const name of await map.locator(".coach-map__name").all()) {
      const label = (await name.boundingBox())!;
      expect(label.x).toBeGreaterThanOrEqual(svg.x);
      expect(label.x + label.width).toBeLessThanOrEqual(svg.x + svg.width);
    }
    // Once the arrival scroll settles, the map sits above the message box, not under it.
    await page.waitForTimeout(800);
    const mapBox = (await map.boundingBox())!;
    const inputBox = (await page.getByTestId("copilot-chat-input").boundingBox())!;
    expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(inputBox.y + 1);
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
    await page.waitForTimeout(500); // the restore scroll settles

    // Opens at the end: the last message is on screen.
    const last = page.getByTestId("copilot-assistant-message").last();
    const box = (await last.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(VIEWPORT.height);

    // No reserved toolbar space: a one-line user message and a card-only message stay compact.
    const userBlock = (await page.getByTestId("copilot-user-message").first().boundingBox())!;
    expect(userBlock.height).toBeLessThanOrEqual(MAX_USER_BLOCK);
    const cardMessage = page.getByTestId("copilot-assistant-message").filter({ has: page.getByTestId("coach-number") });
    await expect(cardMessage.getByTestId("copilot-assistant-toolbar")).toBeHidden();

    // Cards sit on paper, not the upstream lavender surface.
    await expect(page.getByTestId("coach-check")).toHaveCSS("background-color", PAPER);
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
