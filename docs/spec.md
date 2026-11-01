# Local AI Tutor: spec

Nov 1, 2026 · @Julian Harris

## What it is

A downloadable tutor for Mastering Local AI: one local process, one data folder, a chat window in the browser. The learner installs it, picks a brain (an API key or a local inference server), and the tutor teaches the curriculum from stations.json, tracking progress per station. Chapter 0 (Priya's story) ships as text and reads before any model is connected, so the first thing the learner sees works on a fresh machine.

The design rule, after Karpathy: the curriculum is data and the agent decides how to teach it. We never hard-code lesson order into the app. The tube map gives signposts (stations), destinations give trails (projects), and the learner can go anywhere whose prerequisites are met, or ask for anything and have the tutor note what was skipped.

Success looks like Sam, a year from now, having gone from "what does local AI even mean" to a working private pipeline, with the app able to say which stations she has proven and which she has only read about.

## The three contracts

Everything hangs off three files the app reads and writes. Each is plain JSON a person can open, edit and version. Nothing lives only in a database.

| Contract | File | Who writes it | Who reads it |
| --- | --- | --- | --- |
| Curriculum | `curriculum/` folder (stations.json, map.json, chapters, stories) | The author, by hand or build script | The app (graph, UI) and the tutor (every turn) |
| Progress | `progress.json` in the learner's data folder | The app, on the learner's claim or the tutor's verification | The app (map state) and the tutor (what to teach next) |
| Brain | `brain.json` in the learner's data folder | First-run flow, or the learner later | The app, to make model calls |

The curriculum is read-only to the app and shipped with each release. Progress and brain belong to the learner and survive upgrades.

## Curriculum contract

The curriculum is the existing stations.json plus the writing that hangs off it. The graph is the source of truth; prose is attached to station ids, never the other way round.

```
curriculum/
  stations.json        graph: areas, stations, needs, betterWith, zone, criticality, proof
  map.json             pedagogical map: term register (definedIn, gloss, analogy, recap, avoid)
  stories/<id>.md      whole-game stories, one per destination (chapter 0 is stories/legal-letter.md)
  chapters/<id>.md     teaching text per station, front-matter holds the policy fields
  resources.json       per-station links, installers, model tables (the planned resources field)
  policy.md            authoring policy and style guide, read by the tutor as voice rules
```

stations.json keeps its current shape, with two additions:

| Field | Now | Change |
| --- | --- | --- |
| `id`, `name`, `area`, `needs[]`, `betterWith[]`, `zone`, `destination` | present | none; `needs` stays acyclic and is validated at build |
| `inYourHead` (criticality), `unlocks`, `proof`, `ifSkipped`, `headNote` | present | none |
| `proofCheck` | missing | optional machine check the tutor can run: `{"kind":"shell","cmd":"...","expect":"..."}` or `{"kind":"ask","question":"...","rubric":"..."}` |
| `resources[]` | missing | ids into resources.json |

Chapter front-matter (never shown on the page) carries: `station`, `whatIsNew`, `testedOn`, `beforeYouStart`, `whyThisColour`. The body is the narrative. This matches the brief's "no scaffolding on the page" rule, since the app renders body only and the tutor gets the front-matter as context.

A build script validates the folder: every `needs` resolves, no cycles, every destination has a story, every chapter's `station` exists, every term in map.json has a `definedIn` station. Fail the build, not the learner.

## Progress contract

Progress is one record per station, with provenance. The app trusts the learner but records who said so, and the map draws the difference (a ring for reported, a solid fill for verified).

```json
{
  "schema": 1,
  "learner": { "zone": 2, "goals": ["legal-letter", "meeting-minutes"], "os": "macos" },
  "stations": {
    "shell": { "status": "verified", "by": "agent", "at": "2026-11-03T19:02:00Z", "evidence": "ls -la ran; 14 entries" },
    "download": { "status": "reported", "by": "learner", "at": "2026-11-04T08:11:00Z" },
    "lmbasics": { "status": "read", "by": "app", "at": "2026-11-04T08:40:00Z" },
    "encrypt": { "status": "skipped", "by": "learner", "at": "2026-11-05T21:00:00Z", "note": "came back later via retention" }
  },
  "sessions": [ { "at": "2026-11-04T08:00:00Z", "summary": "Downloaded first model, got stuck on paths" } ]
}
```

Status values, in rising order (the order in docs/design.md, which wins): `unseen`, `read` (the app showed the chapter), `rehearsed` (the simulation pass succeeded), `reported` (the learner says they did the proof), `assisted` (Do it for me ran it; a half ring on the map until redone unaided), `verified` (the tutor ran the proofCheck or judged a rubric answer), `skipped` (the learner went past it; the tutor keeps a note of what that costs, from `ifSkipped`).

Rules the app enforces, so the tutor does not have to:

- A station can be opened when every `needs` is at least `reported`. `betterWith` never blocks.
- Verification only upgrades; it never downgrades a `reported` station to `read`. The softwarepilots bug (a claim threshold enforced while the claim tool was never wired) is the thing this rule exists to prevent.
- `skipped` is a first-class state, not a failure. Red (must understand) stations cannot be skipped past a destination; amber and grey can.
- Session summaries are written by the tutor at the end of each chat and fed back as context next time. This is the one piece of spaced-repetition state carried over from softwarepilots.

The file is append-friendly and small (139 stations, under 50 KB with history), so it can be synced by the learner with any tool they like, or emailed to a friend who is stuck.

## Brain contract

The tutor talks to any OpenAI-compatible chat endpoint plus Anthropic's. That covers Claude, OpenAI, llama.cpp server, Ollama, LM Studio, vLLM, oMLX and MLX-LM, which is every server awesome-local-ai installs. One adapter per wire format, not one per vendor.

```json
{
  "schema": 1,
  "active": "local",
  "brains": {
    "claude": { "kind": "anthropic", "model": "claude-sonnet-4-5", "keyRef": "keychain:local-ai-tutor/claude" },
    "local":  { "kind": "openai", "baseUrl": "http://localhost:8080/v1", "model": "qwen3-30b-a3b", "contextTokens": 32768 }
  },
  "fallback": "claude",
  "telemetry": "none"
}
```

What the app does with it:

- Keys never sit in the JSON. `keyRef` points at the OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux). The learner pastes the key once into the app, which stores it there.
- `contextTokens` is read from the server when it reports it, else asked for. The tutor's context assembly trims to fit, and says so when it has to drop session history.
- Port probe on first run and on request: 8080 (llama.cpp), 11434 (Ollama), 1234 (LM Studio), 8000 (vLLM), 10240 (oMLX). A hit offers that server as a brain with its model list.
- `fallback` is optional. If the local brain times out, the tutor may ask (never silently switch) whether to use the fallback for this turn. Privacy promise: a turn only leaves the machine when the learner picked a remote brain or said yes to the fallback.
- `telemetry: none` is the only value in version 1. There is no phone-home.

