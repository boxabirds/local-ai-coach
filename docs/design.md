# Coach PoC: technical design (V1 on the CopilotKit stack)

Nov 1, 2026 · @Julian Harris

## Decision and scope

V1 of the coach is a fork of Open Intelligent UI run as shipped, except the web side (now built and served by Bun, story 31): the Python LangGraph agent, the CopilotKit runtime, the React chat page, hosted OpenAI for answers and hosted Jev for presentation decisions. We add our curriculum, our components, our tools and a local evidence collector, and change nothing in how the stack talks to itself. The point of V1 is to test the teaching with five people, and every piece of stack we replace before that is risk spent on the wrong question.

What that buys and what it costs:

- Buys: a working chat with generative UI, human-in-the-loop cards, state sync, a sandboxed renderer and a deploy story, on day one. The tooling for adding a component is a hook and a Zod schema. The tooling for adding a tool is a Python function.
- Costs: two API keys per tester (OpenAI, TypeSafe), a Python runtime on the tester's machine (shipped inside the release since story 32; Node is gone since story 31), and a coach that cannot itself pass the Wednesday check. The last one is a teaching problem, not a technical one: the coach says so, in chapter 1's own words, and the learner's model passes the check while the coach watches.

V2 and after moves the pieces in-house one at a time, keeping the CopilotKit frontend hooks because they are the part that worked: the agent to TypeScript over the brain contract (Claude Agent SDK or a local OpenAI-style loop), Jev to a local decision model or to no router at all, and finally an installer. (The web side already moved to a static build served by one Bun process, story 31.) The spec and PoC tabs in the companion doc describe that end state; this document is V1 only.

Scope is unchanged from the PoC plan: Priya's story, What can my computer do? (was Know your machine), Local chat, and Is my chat app talking to anyone else? (was Prove it stays local), on macOS and Linux, with the real-machine evidence loop and the simulation loop both working for those four. The local story is a model on a machine the learner owns, reached over their own network or their tailnet (Tailscale), not a laptop with its wifi off; the proof reads where the chat app's bytes go.

## The stack as it is

Read from the repo at HEAD `8391a94`, without installing dependencies, so anything about library internals is inferred and marked so. Three processes and one package:

| Piece | What it does | What we need to know |
| --- | --- | --- |
| `apps/agent` (Python, FastAPI on :8123) | `create_deep_agent` with tools `query_data`, `get_trip_stop_images`, `plan_visualization`, `manage_todos`, `get_todos`, `generate_form`; middleware in order `RequestModelMiddleware`, `CopilotKitMiddleware`, `JevVisualizationMiddleware`, `ConsecutiveSystemMessagesMiddleware`; `BoundedMemorySaver(max_threads=200)`; skills read from three bundled `SKILL.md` files through a read-only `CompositeBackend` route at `/skills/` | Adding a tool is a `@tool` function in `main.py`'s list. Adding a skill is a folder plus a name in `skill_backend.py:16`. Threads die on restart. `AgentState` is passed as `context_schema`, not `state_schema` (`main.py:45`), so the todos channel is not where it looks; we add our own state through a middleware's `state_schema`, as `RoutingState` does (`visualization_router.py:48`) |
| Jev routing (`src/visualization_router.py`) | Once per user turn, POSTs the last four messages to `https://api.typesafe.ai/v1/systemone` with a `choice` question over 13 visualisation types; maps the answer to `text`, `a2ui` or `open_generative_ui`; strips rendering tools that do not match; appends a "CRITICAL: Jev presentation decision" note to the system prompt | Mandatory: a missing key, timeout or odd response fails the turn, no fallback. Only tools in `RENDER_TOOLS` are filtered; our coaching tools and any `useHumanInTheLoop` registration pass through untouched. One Jev call per turn is the whole cost of keeping it |
| Runtime (`apps/app/src/api/copilotkit.ts`, served by `apps/app/server.ts`) | Builds a `CopilotRuntime` per request with one `LangGraphHttpAgent` at `LANGGRAPH_DEPLOYMENT_URL` (default `http://localhost:8123`), `openGenerativeUI: true`, `a2ui.injectA2UITool: true`, optional rate limiting, optional MCP Apps server | Visitor keys travel as `x-openai-api-key` and `x-jev-api-key` headers to the agent. Nothing here changes for V1 |
| Frontend (`apps/app`, React 19 built by `Bun.build`, CopilotKit `1.55.2-next.1`) | `src/web/providers.tsx` mounts `CopilotKit` with the Open Generative UI renderer, the A2UI table catalogue and two sandbox functions (`sendPrompt`, `openLink`); `hooks/use-generative-ui-examples.tsx` registers `pieChart`, `barChart` (`useComponent`), `plan_visualization` (`useRenderTool`), `scheduleTime` (`useHumanInTheLoop`), `toggleTheme` (`useFrontendTool`); `KeyGatedChatView` refuses to send until both visitor keys are entered and validated live | The hook file is the template for our components. The key gate applies even when the server has keys, so testers enter keys in the header dialog; that is acceptable for V1 and avoids us holding anyone's key |
| Renderer (`components/generative-ui/open-generative-ui/`, 467 lines) | CSS-first gating, Idiomorph preview, then a `@jetbrains/websandbox` iframe with a CSP limited to cdnjs, esm.sh, jsdelivr, unpkg; importmap for three, d3, gsap, chart.js; height clamped 50 to 4000 | Untouched in V1. Improvised explainers need the internet for the importmap; the coach is told so |
| `packages/design-system` | Theme CSS, SVG classes, form styles, the `OPEN_GEN_UI_DESIGN_SKILL` text, the importmap | Untouched |

