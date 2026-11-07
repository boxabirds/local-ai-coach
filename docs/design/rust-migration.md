# Moving the backend to Rust: what it would involve (2026-11-07)

Asked by Julian: "investigate what would be involved in migrating the backend to Rust". This is an investigation, not a plan of record. Nothing has changed. Every decision below is Julian's.

"Backend" here means the Python agent in `apps/agent` (port 8123). The Bun web server (`apps/app/server.ts`, 341 lines of route handlers in `src/api/`) is covered briefly at the end. Most of those handlers forward to the agent.

## What the backend is today

| Layer | Size | Who owns it |
|---|---|---|
| Our coach code: `src/coach/` (probes, progress, consent, keystore, ratings, turn log, restart, whole map, curriculum, stub, tools, middleware, server model) | ~3,100 lines | us |
| Upstream glue in `src/`: `model.py`, `credentials.py`, `visualization_router.py`, `prompt.py`, `skill_backend.py`, `bounded_memory_saver.py`, `anthropic_compat.py` | ~900 lines | upstream (three are on the do-not-touch list) |
| `main.py`: the agent, its middleware chain, the FastAPI app, two AG-UI endpoints (`/` and `/stub`) | 150 lines | mixed |
| Framework behaviour we rely on, installed: `copilotkit` 0.1.94 middleware (945 lines), `ag-ui-langgraph` 0.0.41 (~2,700 lines), `deepagents` 0.3.3 (~2,900 lines) | ~6,900 lines | upstream libraries |
| Underneath those: `langgraph` 1.0.7, `langchain` 1.2.0, `langchain-openai`, `langchain-anthropic`, `langchain-mcp-adapters`, FastAPI, uvicorn | large | upstream libraries |
| Tests: 37 pytest files, plus the dispatch evals in `apps/agent/evals` | ~6,300 lines | us |

The Python we wrote is the small part. Most of what the agent does comes from the frameworks, and a Rust version has to rebuild that behaviour, not translate it.

## What a Rust backend has to provide

### 1. The AG-UI endpoint the page talks to (hardest to get exactly right)

The page's CopilotKit runtime reaches the agent through `LangGraphHttpAgent` (`apps/app/src/lib/copilotkit-runtime-options.ts`, do-not-touch). It posts a run and reads back a stream of AG-UI events over SSE: run started and finished, text message start, content and end, tool call start, args and end, state snapshots and deltas, and message snapshots. `ag-ui-langgraph`'s `agent.py` (1,745 lines) turns LangGraph's internal events into that stream and handles thread state, regenerating a turn, and the LangGraph-specific details the client expects.

In Rust: the official AG-UI Rust SDK has two crates, `ag-ui-core` (types and events) and `ag-ui-client` (an `HttpAgent` client). Its docs say nothing about a server. Third-party crates exist (`syncable-ag-ui-server`, `agui-rs-core`); I haven't checked how mature they are. So the event types can probably be reused. Producing a stream that matches what `ag-ui-langgraph` sends, field for field, is our work. The test is a recorded stream from the Python agent replayed against the Rust one.

Not checked yet: does `LangGraphHttpAgent` need anything LangGraph-only that plain AG-UI doesn't define? If it does, the page side changes too, from `LangGraphHttpAgent` to plain `HttpAgent`, in a do-not-touch file.

### 2. The agent loop and the middleware chain

`create_deep_agent` builds a LangGraph graph: call the model, run the tools it asks for, loop. Seven middleware wrap that loop, through four hooks (`before_agent`, `wrap_model_call`, `after_model`, `wrap_tool_call`):

