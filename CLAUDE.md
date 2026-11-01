# local-ai-coach: working rules

This repo is a fork of CopilotKit/OpenIntelligentUI, kept as shipped, with a coaching curriculum, components, tools and a local evidence collector added. It is V1 of the coach for the book series Mastering Local AI. Read `docs/design.md` before changing anything; it is the technical design and the build order. `docs/poc-plan.md` is the product plan it implements; `docs/spec.md` is the longer-term spec (V2 and after). Where this file and `docs/design.md` disagree, the design wins and this file is wrong.

## What V1 is

- The upstream stack runs unchanged: Python LangGraph agent on :8123, CopilotKit runtime route, Next.js chat, hosted OpenAI `chat-latest`, hosted Jev via TypeSafe. Both hosted providers stay in V1. Do not replace them.
- Scope: Priya's story (chapter 0), Know your machine, Local chat, Prove it stays local. macOS and Linux. Nothing else.
- The local story is a model on a machine the learner owns, reached over their own network or their tailnet (Tailscale). Not "wifi off": that framing is gone from the taxonomy, the chapters and the design. The proof reads where the chat app's bytes go (`connections` probe: loopback, private or tailnet only; `tailnet` probe: `tailscale status --json` to match a tailnet address to a machine the learner owns). The PoC's reference setup is the model on a second machine over Tailscale; the check also passes with the model on the laptop itself.
- Everything we add lives in new files: `apps/agent/src/coach/`, `apps/agent/skills/{coach-playbook,step-contract,evidence-rules}/`, `apps/app/src/hooks/use-coach-ui.tsx`, `apps/app/src/components/coach/`, `curriculum/`.

## Build order (one step per session, tests green and a commit at the end of each)

1. Contract and content: `curriculum/` (stations.json, lessons JSON for the four stations, map.json, stories, chapters) and `curriculum/validate.py`. Done when the validator passes.
2. Shell and cards: strip the demo, register the eight components as CopilotKit hooks, stub agent that walks the steps with canned prose. Done when chapter 1 runs end to end in the sandbox with no model.
3. Evidence collector: `src/coach/probes.py`, consent, Check result card. Done when Find your number and Local chat verify on a real Mac and a real Linux laptop, and Prove it stays local verifies with the model on a second machine over Tailscale.
4. Agent, as designed: coach prompt, skills, tools, `CoachStateMiddleware`. Done when the coach teaches chapter 1 from the contract with the real model.
5. Recap and `assisted` re-runs, `tester.sh`. Done when a second session a day later opens with a recap.

Start step 1 in plan mode and show the plan before writing code.

## Files you do not touch

`apps/app/src/components/generative-ui/open-generative-ui/`, `apps/app/src/lib/sandbox/prompt-bridge.tsx`, `apps/app/src/lib/copilotkit-runtime-options.ts`, `apps/app/src/app/api/copilotkit/route.ts`, `apps/agent/src/credentials.py`, `apps/agent/src/model.py`, `apps/agent/src/visualization_router.py`, `packages/design-system/`. Upstream fixes merge into these; our code goes around them.

## Hard rules

- The agent binds to `127.0.0.1`, never `0.0.0.0` (`main.py` and the `dev:agent` script).
- No telemetry: delete `launch-telemetry.ts` and PostHog; set `DO_NOT_TRACK=1` in `.env.example`.
- Probes are `subprocess.run(argv, shell=False, timeout=5)`. Never a shell string. Never write anything. Return matched lines only, never raw output. Every probe name is in the allowlist in `probes.py`; a lesson that names another fails validation.
- `progress.json` (`~/.local-ai-coach/`) is written only by `set_progress`, `end_session` and the review scheduler, by atomic rename. Status moves up only: unseen, read, rehearsed, reported, assisted, verified; `skipped` from anything below verified.
- `run_do_it` runs only after a `run_confirm` result in the thread, in the agent's PTY, and records `assisted`.
- Learner-facing text (prompt, skills, card copy, lesson JSON) follows `panel/style-guide.md` and `panel/authoring-policy.md`: no em or en dashes, nothing from the avoid list, UK spelling, define a term before using it. Check prose with `python3 panel/stylecheck.py --book <file>`.
- Keep upstream's streaming tool contract text in `src/prompt.py` verbatim; `test_canonical_contract.py` and `test_skills_contract.py` must stay green.
- Pin every dependency at the versions in the lockfiles. No upgrades during V1.

## Kept from upstream CLAUDE.md

- `generateSandboxedUi` parameter order: `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`. Styles only in `css`. JS channels are classic scripts: no top-level await.
- Use the validated `sendPrompt` / `openLink` sandbox bridge, never raw postMessage. Preserve preview isolation and incremental streaming.
- Label sample data as sample. Never imply a mock form authenticates.
- Checks: `pnpm install`, `pnpm test`, `uv run --directory apps/agent pytest`, `pnpm lint`, `pnpm build`. A rendered chat shell does not prove generation works.
- Keep secrets out of source, logs and screenshots.

## Where things are

- `docs/design.md`: the design, section by section (stack as it is, architecture, repo plan, agent, frontend, on-disk contracts, probes, session flow, running, testing, risks).
- `curriculum/stations.json`: the 139-station graph, source of truth for the map.
- `curriculum/stories/legal-letter.md`: chapter 0, read by the `story` card.
- `curriculum/chapters/know-your-machine.md`: chapter 1 with YAML front-matter (the front-matter is never shown to the learner).
- `panel/`: authoring policy, style guide, the panel brief, the final chapter text, `stylecheck.py`.