Things the survey found that shape the design:

- No persistence anywhere: no localStorage on the client, in-memory checkpointer on the agent. Our `progress.json` is therefore the only durable state, and the agent must be able to rebuild a coaching turn from it alone.
- The BYOK model path hard-codes `https://api.openai.com/v1` and `chat-latest` (`model.py:74-102`), ignoring `LLM_MODEL`. Fine for V1; it is one of the first lines V2 changes.
- Dead or unused code we delete rather than inherit: `src/templates.py`, `generate_form` (never reachable after routing), the demo gallery, template library, QR "pick" flow, desktop tip modal, explainer cards, PostHog, launch telemetry.
- `langgraph.json` points at a `graph` symbol that does not exist; the real entry is uvicorn. Leave it or fix it; it is not on our path.
- The lockfile pulls `@copilotkit/license-verifier@0.0.1-a1`. What it checks at runtime is unknown to me and should be read before any tester build.
- The sandbox, the skills and the agent's image tool all assume the internet (esm.sh, CDNs, Wikipedia). V1 accepts that; the Wednesday check is about the learner's model, not the coach.

## Target architecture

Everything the stack has stays where it is. The one architectural fact we lean on: the Python agent already runs on the learner's laptop (`localhost:8123`), so it is the natural home for the evidence probes and the progress file. No new process is added.

&#91;embedded content: V1 processes · 3 local, 2 hosted, 5 links\]

The browser never reaches the machine or the files; every probe and every write goes through an agent tool, so the transcript shows it. The hosted pair is reached only from the agent, with the visitor's own keys forwarded in headers from the browser, as upstream already does.

## Repo plan

Fork `CopilotKit/OpenIntelligentUI` into `boxabirds/local-ai-coach` (name is a placeholder) and keep upstream as a remote so renderer and runtime fixes can be merged. The rule for V1: edit as little of the stack as possible, add in new files, delete demo code outright so it cannot be reached by accident.

