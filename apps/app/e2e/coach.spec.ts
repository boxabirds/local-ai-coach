import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { totalmem } from "node:os";
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
/** This machine's memory as the probe reports it: Node reads the same source (story 9). */
const MEMORY_GB = Math.round(totalmem() / 1024 ** 3);
const DRIVE_GB = 512;
const QUESTION = "The day after, what did Priya check?";
const ANSWER = "Where her words went.";
/** The coach under test: our own servers by default, or an installed release (E2E_BASE_URL). */
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3110";
const VIEWPORT = { width: 1280, height: 860 };
const PAPER = "rgb(255, 255, 255)";
/** The reserved criticality colours (coach.css --crit-*), light theme. */
// Outline colours: amber is drawn with its dark edge (#92400e), the fill being too light for 3:1.
const CRIT = { grey: "rgb(107, 114, 128)", amber: "rgb(146, 64, 14)", red: "rgb(185, 28, 28)" } as const;
/** Amber's fill: a true amber (coach.css --crit-amber). */
const AMBER_FILL = "rgb(255, 176, 0)";
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
    for (const starter of ["Read Priya's story", "What can my computer do?", "Where am I on the map?"]) {
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
  const pageErrors: string[] = [];

  test.beforeAll(async () => {
    ({ browser, page } = await openBrowser());
    page.on("pageerror", (error) => pageErrors.push(error.message));
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

    // Story 8, TC-18: ask about a sentence while reading, then keep reading.
    const asked = page.getByTestId("coach-beat").nth(2);
    const askedText = (await asked.innerText()).trim();
    await asked.click();
    await expect(asked).toHaveAttribute("data-ask-selected", "true");
    await page.getByTestId("coach-ask-button").click();
    const inputQuote = page.locator(".coach-quoted-input").getByTestId("coach-quote");
    await expect(inputQuote).toContainText(askedText);
    await expect(page.getByTestId("copilot-chat-textarea")).toBeFocused();
    await page.keyboard.type("What does that mean?");
    await shot(page, "02a-ask-about");
    await page.keyboard.press("Enter");
    const sent = page.getByTestId("copilot-user-message").last();
    await expect(sent.getByTestId("coach-quote")).toContainText(askedText);
    await expect(sent).toContainText("What does that mean?");
    await expect(page.getByText(/^You asked about “/)).toBeVisible();
    await expect(inputQuote).toHaveCount(0);
    // The story card still works: Go on advances it.
    const beatsBefore = await page.getByTestId("coach-beat").count();
    await page.getByRole("button", { name: "Go on" }).click();
    await expect(page.getByTestId("coach-beat")).toHaveCount(beatsBefore + 1);
    await page.getByRole("button", { name: "Go on" }).focus();

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

  test("know your machine: step, number, permission, real check, map", async () => {
    await page.getByRole("button", { name: "What can my computer do?" }).click();

    const claim = page.getByRole("button", { name: "I did it" });
    await expect(claim).toBeFocused();
    await expect(claim).toHaveCSS("background-color", ACCENT);
    await claim.click();

    const number = page.getByLabel("Memory in GB");
    await expect(number).toBeFocused();
    // Story 7: the number step shows the room and the warehouse above its text.
    await expect(page.getByTestId("coach-number").getByTestId("coach-figure")).toHaveAttribute("data-figure", "room-and-warehouse");
    // Story 9: the drive's number first, as a learner might.
    await page.keyboard.type(String(DRIVE_GB));
    await page.keyboard.press("Enter");
    await expect(page.getByText(`You said: ${DRIVE_GB} GB`)).toBeVisible();

    // The permission card comes first, once, with history off; nothing has been read yet.
    const consent = page.getByTestId("coach-consent");
    await expect(consent).toBeVisible();
    await expect(consent.getByRole("checkbox")).not.toBeChecked();
    await expect(consent.getByRole("button", { name: "Allow" })).toBeFocused();
    expect(existsSync(join(process.env.COACH_E2E_HOME!, "consent.json"))).toBe(false);
    // The learner can see what they are allowing: Allow sits above the message box once the scroll settles.
    await expect
      .poll(async () => {
        const allow = await consent.getByRole("button", { name: "Allow" }).boundingBox();
        const input = await page.getByTestId("copilot-chat-input").boundingBox();
        return allow !== null && input !== null && allow.y >= 0 && allow.y + allow.height <= input.y;
      }, { timeout: SCROLL_SETTLE_MS })
      .toBe(true);
    await shot(page, "04a-permission");
    await consent.getByRole("button", { name: "Allow" }).click();
    await expect(consent.getByTestId("coach-record")).toContainText("Allowed, without shell history");

    // The real probe disagrees: Not yet, the lesson's own hint, and the number card again.
    const firstCheck = page.getByTestId("coach-check").first();
    await expect(firstCheck.getByText("Not yet")).toBeVisible();
    await expect(firstCheck).toContainText(`You typed ${DRIVE_GB} GB and the machine says ${MEMORY_GB} GB.`);
    await expect(firstCheck).toContainText("The drive is the warehouse.");
    const again = page.getByLabel("Memory in GB").last();
    await expect(again).toBeFocused();
    expect(progress().stations.machine).toBeUndefined();

    // The right number: Passed straight away, no second permission card.
    await page.keyboard.type(String(MEMORY_GB));
    await page.keyboard.press("Enter");
    await expect(page.getByText(`You said: ${MEMORY_GB} GB`)).toBeVisible();
    const check = page.getByTestId("coach-check").last();
    await expect(check.getByText("Passed")).toBeVisible();
    await expect(check).toContainText(`You typed ${MEMORY_GB} GB and the machine says ${MEMORY_GB} GB.`);
    await expect(page.getByTestId("coach-consent")).toHaveCount(1);
    await check.getByRole("button", { name: "Show me what you looked at" }).click();
    const evidence = check.getByTestId("coach-evidence");
    if (process.platform === "darwin") {
      await expect(evidence).toContainText("sysctl -n hw.memsize");
      await expect(evidence).toContainText(String(totalmem()));
    } else {
      await expect(evidence).toContainText("grep MemTotal /proc/meminfo");
    }
    expect(JSON.parse(readFileSync(join(process.env.COACH_E2E_HOME!, "consent.json"), "utf8"))).toMatchObject({ probes: true, history: false, doIt: false });
    await shot(page, "04-check-result");

    // Story 11, TC-13: the fits test is a choice card, marked in code against this machine's number.
    // The rows are read from the card, so this follows whatever the lesson asks.
    const choice = page.getByTestId("coach-choice").last();
    await expect(choice.getByTestId("coach-figure")).toBeVisible();
    const rows = choice.locator(".coach-choice__row");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    await expect(choice.getByRole("button", { name: "Check my answers" })).toBeDisabled();
    await choice.getByTestId("coach-figure").scrollIntoViewIfNeeded();
    await shot(page, "04b-fits-test");
    // First, every row with the first option: wrong on this machine if any file is bigger than its memory.
    for (let i = 0; i < rowCount; i += 1) await rows.nth(i).getByRole("button").first().click();
    const checksBefore = await page.getByTestId("coach-check").count();
    await choice.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByTestId("coach-check")).toHaveCount(checksBefore + 1);
    const firstVerdict = page.getByTestId("coach-check").last();
    await expect(firstVerdict.getByText(/^(Passed|Not yet)$/)).toBeVisible();
    // TC-26: the answered card keeps a record of the answers, without its figure.
    await expect(choice.getByTestId("coach-record").first()).toBeVisible();
    await expect(choice.getByTestId("coach-figure")).toHaveCount(0);
    if (await firstVerdict.getByText("Not yet").count()) {
      await expect(firstVerdict).toContainText("Have another look at");
      // A fresh card; this time answer by the rule: a file fits when it is no bigger than the memory.
      const again = page.getByTestId("coach-choice").last();
      await expect(again.getByRole("button", { name: "Check my answers" })).toBeVisible();
      const againRows = again.locator(".coach-choice__row");
      for (let i = 0; i < (await againRows.count()); i += 1) {
        const row = againRows.nth(i);
        const gb = Number(((await row.getAttribute("aria-label")) ?? "").match(/(\d+(?:\.\d+)?)\s*GB/)?.[1]);
        await row.getByRole("button").nth(gb <= MEMORY_GB ? 0 : 1).click();
      }
      await again.getByRole("button", { name: "Check my answers" }).click();
      await expect(page.getByTestId("coach-check")).toHaveCount(checksBefore + 2);
      await expect(page.getByTestId("coach-check").last().getByText("Passed")).toBeVisible();
    }
    await expect(page.getByTestId("coach-check").last()).toContainText(`On your ${MEMORY_GB} GB:`);
    await shot(page, "04c-fits-passed");
    const map = page.getByTestId("coach-map");
    await expect(map).toBeVisible();
    await expect(map.locator("[data-station='machine']")).toHaveAttribute("data-status", "verified");
    await expect(map.locator("[data-station='d_legal']")).toHaveAttribute("data-status", "read");

    // Story 5: criticality by shape and colour, progress by fill.
    const marker = (id: string) => map.locator(`[data-station='${id}']`);
    for (const [id, criticality, fill] of [
      ["d_legal", "red", "0.25"],
      ["machine", "amber", "1"],
      ["localchat", "grey", "0"],
      ["prove", "red", "0"],
    ] as const) {
      await expect(marker(id)).toHaveAttribute("data-criticality", criticality);
      await expect(marker(id)).toHaveAttribute("data-fill", fill);
      await expect(marker(id).getByTestId("coach-map-outline")).toHaveCSS("stroke", CRIT[criticality]);
    }
    await expect(marker("machine").getByTestId("coach-map-fill")).toHaveCSS("fill", AMBER_FILL);
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
    expect(progress().stations.machine.status).toBe("verified");

    // Story 15, TC-10: the map opens full screen, larger than the card, and closes with
    // Escape and with a click outside it, changing nothing in the chat.
    const messages = await page.getByTestId("copilot-assistant-message").count();
    const progressBefore = JSON.stringify(progress());
    await map.getByTestId("coach-map-drawing").click();
    const lightbox = page.getByTestId("coach-map-lightbox");
    await expect(lightbox).toBeVisible();
    expect((await lightbox.locator("svg").boundingBox())!.width).toBeGreaterThan(svg.width);
    await expect(lightbox.locator("[data-station='machine']")).toHaveAttribute("data-status", "verified");
    await shot(page, "05b-map-full-screen");
    await page.keyboard.press("Escape");
    await expect(lightbox).toHaveCount(0);
    await map.getByRole("button", { name: "Full screen" }).click();
    await expect(lightbox).toBeVisible();
    const frame = (await lightbox.boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height + 20);
    await expect(lightbox).toHaveCount(0);
    await expect(map.getByRole("button", { name: "Full screen" })).toBeFocused();
    expect(await page.getByTestId("copilot-assistant-message").count()).toBe(messages);
    expect(JSON.stringify(progress())).toBe(progressBefore);
  });

  test("the conversation survives a reload", async () => {
    await page.waitForTimeout(500); // the last save lands
    await page.reload();
    await expect(page.getByTestId("coach-record").first()).toContainText(ANSWER);
    // Story 8, TC-15: the question asked about a sentence keeps its quote after a reload.
    await expect(page.getByTestId("copilot-user-message").getByTestId("coach-quote").first()).toBeVisible();
    await expect(page.getByText(`You said: ${MEMORY_GB} GB`)).toBeVisible();
    await expect(page.getByText("Passed").first()).toBeVisible();
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
    await expect(page.getByTestId("coach-check").last()).toHaveCSS("background-color", PAPER);
    await shot(page, "06-after-reload");
  });

  test("a card left waiting at reload does not come back dead", async () => {
    await page.getByRole("button", { name: "What can my computer do?" }).click();
    await expect(page.getByRole("button", { name: "I did it" }).last()).toBeFocused();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText(`You said: ${MEMORY_GB} GB`)).toBeVisible();
    await expect(page.locator(".coach-card--active")).toHaveCount(0);
    await page.getByRole("button", { name: "What can my computer do?" }).click();
    await expect(page.getByRole("button", { name: "I did it" }).last()).toBeFocused();
  });

  test("New chat clears the conversation, and a reload stays clear", async () => {
    await page.getByRole("button", { name: "New chat" }).click();
    await expect(page.getByText(`You said: ${MEMORY_GB} GB`)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(`You said: ${MEMORY_GB} GB`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read Priya's story" })).toBeVisible();
    await shot(page, "07-new-chat");
  });

  test("Restart coach asks first, then puts progress and permission aside and starts again (story 23, TC-14)", async () => {
    const home = process.env.COACH_E2E_HOME!;
    expect(progressRaw()).not.toBeNull(); // the chapter above left progress and permission behind
    expect(existsSync(join(home, "consent.json"))).toBe(true);
    await page.getByRole("button", { name: "Restart coach" }).click();
    const dialog = page.getByRole("dialog", { name: "Start the coach again?" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Restart" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Read Priya's story" })).toBeVisible();
    expect(progressRaw()).toBeNull();
    expect(existsSync(join(home, "consent.json"))).toBe(false);
    const backups = readdirSync(join(home, "old"));
    expect(backups).toHaveLength(1);
    expect(readdirSync(join(home, "old", backups[0])).sort()).toEqual(["consent.json", "progress.stub.json"]);
    await shot(page, "08-restart-coach");
  });

  test("answers grow in steps and fade in without errors, and no fade cover is left (story 24, TC-12)", async () => {
    await page.waitForTimeout(1500); // longer than a step and a fade
    await expect(page.locator(".answer-chunk-cover")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
