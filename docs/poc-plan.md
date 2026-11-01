# PoC: chapters 0 and 1

Nov 1, 2026 · @Julian Harris

## What the PoC proves

One downloadable app teaches chapters 0 and 1 to five real people, with the coach doing the teaching from curriculum data, and progress recorded from evidence rather than from a tick. If that works for the first three stations, the rest of the map is content, not engineering.

Scope is the three stations chapter 1 touches plus the chapter 0 story:

| Station | Colour | Simulation | Real-machine evidence |
| --- | --- | --- | --- |
| Priya's story (legal-letter destination, chapter 0) | none | none; it is read | none; the app records that it was read and asks one question about it |
| Know your machine (Find your number) | amber | a fake Settings or `free` screen to practise reading | `sysctl hw.memsize` / `/proc/meminfo` read by the app and compared with the number the learner typed |
| Local chat | grey | a fake terminal where the model download and first prompt are played through | a model file on disk, a server process listening, one completed chat turn in the server log |
| Prove it stays local (the Wednesday check) | red | a rehearsal: read a fake connections list and pick which lines are your own machines | while a chat turn completes, the chat app's outbound connections go only to private or tailnet addresses of machines the learner owns |

What the PoC does not include: zone 2 and 3 hardware, any station outside these four, a Windows build (macOS and Linux first), syncing progress between machines, and any model smaller than the one the awesome-local-ai installer picks for zone 1.

## The hybrid

Unix Jelly and Software Pilots each got half of it right. Jelly is meticulous: every lesson declares what it `teaches`, every step has a checker, a hint and a do-it-for-me, nothing appears before it is taught, and a test suite plays every mission cold. But it has no conversation; a learner who wants to ask why, skip ahead or go back has only the menu. Software Pilots has the conversation, the recaps that fall out of session summaries, and a coach that adapts, but its lessons are prose with no checkable steps, so progress was a claim.

The hybrid keeps Jelly's unit of teaching (the step, with its checker) and hands the sequencing, the explanation and the sidebars to the coach:

- The curriculum carries steps in Jelly's form, written or generated ahead of time and validated, not improvised mid-chat.
- The coach presents one step at a time as a card in the chat, exactly as Jelly does, and the card's checker fires on the learner's action in the sandbox or on evidence from the real machine.
- Between steps the learner can type anything: a question, "skip this", "why does that matter", "show me again". The coach answers in the voice guide, then returns to the step or moves on, and records what was skipped.
- Jelly's prerequisite rule becomes a coach rule: the coach is given the `teaches` list of every station the learner has passed and the term register, and is told to define anything not yet taught before using it. The validator still enforces it on the written steps; the coach enforces it on its own prose.
- Jelly's "Do it for me" costs jelly points. Here it costs nothing, because the learner is an adult with a real machine, and the app records that the step was done for them so the recap can revisit it.

Nothing from Jelly is reused. It is the yardstick: one command per step, the exact place to type it, a checker that reads the learner's action, a hint and a do-it button on every step, and nothing on screen before it is taught. That is the granularity the coach must offer, written fresh for this curriculum.

## The lesson contract

This is the dynamic building block. Its shape follows a Unix Jelly lesson (`src/guides/*/lessons.js`), written as JSON for this app, with two additions: a `check` that can look at the real machine, and a `where` that can be the real terminal rather than the sandbox. Everything the chat renders, the coach sequences and the checker verifies is one of these.