| Path | Action | Why |
| --- | --- | --- |
| `apps/agent/main.py` | Edit: replace the tools list with ours; add `CoachStateMiddleware` to the middleware list after `CopilotKitMiddleware`; keep everything else | The one wiring point for tools and state |
| `apps/agent/src/prompt.py` | Replace `SYSTEM_PROMPT` with the coach prompt (see Agent design); keep the streaming tool contract section verbatim, the tests check it | Persona, voice, teaching rules |
| `apps/agent/skills/` | Delete `master-playbook`; keep `advanced-visualization` and `svg-diagrams` for improvised explainers; add `coach-playbook`, `step-contract`, `evidence-rules`; update `_SKILL_NAMES` in `skill_backend.py:16` | Skills are how this agent reads long instructions |
| `apps/agent/src/coach/` | Add: `curriculum.py` (load and validate), `progress.py` (read, write, review queue), `probes.py` (evidence collector), `pty.py` (doIt runner), `tools.py` (the `@tool` functions), `state.py` (`CoachState`, the middleware) | All new code in one package |
| `apps/agent/src/{query,trip_images,plan,todos,form,templates}.py` | Delete, with their tests | Demo tools |
| `apps/agent/src/visualization_router.py` | Keep unchanged. Add `step_card`, `check_result`, `number_card`, `recap_card`, `run_confirm`, `show_map`, `show_story` to nothing: they are not in `RENDER_TOOLS`, so Jev never strips them | Zero-risk coexistence with Jev |
| `apps/agent/src/db.csv` | Delete | Sample data |
| `apps/app/src/hooks/use-generative-ui-examples.tsx` | Replace with `use-coach-ui.tsx`: the eight registrations | Our components |
| `apps/app/src/components/coach/` | Add: `story.tsx`, `step-card.tsx`, `sandbox-terminal/` (fake shell), `terminal-transcript.tsx`, `number-card.tsx`, `tube-map.tsx` (ports the existing map's SVG), `check-result.tsx`, `recap-card.tsx`, `run-confirm.tsx` | Plain React, no CopilotKit inside them |
| `apps/app/src/hooks/use-example-suggestions.tsx` | Edit: three starters, "Read Priya's story", "What can my computer do?", "Where am I on the map?", on the start screen only | First-run entry points |
| `apps/app/src/web/app.tsx` (was the upstream page) | Edit: title, remove GitHub and CopilotKit header links, keep the key dialog and New chat | Shell |
| `apps/app/src/components/{demo-gallery,template-library,qr-modal,explainer-cards,desktop-tip-modal,example-layout}` and `app/pick/`, `app/api/pick/` | Delete | Unused or demo |
| `apps/app/src/lib/launch-telemetry.ts`, `components/posthog-analytics.tsx` | Delete; remove from `providers.tsx` and the CopilotKit route (done with story 31) | No telemetry |
| `apps/app/src/lib/sandbox/sandbox-functions.ts` | Add `reportEvent({step, kind, detail})`; keep `sendPrompt`, `openLink` | Lets an improvised widget talk to the checker |
| `curriculum/` (repo root) | Add: `stations.json`, `map.json`, `lessons/*.json`, `stories/*.md`, `chapters/*.md`, `validate.py` | The content, outside the app folders so the book build can share it |
| `apps/agent/.env`, `Makefile` | Edit `setup` to also create `~/.local-ai-coach/` with `consent.json` template; add `make tester` | Setup |
| `docker/`, `render.yaml`, `.github/workflows/ci.yml` | Keep CI (lint, test, pytest); delete Render and Docker, V1 is not deployed | Not hosted |
| `apps/mcp/` | Leave in place, unused | Future MCP Apps route |

Everything under `apps/app/src/components/generative-ui/open-generative-ui/`, `lib/sandbox/prompt-bridge.tsx`, `lib/copilotkit-runtime-options.ts`, the credentials code and `packages/design-system` is untouched.

## Agent design

**Model and routing.** As shipped: `chat-latest` through the visitor's OpenAI key, Jev through the visitor's TypeSafe key, one Jev call per user turn. The Jev choice set and the `RENDER_TOOLS` filter are left alone. In practice most coaching turns will route to `text`, which strips `generateSandboxedUi` and `render_a2ui` and leaves our tools, and a "draw me how memory differs from disk" turn routes to `open_generative_ui`, which is exactly when we want the sandbox.

**System prompt** (`src/prompt.py`), in this order:

1. Who you are: the coach for Mastering Local AI. The voice rules from the style profile, compressed: short sentences, contractions, first person, plain English, define before use, no phrase from the avoid list (the list is included), no dashes.
2. The teaching rules: one step at a time; the step card is the unit; never mark progress yourself, call `set_progress` with evidence; when the learner asks for something past an unmet prerequisite, say so and offer the shortest route; when they say skip, call `set_progress(status="skipped")` and move on; when they ask why, answer in at most four sentences and return to the step; define any term not in the learner's `taught` list before using it.
3. The map, compressed: every station as `id: name [status] needs(...)`, built per turn by `CoachStateMiddleware` from `progress.json` (about 4 KB).
4. The current station's lesson JSON and chapter body, and the due review items, injected by the same middleware as a system message so the model sees them without a tool round-trip.
5. The upstream streaming tool contract and sandbox rules, verbatim, so improvised explainers keep working and the contract tests pass.

**Skills** (read by the model through the bundled read-only backend): `coach-playbook` (how a session opens, how a step is run, how to react to a failed check, how to end with a summary), `step-contract` (the lesson JSON fields and what each means, with two worked examples), `evidence-rules` (what the probes return, how to read confidence, never to claim a check passed without a `check_result`). `advanced-visualization` and `svg-diagrams` stay for the improvised path.

**State.** `CoachState(RoutingState)` adds `station_id`, `step_id`, `progress_snapshot` (the compressed map), `due_reviews`, `session_summary`. Registered through `CoachStateMiddleware.state_schema`, mirroring how `JevVisualizationMiddleware` adds `RoutingState`. `before_agent` loads `progress.json` and the curriculum, fills these fields and appends the system message in step 4 above. The frontend reads `station_id`, `step_id` and `progress_snapshot` through `useAgent` to drive the map.

**Tools** (all in `src/coach/tools.py`, plain `@tool` functions; those that change state return `Command(update=...)` as `manage_todos` does):

| Tool | Params | Does | Returns |
| --- | --- | --- | --- |
| `get_station` | `station_id` | Reads lesson JSON, chapter body, map.json terms for that station | The station record |
| `start_step` | `station_id, step_id` | Sets `station_id`/`step_id` in state; the frontend's `step_card` HITL tool is then called by the model | `Command(update=...)` |
| `run_check` | `station_id, step_id` | Runs the step's `check`: `real` → probes; `sim` → reads the last sandbox events the frontend reported; `ask` → returns the rubric for the model to judge | `{passed, evidence[], shown_to_learner}` |
| `set_progress` | `station_id, status, by, evidence?, note?` | Validates the transition (upgrade only; `red` cannot be skipped past a destination), writes `progress.json`, updates the review queue | `Command(update={progress_snapshot})` |
| `run_do_it` | `station_id, step_id` | Only after the frontend `run_confirm` HITL tool returned `confirmed`; runs `doIt.cmd` in the agent's PTY, streams output back as the tool result, records `assisted` | Transcript and the check result |
| `probe` | `name` | One named probe from the allowlist, for the coach to look at the machine outside a step ("is anything listening on 8080?") | Matched lines only |
| `due_reviews` | none | Review items due today, at most three | List |
| `end_session` | `summary` | Appends the summary to `progress.json` `sessions[]` | ok |

The frontend tools the model also sees, because the browser registers them: `story`, `step_card`, `number_card`, `check_result`, `recap_card`, `run_confirm`, `show_map`, `sandbox_event` (frontend tool the sandbox calls, not the model). Their schemas are in the next section.

**As built in step 4 (Ceetrix story 10).** Six tools are built: `get_station`, `start_step`, `run_check`, `set_progress`, `probe` and `end_session` (`src/coach/tools.py`). `run_do_it` and `due_reviews` arrive with step 5. Three rules are enforced in code, not left to the prompt:
- `run_check` reads the learner's number from their own `number_card` answer in the thread, never from the model.
- `set_progress(verified)` is refused unless the thread holds a passing `run_check` result for that step.
- Consent is saved only by `CoachStateMiddleware`, from the learner's `consent_card` answer.

The check card for the real coach is drawn from `run_check`'s own result (`useRenderTool`), not from a `check_result` call the model makes, so the learner always sees what was really run. `progress.json` and the stub's `progress.stub.json` share `src/coach/progress.py`.

**What the model is never allowed to do:** write `progress.json` except through `set_progress`; run a shell command except through `run_do_it` after `run_confirm`; call a probe not on the allowlist. deepagents' own file tools operate on the thread's scratch `StateBackend`, not the host filesystem (the survey confirmed the backend has no host access), so they are harmless and stay.

## Frontend design

One file, `apps/app/src/hooks/use-coach-ui.tsx`, replaces `use-generative-ui-examples.tsx` and registers everything. Components are plain React under `components/coach/`, with no CopilotKit imports inside them, so they survive the V2 move.

**The whole map** (Ceetrix story 29; proposal `docs/design/20261106-whole-map-proposal.md`): the header's Map button opens every station full screen. Positions come from `curriculum/map-layout.json`, generated by `apps/app/scripts/layout-map.mjs` (elkjs) with `make map-layout` and checked by the validator (MAP_LAYOUT). It opens on "You are here" at a readable size; covered stations and the route are at full strength, the rest at half. Tapping a destination can make it the learner's goal (`POST /coach/goal`, kept in `progress.json` as `goal`); the route is everything the goal needs that isn't covered, and the coach is told both each turn.

**Scrolling** (Ceetrix story 28) has one owner, `FollowEnd` (`components/chat/follow-end-view.tsx`): the chat follows its end while the learner is at the end, leaves them alone once they scroll up to reread, and follows again when they act (a button in the chat, Space or Enter, a message sent, a card answered) or scroll back down. Cards only take focus (`preventScroll`); none scrolls. A test fails if any other app code moves the chat.

| Registration | Hook | Zod params (from the model) | Component behaviour | Resumes the agent with |
| --- | --- | --- | --- | --- |
| `story` | `useHumanInTheLoop` | `{ story_id: string }` | Renders `stories/<id>.md` fetched from the agent (`/curriculum/story/<id>`), one question at the end with three options | `{ read: true, answer: string }` |
| `step_card` | `useHumanInTheLoop` | `{ station_id, step_id, text, where, hint, has_do_it: boolean }` | Shows the instruction; `?` reveals hint; `Do it for me` sends `{ action: "do_it" }`; `I did it` sends `{ action: "claim" }`; `Skip` sends `{ action: "skip" }`. For `where: sandbox` it mounts the sandbox terminal beneath and auto-responds when the sandbox emits the matching event | `{ action, sandbox_events?: Event[] }` |
| `number_card` | `useHumanInTheLoop` | `{ prompt: string, unit: "GB" }` | Number input plus "where to look" per OS (read from `navigator.platform`) | `{ value: number }` |
| `run_confirm` | `useHumanInTheLoop` | `{ cmd: string, explain: string }` | Shows the exact command and its one-line explanation; Run or Cancel | `{ confirmed: boolean }` |
| `recap_card` | `useHumanInTheLoop` | `{ item_id, question, kind: "recap" \| "redo", options?: string[] }` | One question or a "now you" step; Skip defers | `{ answer?: string, skipped?: boolean }` |
| `check_result` | `useComponent` | `{ station_id, step_id, passed: boolean, evidence: { probe, cmd, matched: string[] }[], note?: string }` | Passed (green, with the word) or Not yet (neutral, with the words); never amber, which is reserved for criticality; "show me what you looked at" expands the exact command and matched lines | (no response) |
| `show_map` | `useComponent` | `{ focus?: station_id }` | The tube map SVG with its data from `useAgent().state.progress_snapshot`. Each station shows two separate facts: criticality (from `stations.json` `inYourHead`) by colour and shape, grey circle, amber diamond, red triangle with "!", with a key; and the learner's progress by how full the marker is (empty, a quarter, a half, full; dashed when skipped) plus a word. Progress never changes colour. Click a station to `sendPrompt("tell me about <station>")` (later) | (no response) |
| `terminal_transcript` | `useRenderTool` on `run_do_it` | tool args and result | Streams the PTY output as the tool runs, keeps it in the thread | n/a |
| `sandbox_event` | `useFrontendTool` | `{ step_id, event }` | Not for the model to call; the sandbox terminal calls it so the event lands in the thread and `run_check(kind="sim")` can read it | n/a |

Notes on the hooks, from the code:

- `useHumanInTheLoop`'s `render` gets `status` (`inProgress`, `executing`, `complete`) and `respond(string)`. We `respond(JSON.stringify(obj))`, and the agent-side tool result is that string; `coach-playbook` tells the model to parse it.
- `useDefaultRenderTool` upstream renders a `ToolReasoning` card for every tool call. Keep it for `get_station`, `set_progress`, `probe`, `end_session`, so the learner sees what the coach did, which is the "nothing silent" rule for free.
- The map reads agent state through `useAgent()`; `agent.state.progress_snapshot` updates whenever `set_progress` returns its `Command`. No separate fetch.
- The sandbox terminal is a fresh component: an in-memory file tree, a command table, and an `emit(event)` callback. It renders inside `step_card` only when `where === "sandbox"`. About 600 lines of TypeScript for the command set chapters 0 and 1 need.
- Styling: the existing `packages/design-system` tokens, so the cards match the improvised explainers.
- The key dialog stays as upstream. The header copy changes to "Connect the coach" and explains that V1 uses two hosted keys and that the learner's own model stays local.

Starter suggestions become: "Read Priya's story", "Find my number", "Where am I on the map?". The welcome text: "This is the coach for Mastering Local AI. Start with the story."

## Curriculum and progress on disk

**Curriculum** lives at the repo root in `curriculum/`, read by the agent at startup and on `SIGHUP`, never written. The spec's contracts apply; the V1 subset:

```
curriculum/
  stations.json        the existing file, 179 stations
  scope.json           V1 reading order (story, then the three lessons) and assumed stations
  map.json             term register for the four V1 stations only
  lessons/
    machine.json       What can my computer do?: the memory, graphics card memory and fits steps
    localchat.json     Local chat steps (draft)
    prove.json         Is my chat app talking to anyone else?: the Wednesday check steps (draft)
  stories/
    legal-letter.md    Priya, chapter 0, the story for destination d_legal
  chapters/
    know-your-machine.md  chapter 1 body, front-matter as YAML
  figures.json         the figures: words, choices, print state, coach and book placement
  figures/
    make_figures.py    draws every figure; --check reports stale files
    <id>.svg           one per figure, its states marked data-when="key=value"
    print/<id>.svg     the same figure in its print state, for the book
  validate.py          run by pytest and by make check
```

**Figures** (Ceetrix story 7; proposal and decisions in `docs/design/20261105-illustration-proposal.md`). A figure is an SVG drawn by `make_figures.py`, so its arithmetic is computed. Its states are elements with `data-when`; the coach shows the elements whose conditions match the learner's choices. The book shows the print drawing. A story or chapter places a figure with `<!-- figure: id -->` on a line of its own (invisible in Markdown); a lesson step places it with `"figure": "id"`. Each figure appears once in the coach and once in the book, never blocks Next, and records no progress. `validate.py` checks placement, unsafe SVG, that every state draws exactly one result, the three-quarters rule, station colours, print drawings against their source, and every word through the term clock and voice rules.

The lesson JSON is the PoC tab's contract: `station`, `teaches`, `previews`, `stands`, `why`, `mnem`, `steps[]` with `id`, `text`, `where`, `hint`, `doIt`, `check`, `onFail`, and `recap[]`. `validate.py` checks: every `needs` resolves and the graph is acyclic; every lesson's `station` exists; every term used in a step's `text` is in `teaches` of that station or an earlier one on its path, or in `map.json` with a `definedIn` that is earlier; every `check.kind=real` names a probe on the allowlist; every `doIt.kind=shell` command is a single line with no `sudo`, `rm`, `curl | sh` or redirection.

Additions made in build step 1, so the four V1 items could be written against it:

- Lesson: `status` (`final` or `draft`) and `untested[]`; a draft must list what has not been tried on a real machine.
- `where` gains `coach`, for steps answered on a card in the chat (the number card, an ask).
- `doIt.kind` is `shell` (`cmd`, `explain`), `sim` (`cmd`, typed into the practice terminal) or `instructions` (`explain`). Shell and sim commands also refuse pipes of any kind, `;`, `&`, backticks and `$(`: one command per step.
- `check.kind=real` takes `probe` or `probes[]`, with `params` for the values the probe needs (`probes.py` lists them; a missing one fails validation), plus optional `compare`, `toleranceGb` and `expect` (`owned`: every destination loopback, private or an owned tailnet node).
- Fill-in values the coach replaces from the learner's record: `{server}`, `{server_name}`, `{chat_app}`, `{measured}`, `{typed}`, `{address}`. Any other `{name}` fails validation.
- `curriculum/scope.json` gives the reading order (the define-before-use clock) and the stations V1 assumes without teaching (`lmbasics`, `web`). `map.json` terms carry `forms[]` (the spellings matched) and `firstAt` (the reading-order item that defines them). Chapter 1's front-matter `terms` must agree with `map.json`.
- The term check covers registered terms only. A technical word with no `map.json` entry is invisible to it; that is left to a human read.

**Showing criticality and progress.** Two dimensions, two channels (decided 2026-11-05 from WCAG 1.4.1, Garner's separable dimensions, ski-trail ratings, ISO 3864 hazard signs and Harvey balls): the book's grey, amber and red appear only as a station's criticality, always with a shape and a word; progress is fill and words, never hue. `coach.css` holds the reserved `--crit-*` tokens and a test fails if they are used anywhere else.

**Progress** lives in `~/.local-ai-coach/progress.json`, created on first run, written only by `set_progress`, `end_session` and the review scheduler, always by atomic rename. The spec's schema with the two statuses the PoC added:

```json
{
  "schema": 1,
  "learner": { "zone": null, "os": "macos", "memory_gb": null, "goals": ["d_legal"] },
  "stations": {
    "machine": { "status": "verified", "by": "agent", "at": "...", "evidence": [ { "probe": "memory", "cmd": "sysctl -n hw.memsize", "matched": ["17179869184"] } ] }
  },
  "steps": { "localchat.2": { "status": "assisted", "at": "..." } },
  "review": [ { "item": "machine.recap.0", "due": "2026-11-05", "strength": 1 } ],
  "sessions": [ { "at": "...", "summary": "..." } ]
}
```

Status order: `unseen`, `read`, `rehearsed`, `reported`, `assisted`, `verified`, with `skipped` beside them. Transitions only move up, except `skipped`, which can be set from anything below `verified`. `red` stations refuse `skipped` when a destination that needs them is the learner's goal.

**Why not the LangGraph checkpointer for this.** It is in-memory and bounded, and even a durable one would tie progress to a thread id. Progress belongs to the learner across threads, restarts and V2, so it is a file the agent reads at `before_agent` and the model never sees raw.

**Consent** is `~/.local-ai-coach/consent.json`: `{ "probes": true, "history": true, "doIt": true, "granted_at": "..." }`, written by the first-run flow in the chat (a `run_confirm`-style card with the list of what the coach may read). A probe whose consent is missing returns `{ "denied": "consent" }` and the coach offers the paste-it path.

**Ratings** (Ceetrix story 26) are `~/.local-ai-coach/ratings/<UTC stamp>-<8 hex>.json`, one file per Good or Not good pressed in the palette on a coach item, written once by atomic rename from `POST /coach/rating` (refused from a browser; the app's `/api/coach-rating` accepts only the coach's own page). Each holds the rating, the optional reason, the rated item's words, the browser's copy of the conversation up to the rated turn (keys redacted) and the same in the eval cases' shape, the model in use, and fingerprints of the prompt, skills and curriculum. They are the author's test data, not the learner's progress: Restart coach leaves them, and nothing sends them anywhere. `make rating-to-case` turns one into a draft eval case in `apps/agent/evals/cases/drafts/` (not run until moved into `cases/`); `make ratings-export` zips them for a tester to send.

## Evidence collector

`src/coach/probes.py`: a dictionary of named probes, each a fixed argv list (never a shell string), a timeout of 5 s, a parser that returns matched lines only, and the consent key it needs. `run_check` and `probe` can only call names in this table; a step whose `check.probe` is not in it fails validation.

| Probe | macOS | Linux | Returns | Consent |
| --- | --- | --- | --- | --- |
| `memory` | `sysctl -n hw.memsize` | `grep MemTotal /proc/meminfo` | GB, rounded | probes |
| `history_has` | tail of `~/.zsh_history` or `~/.bash_history`, last 200 lines | same | the lines matching the step's command pattern, at most 3, with the command only (no timestamps, no other lines) | history |
| `process` | `pgrep -fl <name>` | same | pid and name for the allowlisted server names | probes |
| `listening` | `lsof -nP -iTCP:<port> -sTCP:LISTEN` | `ss -ltnp 'sport = :<port>'` | the one line, or empty | probes |
| `model_file` | `find ~/models ~/.ollama ~/.cache/lm-studio -name '*.gguf' -o -name '*.safetensors'` with `-maxdepth 4` | same | path and size for each, at most 10 | probes |
| `connections` | `lsof -nP -iTCP -sTCP:ESTABLISHED -a -p <pid>` | `ss -tnp state established '( sport = :<port> or dport = :<port> )'` | each remote address the chat app or model server talks to, classed as loopback, private (10/8, 172.16/12, 192.168/16), tailnet (100.64/10 or the Tailscale IPv6 range), or public | probes |
| `tailnet` | `tailscale status --json` | `same` | the learner's own tailnet nodes (name, address, online), so a tailnet address can be matched to a machine they own | probes |
| `server_log` | the agent's own PTY buffer when it launched the server; else none | same | the last completed chat turn's timestamp | probes |

The Wednesday check is: during a window in which `server_log` (or the chat app's own log) shows a completed turn, `connections` for the chat app lists only loopback, private or tailnet addresses, and every tailnet address appears in `tailnet` as a node the learner owns. One public address fails it, and the card names the address. Both halves are shown to the learner. The PoC's reference setup is the model on a second machine reached over Tailscale, which is also the case the old wifi-off framing could not express.

Rules enforced in code, not in the prompt:

- Every probe runs with `subprocess.run(argv, capture_output=True, timeout=5, shell=False)`; the home directory is expanded in Python, never by a shell.
- Nothing is written anywhere by a probe. `run_do_it` is the only writer, through the PTY, and only after `run_confirm`.
- The result stored in `progress.json` is the parsed `matched` list, never raw output. History lines are stored with the command text only.
- Every probe result goes back to the model as a tool result and to the learner through `check_result`; the two are the same object.
- The agent binds to `127.0.0.1` in V1 (upstream binds `0.0.0.0`; one-line change in `main.py:85` and the `dev:agent` script), since it now has probes on it.

macOS shell history is written on shell exit by default, so `history_has` will often miss a command typed a minute ago. V1 treats it as corroboration: `run_check` passes on the primary probe (`listening`, `model_file`, `memory`) and reports history as `seen` or `not yet`. The step card's `I did it` plus a passing primary probe gives `verified`; a passing primary probe with no claim gives `reported` by the agent, and the coach asks.

## Session flow

Turn by turn for a first-time learner on a Mac, showing which piece acts. Jev is called once at the start of every user turn and is not repeated below.

| # | Learner | Agent | Frontend |
| --- | --- | --- | --- |
| 0 | Opens `localhost:3000`, enters the two keys in the header dialog, Test, Save | `/credentials/validate` hits OpenAI and Jev | Key gate lifts; starters appear |
| 1 | Clicks "Read Priya's story" | `before_agent` finds no `progress.json`, creates it, sets `learner.os`; model calls `story(legal-letter)` | `story` card renders the markdown; the learner reads and answers the end question |
| 2 | (answer returns) | `set_progress(d_legal, read)`; model asks for consent to look at the machine, calls `run_confirm` with the probe list as the "command" | `run_confirm` shows the list; Allow writes `consent.json` via the tool result |
| 3 | "Find my number" | `get_station(machine)`; `start_step(machine, machine.1)`; model calls `step_card` with `where: settings` | Card: "Open About This Mac, read the Memory line"; learner clicks `I did it` |
| 4 | (claim returns) | Model calls `number_card` | Learner types 16 |
| 5 | (value returns) | `run_check(machine, machine.2)` runs `memory`, compares; `set_progress(machine, verified, evidence)`; model calls `check_result` | Green card: "You said 16 GB; the machine says 16 GB. Here is what I ran." Map updates through state |
| 6 | "Why does that matter?" | Four sentences from the chapter body already in context; back to the next station offer | Text only |
| 7 | "Local chat" | `get_station(localchat)`; `step_card(localchat.1, where: sandbox)` | Sandbox terminal mounts; learner types `curl http://{server}/v1/models`; `sandbox_event` fires; card auto-responds `rehearsed` |
| 8 | (returns) | `set_progress(localchat, rehearsed)`; `step_card(localchat.2, where: real-terminal, has_do_it: true)` | Learner clicks `Do it for me` |
| 9 | (do\_it returns) | `run_confirm(cmd, explain)` | Learner clicks Run |
| 10 | (confirmed) | `run_do_it` streams the PTY (the model list from the learner's server); the coach asks for the model name; `set_progress(localchat, assisted)`; then `step_card(localchat.3, where: chat-app)` and `run_check` runs `connections` on the chat app | Transcript card shows the output; the map marker is half filled with "done for you"; redoing it yourself fills it |
| 11 | "Is my chat app talking to anyone else?" | `step_card(prove.1, where: read)`: the three kinds of address that are yours; then `step_card(prove.2, where: sandbox)`: spot the public address in a practice list | Card, then sandbox |
| 12 | (answer) | `step_card(prove.3, where: chat-app)`: ask the chat app for something long; `run_check` runs `connections` and `tailnet` while it answers | Card, then `check_result` with both halves of the evidence |
| 13 | "bye" | `end_session(summary)`; review items scheduled for tomorrow | Text: what was done, what is due |
| next day | Opens the app | `before_agent` loads `due_reviews`; model opens with `recap_card` | One question; the `localchat.2` redo is offered |

Two things to notice. The check no longer needs the laptop off the internet, so the coach stays reachable throughout; the earlier wifi-off framing would have cut the coach off at the moment it was needed, and it also could not describe the ordinary case of a model on another machine the learner owns. Second, every turn above that changes anything shows a `ToolReasoning` or a card; nothing changes state without a visible trace.

## Running it

**Developer.** Node 22+ (for pnpm), pnpm 9, Python 3.12+, uv; Bun comes pinned with the dependencies. `make setup` writes `apps/agent/.env`; `make dev` builds the page, rebuilds it on change and serves it on 127.0.0.1:3000 with the agent on :8123 (reload to see a change); `make serve` builds once and serves, for testing. Our additions: `make check` runs `curriculum/validate.py`, `make coach-reset` deletes `~/.local-ai-coach/` for a clean first run.

**Tester.** Five people, two of them non-developers, so "clone and `make dev`" is not the setup. V1 ships a `tester.sh` that: checks for Node, pnpm, Python and uv and installs the missing ones through Homebrew or the distro package manager with a confirmation for each; clones the repo at a tagged release; runs `make setup` and `make dev`; opens the browser. It is one command pasted into a terminal, which for the two Sam-type testers is itself part of the study: a facilitator sits with them for that step and times it. No installer in V1; that is step 6 of the PoC plan and belongs to V2's single process. *As built:* `tester.sh` was replaced by `install.sh` and one release archive per kind of computer (stories 6, 31 and 32, `TESTERS.md`). Each archive holds the page's server as one Bun executable and the agent with its own Python (CPython 3.12.16, the locked packages installed and compiled for that computer), so installing downloads only the archive, checks it against its SHA-256, checks the bundled agent runs on this computer, and keeps any earlier install if it does not.

**Keys.** Each tester brings an OpenAI key and a TypeSafe key, or we hand them two keys we create for the study and revoke after. Keys live in the browser's memory for the session and are forwarded per request; the agent never stores them. The header dialog's live validation calls both providers, so a tester with no internet at setup cannot start, which is fine because V1 needs the internet anyway.

**Cost.** Unmeasured. Per user turn: one Jev call plus one `chat-latest` run whose input is the system prompt, the compressed map (about 4 KB), the current lesson and chapter (2 to 6 KB), the skills the model chooses to read, and the thread. A rough shape, not a figure: a one-hour session is perhaps 40 turns. Measure in the developer sessions before the Sam sessions and put the number here.

**Ports and binding.** Agent on `127.0.0.1:8123` (changed from `0.0.0.0`), app on `localhost:3000`. The learner's own model server is whatever the installer picks, usually :8080; the agent only probes it.

**Offline behaviour.** The coach needs the internet; the learner's model does not. The sandbox's improvised explainers need esm.sh. If the network drops mid-session the runtime surfaces the error and the Retry button re-runs the turn; progress is already on disk.

## Testing

**Automated, in CI** (upstream's lint, vitest and pytest jobs, kept):

- `curriculum/validate.py` as a pytest: graph acyclic, every reference resolves, every step term taught, every probe allowlisted, every `doIt` command single-line and clean.
- `probes.py` unit tests with recorded command output for macOS and Linux fixtures: each parser returns matched lines only, never raw output; a probe without consent returns `denied`.
- `progress.py`: transition table (every from/to pair), atomic write, review scheduling intervals, `red` cannot skip past a goal.
- `tools.py` with a fake model: `run_do_it` refuses without a prior `run_confirm` result in the thread; `set_progress` rejects downgrades; `run_check(kind=sim)` reads only `sandbox_event` results from the current step.
- Frontend: each hook registration renders with sample args and `respond` is called with the right JSON on each button (mirrors upstream's `use-generative-ui-examples.test.tsx`); the sandbox terminal's command table against a transcript of chapter 1's steps.
- Upstream contract tests stay green: `test_canonical_contract.py` and `test_skills_contract.py` pin the streaming contract text we keep in the prompt.

**Scripted agent run, before each tester session:** a pytest that drives the real graph with a stub `chat-latest` (upstream's `real_graph_filters_injected_frontend_tools_and_routes_once` shows how) through the 13-turn session flow and asserts the sequence of tool calls and the final `progress.json`. This is the test that catches a prompt edit breaking the flow.

**The study,** as in the PoC plan: five testers, one sitting each, own laptop, from `tester.sh` to a verified Wednesday check. Measures: time to each station; count of why/skip turns; checks failed and why; whether `Do it for me` was used and whether the next-day redo passed; the tester's one-sentence account of amber. Pass: four of five verified inside the hour, four of five explain amber in their own words, nobody surprised by "show me what you looked at". Add for V1 specifically: setup time with `tester.sh`, and the number of turns Jev routed to `open_generative_ui` and whether each was useful, since that decides whether V2 keeps a router at all.

## Risks and the V2 boundary

| Risk | Likelihood | What we do |
| --- | --- | --- |
| Prerelease CopilotKit (`1.55.2-next.1`) changes under us | High over months, low over the four weeks of V1 | Pin exactly; upgrade deliberately, never as a side effect |
| Jev routes a coaching turn to `open_generative_ui` and the model draws instead of running the step | Medium | `coach-playbook` says: during a step, text first, draw only if asked. Count occurrences in the study |
| `chat-latest` is a moving alias; behaviour shifts mid-study | Low over four weeks | Note the date in each session summary; if behaviour shifts, set `LLM_MODEL` to a pinned `gpt-*` via the server-key path for the remaining sessions |
| macOS history not flushed, so `history_has` misses | Certain | Already corroboration only |
| `nettop` or `lsof` unavailable or slow on a tester's machine | Medium | Each probe has a `fallback` (`netstat`), and a failed probe is reported, never guessed |
| `@copilotkit/license-verifier` does something at runtime we do not expect | Unknown | Read it before the first tester build |
| Tester cannot get through `tester.sh` | Medium for the non-developers | Facilitator present; that time is a study result, not a failure |
| A tester has one machine and no second node, so the tailnet case cannot be shown | Certain | The check also passes with the model on the laptop itself (loopback only); the second-node case is shown by the facilitator's machine joined to the tester's tailnet for the session |
| The sandbox terminal grows into a project of its own | Medium | Command table limited to what chapter 1's steps use; anything else answers "not in this practice shell" |

**V2 boundary.** The things V1 deliberately leaves on the far side, in the order they should move:

1. Brain to local: a TypeScript AG-UI agent over the brain contract (Claude Agent SDK first, local OpenAI-style loop second). The hooks, components, curriculum, progress file and probes carry over unchanged; the Python agent is retired.
2. Router: drop Jev, or replace it with Kev or SemIf locally if the study shows the improvised explainers were used and useful.
3. One process: runtime handler in Bun, frontend as a static Vite build, agent in the same process; `tester.sh` becomes an installer.
4. MCP Apps packaging of the components, so the coach can also run inside Claude Desktop or any host that supports Apps.

What must be true at the end of V1 for V2 to be worth doing: four of five testers reach the Wednesday check, and the session transcripts show the coach teaching from the contract rather than improvising past it.
