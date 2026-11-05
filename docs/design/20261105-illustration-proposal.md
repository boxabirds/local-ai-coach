# Proposal: illustrations that prove the point (chapters 0 and 1)

Status: proposed 2026-11-05. Decisions 1 and 2 taken; 3 to 5 open (section 5).

## 1. The illustrations

Fixed means a React/SVG component under `components/coach/figures/`: offline, works in the stub. Only figure 3 uses grey, amber or red, because there they mean criticality.

| # | Passage | What it proves | What the learner does | Mechanism | Offline | Effort | Test |
|---|---|---|---|---|---|---|---|
| 1 | Ch 0, after "Her laptop is talking to the box on the shelf…" | Local means where the words go, not wifi | Switch "Last year" / "Tuesday", press Send: the letter goes to a company's server, then to backroom; the chat header changes to match | Fixed | Yes | M | Playwright: path labels and header per view; reduced motion shows the end state |
| 2 | Ch 0, after "One destination. backroom. Nothing else." | The failure is silent; you go and look | A sample list of where the chat app sends data, with one line that shouldn't be there. Find it | Fixed, sharing the `check_result` evidence row | Yes | M | Playwright: right and wrong clicks; "Sample" label shown |
| 3 | Ch 0, "Those are the station colours." | Three stations, three amounts of you | Priya's three stations on the existing `TubeMap`; tap one for its colour's test | Fixed, reuses `tube-map.tsx` | Yes | S | Unit: criticality matches `stations.json`; `--crit-*` test stays green |
| 4 | Ch 1, "Have you got it?" | The sticky-note test and the three-quarters rule | Your number (from the number card, or pick 8/16/32/128) is the room; drop in 2, 5 and 20 GB files: Fits, A squeeze, Doesn't run | Fixed | Yes | S | Table-driven unit test (16: fits, fits, no; 32: all fit); Playwright, mouse and keyboard |
| 5 | Ch 1, "The drive's the warehouse." | Drive size doesn't help | Figure 4 with the drive beside the room; a 20 GB file sits in the warehouse but can't get into the room | Fixed, a mode of 4 | Yes | S | Unit; Playwright screenshot |
| 6 | Ch 1, "Copy it to another machine…" | One file, nothing to call | Drag the model file to another machine; it runs if the room is big enough, and no line goes anywhere else | Fixed | Yes | S | Playwright: no outbound line drawn |
| 7 | Any turn: "show me another way" | What the authored set missed | Coach improvises a diagram | Sandboxed generated | No | S | By hand only |

Define-before-use applies: figure 1 is in chapter 0, so it may say network and model, not memory, address or tailnet. Tailscale is "a private link" there.

## 2. Mechanisms

**Part 1: what CopilotKit here can present**

| Mechanism | In this repo | Deterministic, testable | Needs the model | Needs internet | Limits |
|---|---|---|---|---|---|
| (a) Fixed components (`useComponent`, `useHumanInTheLoop`, `useRenderTool`) | Eight coach cards in `use-coach-ui.tsx` | Yes (Vitest, Playwright) | No | No | We write every one |
| (b) Open Generative UI (`generateSandboxedUi`) | websandbox iframe; CSP allows four CDNs; importmap (three, d3, gsap, chart.js) points at esm.sh | No | Yes, plus Jev routing the turn to `open_generative_ui` | Yes, as soon as it imports a library | Varies every run, can be wrong; the importmap is in `packages/design-system` (do not touch), so no self-hosting in V1 |
| (c) A2UI | Catalogue has one component, `DataTable` (12 columns, 200 rows, provenance required) | Rendering yes; content no | Yes, plus Jev routing to `a2ui` | No | Tables only unless we add catalogue entries |
| (d) MCP Apps | Runtime takes `mcpApps` when `MCP_SERVER_URL` is set; `apps/mcp` serves skills and prompts, no UI | n/a | Yes | Depends | Unused; rendering unverified |

A2UI fits the chapter 1 model table, but that table doesn't exist yet (`authorWork`).

**Part 2: authored versus generated at runtime**