```json
{
  "station": "run",
  "teaches": ["model-file", "server-process", "first-prompt"],
  "previews": ["context-window"],
  "stands": "llama.cpp: a C++ program that runs llama-family models",
  "why": "...two or three sentences in the voice guide...",
  "mnem": "Download once. Serve forever.",
  "steps": [
    {
      "id": "run.1",
      "text": "In the terminal, start the server: `llama-server -m ~/models/qwen3-4b.gguf`",
      "where": "real-terminal",
      "hint": "The -m is the model file. Tab completes the path.",
      "doIt": { "kind": "shell", "cmd": "llama-server -m ~/models/qwen3-4b.gguf", "explain": "Starts the server on port 8080" },
      "check": { "kind": "real", "probe": "listening", "port": 8080, "within": "60s" },
      "onFail": { "pattern": "No such file", "say": "The path to the model file is wrong. Try ls ~/models." }
    }
  ],
  "recap": ["A model is a file.", "A server is a process that holds it in memory.", "Your chat app talks to the server, not the file."]
}
```

The fields and where they came from:

| Field | From | Note |
| --- | --- | --- |
| `teaches`, `previews` | Jelly | Drive the prerequisite rule; the validator and the coach both read them |
| `stands`, `why`, `mnem`, `recap` | Jelly | The explain-the-name, the story, the one-liner and the "what I've learnt" words |
| `steps[].text`, `hint`, `doIt` | Jelly | Same three affordances per step: instruction, the "?", the do-it button |
| `steps[].where` | new | `sandbox`, `real-terminal`, `settings`, `chat-app`, `read`. Jelly's rule 4 (say exactly where) becomes a field the renderer uses to show the right panel |
| `steps[].check` | Jelly's `ok` predicate, generalised | `sim` (an event in the sandbox), `real` (a probe on the machine), `ask` (a rubric the coach judges), `read` (the learner reached the end) |
| `steps[].onFail` | new | Jelly does this in code per sandbox; here it is data so the coach can say it |

Who writes them: the author, for the PoC. The coach can draft new ones ("give me a step that checks disk space") but a drafted step is marked unvalidated and shown with a different border until the validator has run it. That keeps Jelly's discipline: nothing the learner follows was improvised in the moment.

The sandbox for `where: sandbox` is a small fake shell written for this app: an in-memory file tree, a handful of real commands (`ls`, `cd`, `cat`, `mkdir`, `curl`), and a local-AI set (`llama-server`, `ls ~/models`, a fake `nvidia-smi` and `system_profiler`) whose output is copied from real runs of the versions the installer ships. Jelly shows the standard it has to meet: a wrong path gets the path walked back step by step and a corrected command to click, not "No such file".

## Inline components

The chat needs to render more than text. For the PoC, eight components cover everything chapters 0 and 1 do:

| Component | Appears when | Learner can |
| --- | --- | --- |
| Story | chapter 0 | read, scroll, answer the one question at the end |
| Step card | each step | read the instruction, press "?", press "Do it for me", see the check go green |
| Sandbox terminal | `where: sandbox` | type; the sandbox fires events the checker reads |
| Real terminal transcript | `where: real-terminal` | see what the app ran or what the learner pasted, with the evidence it found |
| Number card | Find your number | type the memory figure; the app shows what it measured beside it |
| Map | on request, and at station changes | see the tube map with their state; click a station to ask about it |
| Check result | after any `check` | see what passed, what evidence was used, press "show me what you looked at" |
| Recap card | spaced repetition | answer one question from an earlier station |

Three ways to build them, and the trade:

