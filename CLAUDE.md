# local-ai-coach: working rules

This repo is a fork of CopilotKit/OpenIntelligentUI, kept as shipped, with a coaching curriculum, components, tools and a local evidence collector added. It is V1 of the coach for the book series Mastering Local AI. Read `docs/design.md` before changing anything; it is the technical design and the build order. `docs/poc-plan.md` is the product plan it implements; `docs/spec.md` is the longer-term spec (V2 and after). Where this file and `docs/design.md` disagree, the design wins and this file is wrong.

## What V1 is

- The upstream stack runs unchanged except the web side: Python LangGraph agent on :8123, the CopilotKit runtime, hosted OpenAI `chat-latest`, hosted Jev via TypeSafe. Both hosted providers stay in V1. Do not replace them.
- The web side is Bun (story 31): `apps/app/build.ts` builds the page from `src/web/index.html` with `Bun.build`, `apps/app/server.ts` serves it and the routes (`src/server/routes.ts`, handlers in `src/api/`) with `Bun.serve` on 127.0.0.1. Bun is pinned in the lockfile. `apps/app/src/__tests__/no-next.test.ts` fails if the old framework comes back.
- Scope: Priya's story (chapter 0), What can my computer do? (was Know your machine), Local chat, Is my chat app talking to anyone else? (was Prove it stays local). macOS and Linux. Nothing else.
- The local story is a model on a machine the learner owns, reached over their own network or their tailnet (Tailscale). Not "wifi off": that framing is gone from the taxonomy, the chapters and the design. The proof reads where the chat app's bytes go (`connections` probe: loopback, private or tailnet only; `tailnet` probe: `tailscale status --json` to match a tailnet address to a machine the learner owns). The PoC's reference setup is the model on a second machine over Tailscale; the check also passes with the model on the laptop itself.
- Everything we add lives in new files: `apps/agent/src/coach/`, `apps/agent/skills/{coach-playbook,step-contract,evidence-rules}/`, `apps/app/src/hooks/use-coach-ui.tsx`, `apps/app/src/components/coach/`, `curriculum/`.

## Build order (one step per session, tests green and a commit at the end of each)

1. Contract and content: `curriculum/` (stations.json, lessons JSON for the four stations, map.json, stories, chapters) and `curriculum/validate.py`. Done when the validator passes.
2. Shell and cards: strip the demo, register the eight components as CopilotKit hooks, stub agent that walks the steps with canned prose. Done when chapter 1 runs end to end in the sandbox with no model.
3. Evidence collector: `src/coach/probes.py`, consent, Check result card. Done when the memory step and Local chat verify on a real Mac and a real Linux laptop, and Prove it stays local verifies with the model on a second machine over Tailscale.
4. Agent, as designed: coach prompt, skills, tools, `CoachStateMiddleware`. Done when the coach teaches chapter 1 from the contract with the real model.
5. Recap and `assisted` re-runs, `tester.sh`. Done when a second session a day later opens with a recap.

Start step 1 in plan mode and show the plan before writing code.

## Files you do not touch

`apps/app/src/components/generative-ui/open-generative-ui/`, `apps/app/src/lib/sandbox/prompt-bridge.tsx`, `apps/app/src/lib/copilotkit-runtime-options.ts`, `apps/agent/src/credentials.py`, `apps/agent/src/model.py`, `apps/agent/src/visualization_router.py`, `packages/design-system/`. Upstream fixes merge into these; our code goes around them.

## Hard rules

