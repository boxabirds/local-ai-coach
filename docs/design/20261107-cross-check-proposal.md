# Cross-check: the missing topics as stations

Date: 2026-11-07. Source: `docs/curriculum-cross-check.md` (Julian's topic list, renamed from `curriculm-cross-check.md`).
Julian's instruction: "integrate the material I identified that was missing into stations.json", and "anything can be a station if you have a quiz with a score".

## Decision taken

- Every topic in the cross-check that no station covered is now a station or a destination: 32 stations, 6 destinations. `stations.json` goes from 141 to 179. (Round 3c swaps one station for another; the count stays 179.)
- A topic that is knowledge, not a skill, is proved by a quiz score ("Quiz: 8 of 10 or better on ..."). That fits the book's colour test in chapter 0: amber is "you can say in a sentence what it did", and every quiz station is amber. Five stations are proved by a quiz: `cloud`, `transformers`, `hats`, `apt` and `standards`. The proof field stays free text, so the schema and the validator are unchanged.
- In the first pass no existing station gained a need. That left 18 new stations off every route, so Julian approved wiring them in (round 3b, below). Priya's route to Private legal drafting is unchanged; the script that applied the wiring checks it. Existing stations only gained better-with links to new ones: `localchat` to `prompting`, `run` to `gpu` and `harness`, `codingagent` to `specs` and `apptests`, `static` to `fullstack`, `power` to `ups`.
- No new area: each station sits on an existing line, so the map's line colours are unchanged.

## What was added

| id | name | area | needs | in your head | zone | proof |
|---|---|---|---|---|---|---|
| `processes` | What's running | trunk | shell | know what it does | 1 | task |
| `disk` | Disks and space | trunk | shell | know what it does | 1 | task |
| `gpu` | Graphics cards and drivers | trunk | machine | know what it does | 1 | task |
| `windows` | Windows: PowerShell and WSL2 | trunk | shell | know what it does | 1 | task |
| `cloud` | Cloud or local | trunk | machine, web | know what it does | 1 | quiz |
| `prompting` | Prompt engineering | trunk | localchat | know what it does | 1 | task |
| `transformers` | Why transformers changed everything | models | lmbasics | know what it does | 1 | quiz |
| ~~`benchmarks`~~ | Benchmarks that matter: folded into `compare` in round 3c | | | | | |
| `backtest` | Backtest against what you do now (round 3c) | models | compare, evalharness | must understand | 1 | task |
| `abliteration` | Censorship and abliteration | models | download, test | must understand | 1 | task |
| `harness` | Inference servers and harnesses | models | run | know what it does | 1 | task |
| `monitor` | Monitoring and capacity | ops | logs, processes | know what it does | 1 | task |
| `ups` | UPS and surge protection | ops | power | know what it does | 1 | task |
| `repair` | Wear, tear and repair | ops | power, backups | know what it does | 1 | task |
| `oldhw` | Give an old computer a job | ops | machine, shell | know what it does | 1 | task |
| `ssh` | SSH | net | shell, web | must understand | 1 | task |
| `wifi` | Wifi, mesh and throughput | net | web | know what it does | 1 | task |
| `hats` | Black, grey and white hats | govern | web | know what it does | 1 | quiz |
| `apt` | Cyberpolitics and advanced persistent threats | govern | hats | know what it does | 1 | quiz |
| `ruleoftwo` | The rule of two | agents | injection | must understand | 1 | task |
| `skills` | Agent skills | agents | toolcall | know what it does | 1 | task |
| `standards` | Agent standards | agents | mcp | know what it does | 1 | quiz |
| `scripts` | Scripts that call a model | code | shell, run | press go | 1 | task |
| `forge` | GitHub and GitLab | build | git | know what it does | 1 | task |
| `reuse` | Shoulders of giants | build | forge, licence | know what it does | 1 | task |
| `sql` | SQL databases: SQLite and Postgres | build | shell | know what it does | 1 | task |
| `docstore` | Document databases (NoSQL) | build | json | know what it does | 1 | task |
| `fullstack` | How an app fits together | build | web | know what it does | 1 | task |
| `specs` | Write a specification | build | fullstack | must understand | 1 | task |
| `ux` | Design for the person using it | build | specs | know what it does | 1 | task |
| `apptests` | Test your app | build | specs | must understand | 1 | task |
| `users` | User accounts and sign-in | build | fullstack, secrets | must understand | 1 | task |
| `sensors` | Cameras and sensors | in | shell | press go | 1 | task |
| `d_shopping` | Shared shopping list | build | users, vpn, extract, sql, prove | know what it does | 1 | task |
| `d_netmon` | Network monitoring and diagnosis | net | monitor, logs, segment, wifi, summarise | must understand | 1 | task |
| `d_repurpose` | Old hardware, new job | ops | oldhw, ssh, vpn, backups | know what it does | 1 | task |
| `d_familycloud` | Local cloud for home and family | ops | users, vpn, backups, encrypt, sql, ups, monitor, retention | must understand | 1 | task |
| `d_homechat` | ChatGPT for home | models | localchat, harness, users, vpn, parallel, prompting, retention, prove | must understand | 2 | task |
| `d_prepping` | Digital prepping | net | users, harness, ups, wifi, backups, encrypt, rag, oldhw | must understand | 2 | task |

## Topics already covered, so not added

| Cross-check topic | Station already there |
|---|---|
| Unix commands, permissions | `shell` |
| Network (domains, IP, http) | `web` |
| Firewalls, VPNs and Tailscale | `bind`, `vpn`, `segment`, `egress` |
| Sandboxing | `sandbox`, `containers` (the rule of two is new: `ruleoftwo`) |
| Encryption, privacy | `encrypt`, `minimise`, `retention`, `dpia` |
| Backups and restoration | `backups` |
| Local site hosting (ngrok and friends) | `tunnelgated`, `toggle`, `tunnelpublic` |
| Observability, logging and tracing | `logs`, `trace`, `audit` |
| Temperature, heat, electricity | `power` |
| Prefill, generation and caching | `prefill`, `kvcache` |
| Summarisation, categorisation, system one models | `summarise`, `classify`, `small` |
| Quants, fine-tunes, adapters, evals | `quant`, `finetune`, `evalharness` |
| Parameters and quantisation as quality | `lmbasics`, `quant` |
| Speech, cloning, stems, music, consistency, lip sync | `stt`, `tts`, `voiceclone`, `stems`, `music`, `consistency`, `lipsync` |
| Image and video in and out, LoRAs | `vision`, `image`, `edit`, `videoin`, `videogen`, `finetune` |
| Unified memory vs video memory | `machine` |
| ComfyUI, Blender and others | `comfy`, `threed` |
| AI automation, agentic workflows | `workflow`, `agentloop` |
| Vectors | `embed`, `retrieve` |
| Human feedback loops | `review` |
| MCP | `mcp` |
| Personal data and hardware keys | `hwkeys`, `secrets` |
| Multiple or concurrent sessions | `parallel` |
| OpenCV, FFmpeg | `cv`, `stitch` |
| Data synthesis, evals | `synth`, `evalharness` |
| Git | `git` (GitHub and GitLab are new: `forge`) |
| Analytics | not added: the coach and the book are against telemetry; `trace` covers what a local setup needs |

## Challenges

Already a destination: home security (`d_cctv`), note and minute taker (`d_minutes`), family photos and videos (`d_family`), receipts (`d_invoices`), social media (`d_newsletter`). Summariser, classifier and personal backup are stations (`summarise`, `classify`, `backups`).
New destinations: shared shopping list (`d_shopping`), network monitoring (`d_netmon`), repurposing old hardware (`d_repurpose`), local cloud for home and family (`d_familycloud`), ChatGPT for home (`d_homechat`), digital prepping (`d_prepping`, a specialist track, as the cross-check says).

## Impact on every other artefact

- `curriculum/map-layout.json`: generated again (`make map-layout`): 179 stations, 611 links. The test fixtures' layout is unchanged.
- `curriculum/scope.json`, the lessons, `map.json`, `figures.json`, the stories and chapters: unchanged. None of the new stations is in V1's reading order, so no term needs defining yet.
- The book text (`panel/`): unchanged. Chapter 0's colour test already admits a quiz for amber. Chapter 1 already tells Windows readers where to find memory; `windows` is where the book teaches the rest.
- The coach: unchanged in code. Its whole map shows the new stations, and the model sees them in the map it is given.
- `docs/design.md`, `CLAUDE.md`: the station count updated to 179. `docs/spec.md` keeps its size estimates for 139 stations; they are estimates from before, not facts to update.
- `curriculum/validate.py`: passes, 179 stations.

## Decisions that are Julian's

1. **Each proof and each placement.** These are drafts in the book's voice, checked with `panel/stylecheck.py`. The areas, the needs and the colours are my judgement.
2. **Claws.** Not added: I read it as the always-on personal assistant, which `d_agent` already is. Say if it means something else.
3. **The cross-check's Stages (Understand, Create, Own and Maintain)** are not stations. They describe the life of a learner's project, a different axis from a station's colour. Own and Maintain is now served by `monitor`, `ups`, `repair` and `oldhw`.
4. **Windows in the coach.** The book's graph now teaches Windows; the coach's V1 scope stays macOS and Linux.
5. **The fitted map.** At 179 stations the whole map, fitted to the screen, is a thin column 1229 by 7710 units. It was unreadable at 141 too. The layout's shape is a separate change.

## Round 3b: the new stations on the routes (approved by Julian, 2026-11-07)

The first pass left 18 new stations that no destination needed, so no route went through them. Each is now a need, or a better-with, of the destinations it belongs to. Rule for `gpu`: every destination in zone 2 or 3 that runs a model needs it (not Website live, which runs none). Existing stations other than destinations gained no needs.

| station | link | destinations |
|---|---|---|
| `ruleoftwo` | needed by | `d_agent`, `d_home`, `d_triage`, `d_research`, `d_codereview` |
| `apptests` | needed by | `d_website`, `d_support` |
| `ux` | needed by | `d_website`, `d_shopping` |
| `sensors` | needed by | `d_cctv`, `d_home` |
| `skills` | needed by | `d_agent` |
| `scripts` | needed by | `d_invoices`, `d_photos`, `d_family`, `d_shownotes` |
| `gpu` | needed by | `d_bundle`, `d_research`, `d_support`, `d_teamkb`, `d_photos`, `d_voice`, `d_family`, `d_tutor`, `d_cctv`, `d_storybook`, `d_dubbing`, `d_musicvideo`, `d_codereview`, `d_agent`, `d_home`, `d_homechat`, `d_prepping` |
| `disk` | needed by | `d_photos`, `d_family`, `d_cctv`, `d_familycloud`, `d_repurpose` |
| ~~`benchmarks`~~ | folded into `compare` | (round 3c) |
| `repair` | needed by | `d_familycloud`, `d_repurpose`, `d_prepping` |
| `reuse` | needed by | `d_familycloud`, `d_netmon`, `d_shopping` |
| `cloud` | needed by | `d_familycloud`, `d_homechat` |
| `standards` | better with, for | `d_agent`, `d_home` |
| `skills` | better with, for | `d_codereview` |
| `apptests` | better with, for | `d_codereview` |
| `ux` | better with, for | `d_support`, `d_homechat` |
| `docstore` | better with, for | `d_invoices`, `d_triage` |
| `abliteration` | better with, for | `d_research` |

Leaves on purpose, needed by nothing: `windows` (a platform branch), `transformers` and `apt` (background, quiz-proved), `abliteration`, `docstore` and `standards` (better-with only: useful, never required).

How much longer each changed route is (stations on the route, before and after):

| destination | name | before | after | change |
|---|---|---|---|---|
| `d_agent` | Personal agent | 41 | 44 | +3 |
| `d_bundle` | Legal bundle review | 23 | 25 | +2 |
| `d_cctv` | CCTV event detection | 18 | 21 | +3 |
| `d_codereview` | Code review bot | 16 | 19 | +3 |
| `d_dubbing` | Video dubbing | 13 | 15 | +2 |
| `d_family` | Family photo and video organiser | 14 | 18 | +4 |
| `d_familycloud` | Local cloud for home and family | 19 | 25 | +6 |
| `d_home` | Home automation agent | 31 | 34 | +3 |
| `d_homechat` | ChatGPT for home | 24 | 28 | +4 |
| `d_invoices` | Invoice and receipt processing | 17 | 18 | +1 |
| `d_musicvideo` | Prompt to music video | 18 | 20 | +2 |
| `d_netmon` | Network monitoring and diagnosis | 12 | 16 | +4 |
| `d_photos` | Searchable photo archive | 12 | 16 | +4 |
| `d_prepping` | Digital prepping | 20 | 22 | +2 |
| `d_repurpose` | Old hardware, new job | 9 | 12 | +3 |
| `d_research` | Research assistant with citations | 22 | 24 | +2 |
| `d_shopping` | Shared shopping list | 18 | 23 | +5 |
| `d_shownotes` | Podcast transcription and show notes | 15 | 16 | +1 |
| `d_storybook` | Illustrated story book | 11 | 13 | +2 |
| `d_support` | Customer support bot over company docs | 33 | 37 | +4 |
| `d_teamkb` | Knowledge base for a small team | 26 | 27 | +1 |
| `d_triage` | Email triage | 23 | 24 | +1 |
| `d_tutor` | Language tutor | 17 | 19 | +2 |
| `d_voice` | Voice assistant | 15 | 17 | +2 |
| `d_website` | Website live | 12 | 16 | +4 |

## Round 3c: Compare and choose is the core loop (Julian, 2026-11-07)

Julian: "compare and choose is plain English for benchmarking ... a core loop when working with AI. You don't just pick a model, you pick a model and you evaluate. If there's an existing workflow, then you also have to do backtesting and confusion matrix assessments."

- **`compare` was a dead end before today**: no destination needed it. Now every destination that uses a model needs it: 28 of 32. Not Website live, Old hardware and Local cloud, which run no model, and not Private legal drafting, whose route is chapter 0's and is held fixed.
- **`benchmarks` is gone.** I added it this morning and it duplicated `compare`. Its idea, public benchmarks give you a shortlist and your own set decides, is now in `compare`'s headNote. Its one link (needed by ChatGPT for home) now points to `compare`.
- **New: `backtest`, Backtest against what you do now.** It needs `compare` and `evalharness`, and its headNote defines backtesting and the confusion matrix. Destinations that replace a workflow someone already runs need it: Email triage, Invoice and receipt processing, Customer support bot, Code review bot, Legal bundle review, Personal finance.
- **Open for Julian:** should Priya's route include `compare`? In chapter 0 she uses one model and never compares. Adding it changes the story's route and the book's chapter 0 claims, so I left it.

Route lengths, before and after round 3c:

| destination | name | before | after | change |
|---|---|---|---|---|
| `d_agent` | Personal agent | 44 | 45 | +1 |
| `d_bundle` | Legal bundle review | 25 | 27 | +2 |
| `d_cctv` | CCTV event detection | 21 | 24 | +3 |
| `d_codereview` | Code review bot | 19 | 24 | +5 |
| `d_dubbing` | Video dubbing | 15 | 17 | +2 |
| `d_family` | Family photo and video organiser | 18 | 20 | +2 |
| `d_finance` | Personal finance over bank exports | 14 | 18 | +4 |
| `d_home` | Home automation agent | 34 | 36 | +2 |
| `d_invoices` | Invoice and receipt processing | 18 | 21 | +3 |
| `d_minutes` | Meeting minutes | 15 | 17 | +2 |
| `d_musicvideo` | Prompt to music video | 20 | 22 | +2 |
| `d_netmon` | Network monitoring and diagnosis | 16 | 18 | +2 |
| `d_newsletter` | Newsletter and blog pipeline | 19 | 20 | +1 |
| `d_photos` | Searchable photo archive | 16 | 18 | +2 |
| `d_podcast` | Document to podcast | 13 | 15 | +2 |
| `d_prepping` | Digital prepping | 22 | 25 | +3 |
| `d_reader` | Accessibility reader | 12 | 14 | +2 |
| `d_research` | Research assistant with citations | 24 | 25 | +1 |
| `d_shopping` | Shared shopping list | 23 | 25 | +2 |
| `d_shownotes` | Podcast transcription and show notes | 16 | 18 | +2 |
| `d_storybook` | Illustrated story book | 13 | 15 | +2 |
| `d_support` | Customer support bot over company docs | 37 | 39 | +2 |
| `d_tasks` | Meeting to tasks | 23 | 25 | +2 |
| `d_teamkb` | Knowledge base for a small team | 27 | 28 | +1 |
| `d_triage` | Email triage | 24 | 27 | +3 |
| `d_tutor` | Language tutor | 19 | 21 | +2 |
| `d_voice` | Voice assistant | 17 | 19 | +2 |