- `RequestModelMiddleware`: chooses the model per request.
- `ServerModel`: the learner's OpenAI-compatible server (story 21).
- `CopilotKitMiddleware`: frontend tools (the coach's cards are frontend tools), shared state notes, A2UI tool injection, forwarded headers.
- `CoachStateMiddleware`: curriculum and progress context, consent capture, `step_shown` records.
- `JevVisualizationMiddleware`: a second model call to Jev via TypeSafe to route visualisations.
- `ConsecutiveSystemMessagesMiddleware`: repairs messages for Anthropic.
- `TurnLog`: logs exactly what the model is sent, with secrets redacted.

In Rust: write the loop and a middleware trait with the same four hooks. Libraries such as `rig-core` give you an agent, providers and tools. They don't give you this hook model, CopilotKit's frontend-tool and state conventions, or LangGraph's state-update semantics (`Command(update=...)` from `set_progress` and `chapter_ended`). The loop itself is small. Matching the behaviour of the four upstream middleware is most of the work, and they keep changing upstream.

### 3. Deep Agents features

From `deepagents` the coach uses its skills (`/skills/` read through a read-only backend: `skill_backend.py`), the in-state scratch filesystem (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`), and possibly todos and subagents through upstream's prompt. Before porting, check which of these the coach's turns actually call, from the turn logs. Whatever is used has to be rebuilt; whatever isn't can be dropped.

### 4. Thread memory

`BoundedMemorySaver` (200 threads in memory) relies on an internal of LangGraph's `MemorySaver`, which is why `langgraph` is pinned. In Rust this is a plain map keyed by thread id, with the same eviction. Simpler than today.

### 5. Model providers

OpenAI `chat-latest` (the default), Anthropic for `claude-*`, the learner's OpenAI-compatible server, and Jev via TypeSafe. All need streaming with tool calls. Rust crates cover OpenAI and Anthropic (for example `async-openai`, `rig-core`'s providers). Jev via TypeSafe is a provider-specific request (`visualization_router.py`) that we'd write by hand. `validate_credentials` checks keys against each provider.

### 6. The stub coach

`stub.py` (417 lines) is a one-node LangGraph graph that walks chapters 0 and 1 with fixed wording. It's behind `/stub`, which the browser suite and the tester release use. Port it with the AG-UI endpoint. It's the cheapest way to prove the endpoint works without a model.

### 7. Our coach code (the easy part)

These map well onto Rust, and some get stricter:

- Probes: `std::process::Command` takes an argv and has no shell, which fits the hard rule. The 5 s timeout needs `wait-timeout` or `tokio::process` with a timeout.
- `progress.json` by atomic rename, consent, Restart coach moving files into `old/<stamp>/`, ratings (one file each, never edited), turn log pruning: all file work, done with `std::fs` and `serde_json`.
- Keystore: `/usr/bin/security -i` with the key on stdin. Same approach in Rust.
- Curriculum reading, the whole map, and the figure, story and step routes: `serde` over the same JSON and Markdown.
- The FastAPI routers and the ASGI `CredentialsMiddleware` and `StoredKeys`: `axum` routes and `tower` layers, bound to `127.0.0.1`.

### 8. MCP (optional)

`langchain-mcp-adapters` is used only when `MCP_SERVER_URL` is set. There is a Rust MCP SDK (`rmcp`); I haven't checked it against our use.

### 9. Tests

The 6,300 lines of pytest call Python functions directly, so most of them would be rewritten in Rust. The ones that go through HTTP (`test_release.py`, the browser suite, `bun-tests/server.test.ts`) carry over unchanged and are the real proof the port is right. `test_canonical_contract.py` and `test_skills_contract.py` check upstream's prompt text stays verbatim. The text moves into a file both versions read, and the check moves to Rust. The dispatch evals (`make evals`) drive the real model through the agent and need porting to keep regression coverage of the coach's behaviour.

## What it would gain

- **One executable per platform for the whole coach.** Today `install.sh` downloads uv, uv downloads Python, and `uv sync` fetches the agent's packages from PyPI on the learner's machine during install ("the first time takes a minute"). That's the release's biggest moving part and its only install-time network dependency apart from the archive itself. With Rust, the release would be the Bun page server plus one agent binary, which also simplifies the planned `.dmg` and signing.
- Lower memory and faster start for the agent. Not measured. Python with LangChain loaded is heavy on a 16 GB Mac that also runs a local model.
- A smaller dependency surface to pin and audit.

## What it would cost

- **The V1 rule "the upstream stack runs unchanged".** CLAUDE.md names the Python LangGraph agent. This retires it, as story 31 did for the web side.
- **The do-not-touch list.** `credentials.py`, `model.py` and `visualization_router.py` get rewritten. "Upstream fixes merge into these" stops: we'd follow CopilotKit, AG-UI, LangGraph and Deep Agents changes by reading them and porting them by hand, for good.
- **The frameworks' behaviour.** Everything in sections 1 to 3 is behaviour we get for free today and would own afterwards: streaming edge cases, regenerate, state deltas, A2UI injection, provider message repairs.
- **The test suite.** Most pytest files are rewritten rather than reused.

## A cheaper option for the same main gain

The gain that matters for testers is "no Python install step". Two other ways to get it, neither checked yet:

1. **Ship Python inside the release.** Bundle the agent's packages and a standalone Python built at release time (for example python-build-standalone with a prebuilt virtualenv, or a frozen executable). The code doesn't change and upstream merges keep working. The archive gets bigger.
2. **Move the agent to TypeScript on Bun.** The page's CopilotKit runtime is already TypeScript, and LangGraph, Deep Agents and AG-UI publish JavaScript versions. `bun build --compile` would then make one executable for the whole coach, the same way story 31 does for the page. I haven't checked whether the JS versions match the Python features we use (the middleware hooks, Deep Agents skills, `ag-ui-langgraph`'s event mapping).

Rust only beats both if its own gains (memory, start-up, owning every line) are worth giving up upstream for. Today that's an assumption, not a measurement.

## Order of work, if it goes ahead

Each step ends with the existing HTTP-level tests passing against the Rust agent.

1. Measure first: the Python agent's memory and start-up on the 16 GB Mac, and which Deep Agents tools the coach's turns actually call (from the turn logs). This decides whether there is a case at all.
2. Record AG-UI streams from the Python agent (stub and real) as fixtures.
3. Rust `axum` server on 127.0.0.1 with the plain routes: health, curriculum, whole map, ratings, restart, keys. Point the Bun server at it for those routes and run the browser suite.
4. The AG-UI endpoint and the stub coach, checked against the recorded stub streams. The browser suite runs on `/stub`.
5. Probes, progress and consent, with the probe allowlist and the argv-only rule as tests.
6. The agent loop, the providers, and the middleware chain in hook order, with the turn log first so every model request can be compared with the Python agent's.
7. Skills and whatever Deep Agents tools step 1 found in use. Then the dispatch evals against the real model.
8. Release: a Rust agent binary per platform in `build-release.sh`. `install.sh` drops uv and Python. `test_release.py` passes, including the real install.
9. Remove Python. Then CLAUDE.md, `docs/design.md`, `docs/architecture.md`, the guides, and a guard test like `no-next.test.ts`.

## The Bun web server

Its handlers are thin: they check the request's origin, forward to the agent, and host the CopilotKit runtime. The runtime is TypeScript and has no Rust version, so the web server stays on Bun whatever the agent is written in. With a Rust agent, the coach would ship two executables, which is fine.

## Decisions that are Julian's

1. Is the goal "no Python on the tester's machine", or Rust itself? If it's the first, option 1 or 2 above gets there without leaving upstream.
2. Retire "the upstream stack runs unchanged" for the agent, and with it the three do-not-touch agent files?
3. Run step 1 (the measurements) before deciding?

## Sources

- AG-UI Rust SDK overview: https://docs.ag-ui.com/sdk/rust/overview
- `rig-core`: https://docs.rs/crate/rig-core/latest
- `syncable-ag-ui-server`: https://docs.rs/syncable-ag-ui-server/0.2.0/syncable_ag_ui_server/
- `agui-rs-core`: https://docs.rs/crate/agui-rs-core/latest/source/README.md