The tutor needs tool use (function calling) for proof checks and progress writes. Servers that lack it still work; the tutor then asks the learner to paste command output and judges it by rubric, which is also how it behaves with small models.

## First-run flow

The learner reads before they configure. Chapter 0 needs no brain, so it comes first, and picking a brain is framed as the first station rather than setup.

&#91;embedded content: first run · 6 steps, 3 brain options, 1 decision\]

If the learner picks an API key for the coach, nothing is hidden: the app says the coach itself is not local, and that the Wednesday check (the chat app's only destination is a machine you own, on your network or your tailnet) is about the learner's model, which can pass regardless. Getting the coach local too is where V2 goes. The dotted return from "check waits" is that loop. "Find your number" is the chapter 1 proof and sets the zone in progress.json, which filters which stations the map shows as reachable on this machine.

## What the tutor is told each turn

The system prompt is assembled fresh every turn from the three contracts, in this order, and trimmed from the bottom when the brain's context is small. This is softwarepilots' context-assembly layering with the curriculum source swapped for files.

1. Persona and voice: the authoring policy and the style profile as rules (plain English, define before use, no avoid-list phrases, analogies the reader keeps).
2. The learner: zone, OS, goals, and the one-line summaries of the last three sessions.
3. The map, compressed: every station as `id: name [status] needs(...)`, about 4 KB for 139 stations. The tutor sees the whole graph, so it can route, not just the current lesson.
4. The current station in full: its chapter body, front-matter, map.json terms it defines, `proof`, `proofCheck`, `ifSkipped`.
5. Teaching rules: teach one station at a time; tell the learner when they ask for something past an unmet `needs` and offer the shortest route; never mark `verified` without evidence; write a session summary when the learner says goodbye or after 30 minutes idle.

Tools the tutor can call: `read_chapter(id)`, `set_progress(id, status, evidence)`, `run_check(id)` (shell, with the learner's confirmation shown first), `probe_servers()`, `open_url(resource)`. Five tools, all with JSON schemas, all logged to the chat as cards so the learner sees what the tutor did.

Small-model mode: when `contextTokens` is under 16k or the server has no tool use, layer 3 shrinks to the current area only and tools become instructions to the learner ("run this and paste what you see"). The curriculum does not change; only how much of it is in view.

## From softwarepilots: lift, adapt, leave

Start a fresh repo and copy files in. The plumbing is what made the old repo a mess; the thinking ports in a handful of files.

| Piece | Where it is now | Verdict |
| --- | --- | --- |
| `CurriculumData`, `SectionLearningMap` types | `packages/shared/src/curricula.ts`, `curricula/learning-maps/` | Adapt: map module/section onto area/station; keep key intuition, core claims, misconceptions as optional chapter front-matter |
| Context assembly (persona, level, intuition, map, progress, text, summaries) | `packages/api/src/lib/context-assembly.ts` | Lift as pure functions; source becomes the curriculum folder |
| Spaced repetition and session summaries | `packages/api/src/lib/spaced-repetition.ts` | Lift |
| Claim-progress pure functions | `packages/api/src/lib/enrollment-store.ts and curriculum-store.ts` | Lift, then fix: `findSection` never sets `learning_map`, so the claim tool was never registered while the 70% threshold stayed on |
| Chat loop, cards, scripted intro | `packages/web/src/pages/SocraticSession.tsx and components/` | Lift the components; drop the Cloudflare fetch layer under them |
| Cloudflare Workers, D1, Hono routes | `packages/api, wrangler.toml` | Leave |
| GitHub OAuth, admin page, evaluator worker | `packages/api/src/routes/auth.ts`, `packages/web/src/pages/Admin.tsx`, `packages/evaluator` | Leave; single-user local app needs none of it |
| Regex concept extraction from bold text | `extractConcepts in packages/api/src/lib/curriculum-store.ts` | Leave; map.json replaces it |
| Two copies of the curriculum (TS seed and DB) | `packages/shared/src/curricula/`, D1 | Leave; one JSON folder replaces both |

The repo's one real product idea, that a learner proves claims rather than ticks boxes, survives as the `proof` and `proofCheck` fields and the `verified` status.

## Open decisions

Three choices gate the first commit. My lean is in the first row of each; none is irreversible but all three are expensive to change after a month.

| Decision | Options | Lean and why |
| --- | --- | --- |
| Runtime | Single binary serving a local web UI (Go or Rust, embedded assets) · Electron/Tauri desktop app · Terminal UI | Binary plus browser. One download under 30 MB, the React chat components port, a shell is available for proof checks. Tauri is the fallback if a system tray or native file dialogs turn out to matter. |
| Repo | Fresh repo, copy good files in · Reform softwarepilots in place | Fresh. The lift table is nine files; the rest is deleted anyway, and the git history of a Cloudflare app is not a help. |
| Curriculum packaging | Shipped inside the binary · Separate `curriculum/` folder beside it · Fetched from awesome-local-ai on first run | Folder beside the binary, versioned with the release. Readers can edit it, and the book build and the app build read the same files. |

Also to settle, but not blocking: the name (working title is the book's), whether progress.json is also written as a human-readable `progress.md` for sharing, and which small local model is the recommended first brain for zone 1 (a 4B class model that supports tool use, chosen from the awesome-local-ai benchmarks once they exist for this task).

- [ ] Pick the runtime
- [ ] Create the repo and copy the lift list in
- [ ] Write the build validator for `curriculum/`
- [ ] Add `proofCheck` and `resources` to stations.json for the Book 1 stations
- [ ] First-run flow end to end with an API key, then with a probed local server

The proof of concept for chapters 0 and 1, with the Unix Jelly hybrid and the evidence loops: PoC: chapters 0 and 1