| Route | How it works | For the PoC |
| --- | --- | --- |
| Home-grown tool-to-component map | The coach calls a tool (`show_step`, `show_check`); the app's React side maps tool name to component and renders it; component events come back as tool results | Fastest. Eight components, one switch statement. No framework between us and the model. Recommended for the PoC |
| CopilotKit generative UI | Agent runs behind the AG-UI adapter (`@ag-ui/claude-agent-sdk`), `@copilotkit/runtime` in front, React components render tool calls; human-in-the-loop and two-way state sync built in ([docs](https://docs.copilotkit.ai/claude-sdk-typescript)) | Good fit if we commit to React and the Claude Agent SDK. Adds a runtime process and a protocol layer; the state sync is the part worth having later for progress and recap state. Its local-model story is unclear from the docs |
| MCP Apps | Tools declare a `ui://` resource; the host renders it in a sandboxed iframe with a postMessage JSON-RPC bridge; the `@modelcontextprotocol/ext-apps` App Bridge module does the host side ([overview](https://modelcontextprotocol.io/extensions/apps/overview.md), spec dated 2026-01-26) | The right long-term shape, because the same components would then also render inside Claude Desktop or any MCP host that supports Apps. More machinery than the PoC needs. Build the home-grown components so each is a self-contained HTML page and the move to `ui://` resources later is packaging, not a rewrite |

Revised after looking at Open Intelligent UI (next section): take CopilotKit's generative UI rail as the frontend, write the eight components as `useComponent` and `useHumanInTheLoop` registrations, and keep the sandboxed-iframe renderer for anything the coach improvises. Home-grown stays as the fallback if the prerelease packages churn under us; MCP Apps stays the later packaging for running inside other hosts.

## Open Intelligent UI, assessed

[Open Intelligent UI](https://github.com/CopilotKit/OpenIntelligentUI) (the site calls it Open Generative UI) is a whole stack, not a component library: a Python agent, a CopilotKit runtime, a Next.js chat frontend, and a renderer that streams model-written HTML, CSS and JavaScript into a sandboxed iframe. MIT licence. About 7,500 lines of frontend TypeScript, of which the part we want is under 1,000. I cloned it and read the code and docs; I have not run it.

Layer by layer:

| Layer | What it is | For the PoC |
| --- | --- | --- |
| Agent (`apps/agent`) | Python FastAPI, LangGraph Deep Agent, OpenAI `chat-latest` for answers, Jev (TypeSafe's System One API) choosing the visualisation type per turn, three prompt "skills" | Replace. Our agent is TypeScript over the brain contract. Keep the idea of a typed presentation decision; for the PoC the step contract already makes it (`where` says which component) |
| Runtime (`/api/copilotkit` route, `copilotkit-runtime-options.ts`) | `CopilotRuntime` with `openGenerativeUI` on, which injects the `generateSandboxedUi` tool and the middleware that turns its streamed call into render events | Keep the pattern. The v2 handler is framework-agnostic, so it can sit in the Bun process rather than Next.js |
| Chat frontend (`@copilotkit/react-core/v2`, `react-ui`) | The chat, plus hooks: `useComponent` (agent renders a named React component with typed props), `useHumanInTheLoop` (component waits, then `respond()` resumes the agent), `useFrontendTool` (agent calls a browser-side function), `useAgent` (two-way state sync) | The main win. Step card = `useHumanInTheLoop` (renders, waits for the check, responds with the evidence). Number card, Recap card, Run/Cancel = the same hook. Map, Story, Check result = `useComponent`. Sandbox terminal = `useComponent` plus `useFrontendTool` for its events. Progress and review queue = `useAgent` state |
| Open Generative UI renderer (`renderer.tsx`, 467 lines; `sandbox-functions.ts`; websandbox loader) | Streams CSS first, morphs partial HTML into a preview, then boots a `@jetbrains/websandbox` iframe with a theme and importmap (three, d3, gsap, chart.js); host exposes Zod-validated `sendPrompt` and `openLink` | Keep as-is for the coach's improvised explainers ("show me memory against disk as a picture"). Never for steps: steps come from the contract. Add two sandbox functions, `reportEvent` and `claimStep`, so an improvised widget can feed the checker |
| A2UI table catalogue (`@copilotkit/a2ui-renderer`) | Semantic HTML tables from a declarative spec, capped at 12 columns and 200 rows | Optional. The model table in chapter 1 is a candidate |
| `packages/design-system` | Theme CSS variables, SVG colour classes, form styles | Keep; it is what the sandbox injects, so improvised widgets match the app |
| `apps/mcp` | Assembles the same HTML documents for other MCP hosts, with a legacy postMessage bridge | Not for the PoC. It is the bridge to the MCP Apps route later |
| Demo scenes, template library, QR export, launch telemetry | Marketing and demo | Drop. Telemetry off with `DO_NOT_TRACK=1`; our brain contract says `telemetry: none` |

What this changes in the plan:

- The eight components become hook registrations, not a hand-rolled tool-to-component switch. The waiting behaviour we need (a step card that holds the agent until the check passes) is exactly `useHumanInTheLoop`.
- The coach gains a ninth kind of output for free: an improvised, sandboxed interactive explainer when a learner asks a "why" that a picture answers better than prose. The contract rule still holds: improvised output never counts as a step or as evidence.
- The brain has to speak AG-UI. For the Claude path `@ag-ui/claude-agent-sdk` exists. For the local path we write a small AG-UI agent in TypeScript around the OpenAI-style loop; the AG-UI event set is modest (run started, text delta, tool call start/args/end, state snapshot, run finished). CopilotKit also has an `OpenAIAdapter` that takes a client object, so a local `baseURL` is possible in principle; whether the Open Generative UI rail works through that adapter rather than an AG-UI agent is not stated in the docs, so treat it as untested.
- Next.js is more than a downloadable app wants. For the first tester sessions (the two developers) run the forked app from a checkout; before the Sam sessions, move the runtime handler into the Bun process and the frontend to a static Vite build it serves. That is step 6 of the build plan, and it is where the installer appears.

Risks: the packages are prereleases (`1.55.2-next.1`) and the v2 hook API is recent, so breakage between versions is likely during the PoC; pin everything. The runtime adds a process boundary and a protocol between the model and the UI, which is more to debug when a card does not render. If that cost shows up early, the home-grown switch statement is a two-day fallback because the components themselves are plain React either way.

One footnote for later. Jev routing in this stack is a system one model doing a job a language model would do badly: choosing a presentation type in one typed call. That is the same shape as the evidence classifier in the two-loops section, and a concrete example for the System one models station.

## Local versions of every layer

Open Intelligent UI as shipped phones two hosted providers on every turn (OpenAI for the answer, TypeSafe's Jev for the presentation decision). For a coach whose whole lesson is "it runs on your laptop", each layer needs a local counterpart, and each has one now.

| Layer in the stack | Hosted as shipped | Local counterpart | Zone 1 (16 GB, no GPU) |
| --- | --- | --- | --- |
| Answer and coaching model | OpenAI `chat-latest` | The awesome-local-ai zone model through llama.cpp or MLX, via the brain contract | Yes, with the step contract carrying the content |
| Presentation decision (which component) | Jev, `/v1/systemone` | Not needed for steps: `where` in the contract decides. For free conversation, a decision model: Kev-0.8B (Qwen3.5 base, LoRA plus pointer head, Apache-2.0, serves Jev's API so the TypeSafe SDK points at localhost; runs on any Apple Silicon Mac or a 4 GB GPU), or Von / Laya (about 400M encoder models, CPU, under 15 ms), or SemIf (reads option probabilities from the logits of the model already running, so no second model) | Yes: Von or Laya on CPU, or SemIf against the answer model |
| Evidence classification ("is this history line the command we asked for") | none in the stack | Same decision models. A `choice` question over the candidate lines, with calibrated probabilities, so the app can set a confidence threshold and fall back to asking the learner | Yes |
| Improvised interactive explainers (`generateSandboxedUi`) | the answer model writes HTML/CSS/JS | The same local model. Small models write worse widgets; the design skill and the importmap help, and the fallback is the pre-built components | Partial: expect simple widgets only; test with the zone 1 model before promising it |
| Conversation state | in-process LangGraph checkpointer | `progress.json` and session summaries, as the spec says | Yes |
| Telemetry | CopilotKit ingest, opt-out | `telemetry: none`; `DO_NOT_TRACK=1` in the fork | Yes |

Three notes from the reading, unverified by me on hardware:

- Kev's own numbers: Kev-9B scores 0.59 on MMLU-Pro against Jev's 0.84, and on a Mac an answer takes hundreds of milliseconds rather than tens. For routing and evidence checks that is fine; for anything knowledge-heavy use the answer model.
- Calibration does not transfer. Quantisation and backend change the probabilities, so a confidence threshold fitted on one setup holds only for that setup. The evidence classifier needs a small labelled set from real tester sessions before its threshold means anything.
- These local servers are open by default. Bind to loopback and set the key, the same rule the brain contract already applies to the inference server.

The landscape moved fast: an [awesome-system-one list](https://github.com/andyrewlee/awesome-system-one) tracks a dozen or more open alternatives, and the [Kev repo](https://github.com/jaredpalmer/kev) is the one whose API matches Jev's. For the PoC the decision models are optional; the first use is the evidence classifier in step 3, and only if string matching on the history line proves too brittle.

The System one models station in stations.json now names Jev, Kev, Von, Laya and SemIf in its head note.

## Two loops of evidence

Every concept gets two passes: first in the simulation, where mistakes are free and the checker sees every keystroke, then on the real machine, where the app looks for the change the step should have made. Progress is the pair. A station is `verified` only when the real-machine check has passed; the simulation pass is recorded as `rehearsed`.

What the app can read on the learner's machine, with their consent given once at install and shown each time it is used:

| Source | How | Used for |
| --- | --- | --- |
| Shell history | `~/.zsh_history`, `~/.bash_history` (read-only, tail) | did the learner type the command themselves, or paste it, or press Do it for me |
| Processes | `ps` / `pgrep` for `llama-server`, `ollama`, `lmstudio`, `vllm` | is a server running; which one; since when |
| Listening ports | `lsof -iTCP -sTCP:LISTEN` or `ss -ltn` | is something answering on 8080, 11434, 1234 |
| Files | `stat` and `du` on `~/models`, `~/.ollama`, `~/.cache/lm-studio` | a model file exists; its size matches the number the learner chose |
| Memory | `sysctl hw.memsize` (macOS), `/proc/meminfo` (Linux) | the Find your number check: does the typed number match the machine |
| Network state | `ifconfig` / `ip link`, plus `nettop` or `/proc/net/dev` byte counters during a chat turn | the Wednesday check: interface down, or zero bytes out on the server's process, while a chat turn completed |
| Server log | the server's own stdout, when the app launched it | a completed chat turn, with timestamp, to line up with the network sample |

Rules:

- Read-only, always. The evidence collector never writes outside the app's own folder.
- Every piece of evidence is shown to the learner in the Check result card as the exact command run and the lines it matched. "Show me what you looked at" is one click. Nothing is sampled silently.
- Evidence is stored in `progress.json` under the station as `evidence[]` with a timestamp and the probe id, not as raw dumps. The history file is never copied; only the matching line is kept.
- A probe that needs a privilege the app does not have asks, explains, and offers the paste-it-yourself path instead.
- Nothing leaves the machine. With a remote brain, the coach is told the check's verdict and the matched line, not the full probe output, and the learner can see what was sent.

This is also where "system one models" earn a place later: a tiny local classifier that decides "is this history line the command we asked for" is a better fit than sending shell history to any language model, local or not.

## Do it for me

Jelly hides this behind `?allowcheats=1` and docks points. Here it is a first-class button on every step, because the app has local privileges and the learner is an adult who may want to see it done once before doing it themselves.

How it runs:

1. The step's `doIt` names the command and a one-line `explain`. The card shows both before anything runs, with Run and Cancel. No command runs that the learner has not seen.
2. On Run, the app executes it in its own shell session (a PTY it owns, so the output streams into the Real terminal transcript card) and the step's `check` runs as usual.
3. The step is recorded with provenance `assisted`, not `verified`. The map shows it as a half-filled ring. The recap queue schedules a "now you" repeat of that step for the next session, and when the learner does it unassisted the ring fills.
4. For steps with no single command (choosing a chat app, finding a setting), `doIt` is `{"kind":"instructions"}` and the coach produces the exact clicks for this OS, from the step's data, not from memory.

Where the harness comes in: when a `doIt` is more than one command, or depends on the machine (which GPU, which package manager), the app does not script it. It hands the step to the brain running as an agent with shell access, with the instruction to achieve the step's `check` and report what it ran. That is the `claude -p` path in the next section. The transcript card shows every command the agent ran, and each one is recorded as `assisted` evidence.

The principle stays Jelly's: the learner always sees the real command and the real output. The app does the typing, never the hiding.

## The brain

Three ways to drive the coach, in the order the PoC should try them.

**1. `claude -p` as a child process.** The app spawns `claude --bare -p --output-format stream-json --input-format stream-json --verbose --include-partial-messages`, keeps stdin open, and talks to it over newline-delimited JSON for the whole session. From the [headless docs](https://code.claude.com/docs/en/headless): `--bare` skips the user's own hooks, skills and CLAUDE.md so the coach behaves the same on every machine; `--append-system-prompt-file` carries the persona, voice guide and the compressed map; `--mcp-config` registers our tools (`show_step`, `set_progress`, `run_check`, `show_map`, `show_recap`) as a small MCP server the app itself runs; `--allowedTools` scopes shell access to the probes and to `doIt` commands; `--resume <session_id>` continues across app restarts. Permission prompts arrive as events, so the Run/Cancel card is the `canUseTool` answer. Cost: this needs Claude Code installed and an API key or subscription login, which is a fine first brain for a PoC with five testers, and a poor final answer for a book about local AI.

**2. The Claude Agent SDK in-process.** The TypeScript SDK gives the same loop with message objects, a `canUseTool` callback and structured output, without parsing a stream. If the app is a Bun or Node process anyway, this is cleaner than option 1 and is what CopilotKit's adapter wraps. Same dependency on Anthropic's API.

**3. A local model through an OpenAI-compatible endpoint.** Our own loop: system prompt assembled as the spec describes, tools declared in the OpenAI function-calling shape, the same five tools, the app executing tool calls and feeding results back. Works against llama.cpp, Ollama, LM Studio, vLLM and MLX servers. Zone 1 reality check: the models that run in 16 GB with no GPU are weak at multi-step tool use, so for the PoC the local brain is tested with a 4B to 8B model on "follow the step, judge the answer, say the recap" and is allowed to fall back to the step card's own text when it stumbles. The step contract is what makes a weak brain workable: the content is already written and checked; the model only has to present and converse.

The PoC ships 1 and 3, with 3 behind a "use my local server" switch, so the Wednesday check can be passed with the coach itself running locally. That is the demonstration that matters for this book: the teacher is on the laptop too.

Whichever brain is in use, the tools, the step contract and the progress file are identical, so switching brains mid-course loses nothing but the session summaries' voice.

## Spaced repetition

Jelly recaps by hand: a lesson's `setup` quietly recreates files from earlier lessons, and "What I've learnt" words are a fixed list per course. Software Pilots recaps by data: a review queue the coach draws from at the start of a session. The PoC takes the second, with Jelly's precision about what is being recapped.

- Each station's `recap[]` lines and each step with `check` are review items. When a station is passed, its items enter `progress.json` under `review[]` with a due date (1 day, then 3, then 7, then 21, the usual expanding schedule) and a strength counter.
- At the start of a session the coach is handed the due items, at most three, and asked to open with one of them as a Recap card: a one-line question for a `recap` item, or a "now you" re-run for an `assisted` step. A right answer pushes the due date out; a wrong one pulls it in and the coach re-teaches in two sentences, not a full lesson.
- The learner can say "skip the recap" and it is deferred, not deleted.
- Nothing here needs the brain to remember anything. The queue is in the file; the coach is told what is due. That is why it works with a small local model and across brain switches.

For chapters 0 and 1 the queue holds about a dozen items. The one that matters most is the Wednesday check itself, which comes back as "do it again, unprompted" a week later. If the learner passes that cold, chapter 1 has done its job.

## Architecture

&#91;embedded content: architecture · 4 parts, 3 links\]

One process owns everything that persists. The browser is a view; the brain is replaceable; the machine is read, not written, except when the learner presses Run. The five tools are the only way the brain reaches the UI or the file, so a different brain, or a stub brain for testing the UI, plugs in without touching anything else.

## Build plan and the user test

Six steps, each leaving something a tester could touch. Order matters: the step contract and the stub brain come before any model is wired, so the UI and the checks are tested without spending a token.

| Step | Builds | Done when |
| --- | --- | --- |
| 1. Contract and content | `curriculum/` with stations.json, the four stations' lesson JSON, Priya's story, map.json; the validator | validator passes; every step has text, where, check; every term in a step is in `teaches` of this or an earlier station |
| 2. Shell and cards | forked Open Intelligent UI frontend with its demo stripped; the eight components as CopilotKit hook registrations; a stub AG-UI agent that walks the steps in order with canned prose | a person can do chapter 1 end to end in the sandbox with no model connected |
| 3. Evidence collector | the seven probes, consent screen, Check result card with "show me what you looked at" | Find your number and Local chat verify on a real Mac and a real Linux laptop; the local check verifies with the model on a second machine over Tailscale |
| 4. Brain, remote | `claude -p` child process, five tools over `--mcp-config`, Run/Cancel as the permission answer, session resume | the coach teaches chapter 1 unscripted from the contract; a tester's "why" and "skip" are handled and recorded |
| 5. Brain, local | OpenAI-style loop against the awesome-local-ai installer's zone 1 model; fall back to card text when the model stalls | chapter 1 completes with the brain itself offline, so the app passes its own Wednesday check |
| 6. Recap and polish | review queue, Recap card, `assisted` re-runs, installer (.dmg and .AppImage) | a second session a day later opens with a recap and the learner's state intact |

The user test, five people, each in one sitting of about an hour, on their own laptop:

- Who: two who match Sam (curious, no terminal), two developers who have never run a local model, one who has. None has read the chapters.
- Task: install from the download, read the story, get to a verified Wednesday check. No help from the facilitator except "ask the coach".
- Measure: time to each station; count of "why" and "skip" turns; which checks failed and why; whether Do it for me was used and whether the "now you" re-run passed next day; the tester's one-sentence account of what amber means, unprompted, at the end.
- Pass: four of five reach a verified Wednesday check inside the hour; four of five can say what the amber colour means in their own words; no tester is surprised by anything in "show me what you looked at".

If the pass rate is lower, the first suspects are, in order: the story did not land what a station is; the number card confused memory and disk; the probe asked for a privilege; the coach talked past the step.

## Open questions

- [ ] Which first: `claude -p` child process or the Agent SDK in-process? Same capability; the SDK is tidier, the CLI is already on many testers' machines. My lean: SDK, because the app is a Bun process either way.
- [ ] Shell history on macOS is written on shell exit by default, so a probe during the session may not see the command yet. Options: read the PTY the app owns instead, or ask the learner to run `fc -W` / `history -a`, or treat history as corroboration only. Needs a decision before step 3.
- [ ] Does the app launch the inference server itself (so it owns the log and the port) or only detect one? Owning it makes the Wednesday check clean; detecting respects a learner who already has Ollama. Probably both, with ownership preferred.
- [ ] Who records the real `llama-server`, `nvidia-smi` and `system_profiler` output for the sandbox, from which versions, so the fake matches what the learner then sees for real?
- [ ] Where does the lesson JSON live long-term: in this app's repo, in awesome-local-ai next to the installers it references, or in a third `local-ai-curriculum` repo the book build also reads? The spec's curriculum contract assumes one folder; the question is which repo owns it.
- [ ] Name. "Local AI Tutor" is a placeholder; the book is "Mastering Local AI".