Authored (by Claude Code, versioned, reviewed by you): checked wording and numbers, tests, no model needed. Costs build time; covers only predicted questions.

Generated at runtime: answers anything, but with unchecked prose and arithmetic from a hosted model, untestable, CDN-bound.

**Recommendation:** author every illustration that proves a point in the text (1 to 6). Keep (b) for questions the curriculum didn't predict, labelled as improvised. Skip A2UI and MCP Apps for V1.

Don't oversell "offline": the V1 coach needs the internet anyway (OpenAI, Jev). What offline buys is a stub and tests with no model, identical figures for all five testers, and figures that survive V2 unchanged.

## 3. Placing them in the curriculum

**Stories.** A line of its own between paragraphs: `<!-- figure: where-words-go -->`. Markdown hides HTML comments, so the book text is unchanged. `storyBlocks` makes it a figure block, `storySentences` its own unit, and `StoryBubbles` renders it from a registry in place of a bubble.

**Lessons.** An optional `figure` field on a step (`"figure": "will-it-fit"`), shown by `step_card` above the step text.

**Registry.** `curriculum/figures.json`: `id`, `item` (reading-order id), `after` (the sentence it follows), `offline`, `status`, `untested[]`, and every learner-facing string, including an `alt` description. Components read their copy from here, so no learner-facing words live in TSX.

**What `validate.py` adds:**
- every marker and step `figure` resolves to a registry entry, and every entry is used once;
- `after` matches the text just before the marker;
- the strings go through `check_voice` (no dashes, avoid list) and the term check against the reading order, so figure 1 fails if it says "memory";
- `offline` must be true for anything in `scope.json`.

On the frontend, a Vitest test fails if a registry id has no registered component.

## 4. First slice and your decisions

**First slice:** figure 1 (Where the words go) and figure 4 (Will it fit?). Together they exercise both placement paths and the validator. Figure 1 is the visible moment the authoring policy names for chapter 0; figure 4 is the station proof on your own number. About one session.

**Challenge:** this isn't on the build order. Step 3 (probes on a real Mac, a real Linux laptop, over Tailscale) is the real unknown, and figures are the comfortable work beside it. Do the slice only if it doesn't delay step 3, or make it an experiment: show it to half the testers and compare their story answers.

**Decisions:** see section 5.

**Not verified:** MCP Apps rendering in this CopilotKit version; whether `stylecheck.py --book` copes with short labels (its targets are tuned to prose, so figure copy may get the dash and avoid-list checks only); whether a 2 TB to 16 GB drawing (125 to 1) reads on a phone.

## 5. Decisions

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Book too, or coach only? | Book too (Julian, 2026-11-05) | Every figure needs a static print state as well as the interactive one. The registry gains a `print` entry per figure (the SVG state the book shows and its caption). The book build reads the same markers, so the text and the figure stay in step. This roughly adds a third to each figure's effort. |
| 2 | Must the learner use a figure before "Go on"? | No (Julian, 2026-11-05) | A figure never blocks the story. "Go on" and the space bar work as before; the figure is a unit the learner can pass. |
| 3 | Does using a figure count as progress? | Open. Proposed: no | Progress stays on evidence. Using a figure is not evidence of understanding, and the story check already measures that. |
| 4 | Improvised diagrams during the tester sessions? | Open, question restated below | |
| 5 | Before step 3 or after it? | Open. Proposed: after | Step 3 (probes on a real Mac, a real Linux laptop and over Tailscale) is the biggest unknown left. |

**Decision 4 restated.** "Testers" means the five people the PoC plan (`docs/poc-plan.md`) puts through chapters 0 and 1: two developers first, then the Sam sessions. Their results are compared against the plan's pass marks, for example four of five can say what amber means. Mechanism (b) lets the hosted model draw a new diagram when a learner asks "show me another way". The question: is (b) switched on in those sessions?

- On: a learner who is stuck gets help the authored set did not predict, and we see which questions the figures missed.
- Off: all five see the same figures, so the results compare cleanly, and nothing unchecked reaches them.

Proposed: off for the five sessions, with a log of every "show me another way" request, so the gaps are still found.