- The agent binds to `127.0.0.1`, never `0.0.0.0` (`main.py` and the `dev:agent` script).
- No telemetry: delete `launch-telemetry.ts` and PostHog; set `DO_NOT_TRACK=1` in `.env.example`.
- Probes are `subprocess.run(argv, shell=False, timeout=5)`. Never a shell string. Never write anything. Return matched lines only, never raw output. Every probe name is in the allowlist in `probes.py`; a lesson that names another fails validation.
- `progress.json` (`~/.local-ai-coach/`) is written only by `set_progress`, `end_session`, the review scheduler, the event records (`chapter_ended`, `user_navigated`, and `step_shown` from the model's `show_next_step` call; stories 19 and 22) and the learner's goal from the whole map (`POST /coach/goal`, story 29; it touches only `goal`, never a status), by atomic rename. Status moves up only: unseen, read, rehearsed, reported, assisted, verified; `skipped` from anything below verified. Restart coach (story 23) never edits it: it moves the whole file, with `consent.json`, into `old/<stamp>/`, and the next record starts empty. Ratings (story 26) are separate: one file each in `ratings/`, written only by `POST /coach/rating`, never edited, never moved by Restart coach, never sent anywhere.
- `run_do_it` runs only after a `run_confirm` result in the thread, in the agent's PTY, and records `assisted`.
- Everything the coach says follows `assets/tone-of-voice-guide.md` (the same guide as `panel/style-guide.md`): canned text (stub replies, check notes, card labels, buttons, error lines), the system prompt's Voice section (a chat subset of the guide with book passages as examples), skills and lesson JSON. Also `panel/authoring-policy.md` for lessons: no em or en dashes, nothing from the avoid list, UK spelling, define a term before using it. Check prose with `python3 panel/stylecheck.py --book <file>`; `apps/agent/tests/test_voice.py` scans the coach's frontend text.
- Keep upstream's streaming tool contract text in `src/prompt.py` verbatim; `test_canonical_contract.py` and `test_skills_contract.py` must stay green.
- Dependencies are pinned in the lockfiles. Upgrading or adding one is a deliberate change with Julian's OK, never a side effect. On this machine never run `uv lock` or `uv add`: the installed uv is older than the one that wrote `apps/agent/uv.lock` and rewrites the whole lock.

## No explanatory metadata in the UI

Never add visible words that describe the interface instead of being the content or a control: card-type labels ("Story", "In your settings"), headings over a figure, captions that restate it, footer lines saying which model answers or where keys live. Julian has removed every one of these by hand. Examples, in his words:

- The step card's label "In your settings": "not needed" (story 25).
- The word "Station" before a figure's choice buttons, and the heading "Priya's week, on the map" with its caption: "I don't know what the word 'Station' is doing there remove it", "both unnecessary chatter kill them" (the three-stations figure).
- The line under the message box ("My answers come from ... Your keys are in this Mac's Keychain."): "The last row of text does not need to be there. We can add a help menu that explains all these things."

Also the grey "Story" above the chapter 0 bubbles. What to do instead: a name a screen reader needs goes in `aria-label` or `coach-sr-only` (`CoachCard`'s `quietLabel`); an explanation goes in the help menu, not in the chat. A new visible label, caption or helper line needs Julian to ask for it.

## Any change to what is taught: check its reach before changing anything

This applies wherever the change starts and whatever the medium: feedback on a coach card, a lesson, a figure, a story, the book text, the station graph, the table of contents, a test, or a conversation about the curriculum. A change in one artefact is rarely about that artefact alone. **Changes flow both ways.** A change to the coach goes back into the book, the book's changes go into the coach, and either can change the curriculum and the TOC. The coach never teaches something the book contradicts.

Before changing any learner-facing content:

1. Check it against every other artefact, not just the one it was raised on: `curriculum/stations.json` (does a station's `headNote`, `proof`, `needs` or `inYourHead` already cover it, contradict it, or need to change?), `curriculum/map.json` (terms and their reading order), every lesson, story and chapter that touches the idea, the figures (`curriculum/figures.json`), the reading order and V1 scope (`curriculum/scope.json`), the book's chapter plan (`panel/final-narrative.md`, chapter front-matter), `docs/spec.md`, the book text under `panel/`, and the coach's own words (prompt, skills, canned text in code).
2. Write the impact as a proposal in `docs/design/<YYYYMMDD>-<topic>-proposal.md`: each place affected, what changes there, what stays, and which decisions are the author's. Taxonomy changes (new or moved stations, changed proofs) and changes to the book's own text are always the author's decision.
3. Only then change content, through the validator (`make check`), and record in the proposal what was done.

Code tests never assert curriculum content (wording, counts, labels): they use made-up fixtures. Content is checked by `curriculum/validate.py`.

## Kept from upstream CLAUDE.md

- `generateSandboxedUi` parameter order: `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`. Styles only in `css`. JS channels are classic scripts: no top-level await.
- Use the validated `sendPrompt` / `openLink` sandbox bridge, never raw postMessage. Preserve preview isolation and incremental streaming.
- Label sample data as sample. Never imply a mock form authenticates.
- Checks: `pnpm install`, `pnpm test` (vitest, then `bun test` for the server), `pnpm --filter @repo/app typecheck`, `uv run --directory apps/agent pytest`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e` in `apps/app`. A rendered chat shell does not prove generation works.
- Keep secrets out of source, logs and screenshots.

## Where things are

- `docs/design.md`: the design, section by section (stack as it is, architecture, repo plan, agent, frontend, on-disk contracts, probes, session flow, running, testing, risks).
- `curriculum/stations.json`: the 179-station graph, source of truth for the map.
- `curriculum/stories/legal-letter.md`: chapter 0, read by the `story` card.
- `curriculum/chapters/know-your-machine.md`: chapter 1 with YAML front-matter (the front-matter is never shown to the learner).
- `panel/`: authoring policy, style guide, the panel brief, the final chapter text, `stylecheck.py`.
