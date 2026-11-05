# Proposal: the pedagogical flow for "what can my machine do?" (Book 1)

Status: proposed 2026-11-05. Decided so far: the letter comparison uses real outputs from one family, Qwen (Julian, 2026-11-05). First run done: `letter-run/20261105-letter-run.md`. Builds on `20261105-what-fits-proposal.md` (the impact check) and answers it with a flow. Nothing in the curriculum or the book has changed. Every change to book text or to stations is the author's decision.

## 1. The idea in one line

Start from the job, not the file. **Your machine decides which jobs you can do, how well, and how fast; whatever the quality, you read it and you sign it.** "Does it fit" stays, but as the first of three questions, not the whole answer.

## 2. The flow across Book 1

```
Ch 0  Priya's story        a job (the letter), a quality ("a decent trainee"), a review ("making it hers")
Ch 1  Know your machine    what your machine can do: memory AND what does the work; jobs by size
Ch 2  What's in the file   why size, quantisation and context change memory and quality
Ch 3  Networks             unchanged
Ch 4  The private link     unchanged
Ch 5  Prove it             unchanged
Book 2                     speed in depth: graphics cards, prefill, KV cache, power
```

The three questions, and where each is answered:

| Question | Introduced | Taught properly |
|---|---|---|
| Does it run? (fits in memory, with room to work) | Ch 1 | Ch 2 (context and working space), Book 2 (KV cache) |
| How fast? (what does the work: graphics card, Apple silicon, plain CPU) | Ch 1 (one fact and a pointer) | Book 2 (prefill, generation, power) |
| How good? (bigger and less squashed is better, up to a point) | Ch 0 (shown), Ch 1 (by job) | Ch 2 (quantisation and size, with examples) |
| Who answers for it? (you review what you send) | Ch 0 (shown) | Ch 2 (named and tested) |

## 3. Chapter by chapter

### Chapter 0: The whole game

**Change: small, mostly emphasis.** The story already has the job, the quality and the review: "It's… fine. It's the draft a decent trainee would hand her." and "She spends the next twenty making it hers." Nothing new in the scene.

- Add one question to the "Why?" list, alongside the existing four: why did she spend twenty minutes on a draft the machine wrote? (Answered in chapter 2: the letter has her name on it.)
- The app "offered her a really short shelf of three or four models, and recommended one". One added clause would set up chapter 1: it picked them *for the job and the box*.
- Stations: Priya's three stay. The new accountability station (section 4) is not one of her three this week, so chapter 0 only shows it.

### Chapter 1: Know your machine

**Change: the main one.** Two parts, as you asked.

**Part 1: local models use a lot of your machine.**
- Two facts on the sticky note, not one: the memory number, and what does the work (a graphics card, Apple silicon, or the plain processor). The station's own proof already asks for "RAM, GPU memory and disk free", so this catches the chapter up with its station rather than adding to it.
- Memory is split into two buckets (Julian, 2026-11-05):
  1. **What the computer needs:** the operating system and whatever else you have open.
  2. **What the model needs:** everything that runs it. The main parts are the weights (the model file), the program that runs it (the inference server) and the context window (what you're talking about). Everything else goes under "other supporting features", named but not taught here: the cache that grows with the conversation, multi-token prediction, n-gram caches and so on.

  "Working space" stays as the plain word for the model's bucket apart from the weights: the server, the context and the supporting features. Chapter 1 names each part in one line, with pointers to chapter 2 (context) and Book 2 (the caches).
- Measured, from the letter run (Ollama on gruntus, default settings): the model's bucket is always bigger than the file, and the extra isn't a fixed share.

  | Model | File | Model's bucket in use | Extra |
  |---|---|---|---|
  | Qwen 3 0.6B | 0.5 GB | 2.2 GB | 1.7 GB, about 4 times the file |
  | Qwen 3 8B | 5.2 GB | 7.5 GB | 2.3 GB |
  | Qwen 3 32B | 20 GB | 23.1 GB | 3.1 GB |

  So "a quarter for elbow room" is wrong at both ends: too much for big files, far too little for small ones.
- **The rule of thumb is wide on purpose (Julian, 2026-11-05).** "Does it fit?" is only worth asking when the answer is almost certainly yes or almost certainly no. So the rule has three bands, not a line:
  - **Fits:** comfortably, whatever the settings.
  - **Doesn't fit:** whatever the settings.
  - **Depends:** the middle, where the settings decide. This isn't a fail. It's where the learner starts tuning, and the rest of the series is that journey (quantisation and context in chapter 2, the caches in Book 2).

  The candidate (mine, to be tested against the job table before anything changes): **fits if the file is under half your memory; doesn't if the file is bigger than your memory; depends in between.** On 16 GB: 2 GB fits, 5 GB fits, 10 GB depends, 20 GB doesn't. It holds for the three measurements above (the 32B's 20 GB file on a 24 GB card is "depends", and it did fit, with under 1 GB to spare). What I haven't measured is the computer's bucket on an 8 GB machine, where it is a bigger share and "under half" may be too generous. That needs a run on an 8 GB machine, which I don't have.
- **Kinds of machine (Julian, 2026-11-05).** Two kinds of memory, named **normal memory** and **graphics card memory** ("graphics card" because the book already says it 16 times, and it's one step from "GPU"; never "shared" or "unified", since Windows uses "shared GPU memory" for the opposite). The second fact on the sticky note becomes: do you have graphics card memory, and how much?
  - **Office laptop, or Priya's box:** normal memory only, and the processor does the work. Small and medium models at reading pace or a bit under. Measured: Qwen 3 8B on the processor alone (gruntus, i9-13900F, graphics card off) at 8.4 tokens a second, about 6 words a second; 0.6B at 71; 32B at 2.3 (under 2 words a second, four and a half minutes for the letter). An office laptop reads its memory more slowly than this desktop, so expect less (not measured). This keeps chapter 0's promise: no graphics card, and the letter still comes out at reading pace.
  - **Gaming PC or laptop:** a graphics card with 4 to 16 GB of its own memory, beside normal memory (64 GB of normal memory and 12 GB on the card is typical). Graphics card memory is the small fast room. A model that fits there runs fast. A bigger one spills into normal memory and runs at about processor speed. So three outcomes, fast, slow, or doesn't fit, and the bands apply twice: to the card for "fast", and to both together for "runs at all". This is where "which model fits" matters most, and chapter 1's "complication you can ignore for now" can't be ignored any more.
  - **Mac, or a Ryzen AI Max box:** normal memory only, but the built-in graphics uses it directly, so it's fast. Not all of it is available to the graphics; I understand macOS caps it at about two thirds to three quarters by default, which is not measured yet.
  - **A local AI machine (64 to 128 GB):** a server for one person or a team, reached over the network. This is the PoC's box on the shelf (chapters 3 to 5).

  BitNet-style models built for processors are real but few, so they're a footnote, not a category.
- What does the work decides speed: at reading pace, or a word every few seconds. One sentence, a pointer to Book 2.
- Goes: "A 20 GB model on a 16 GB laptop doesn't run slowly. It doesn't run." (some apps will have a go, as the chapter's own pedantic note admits) and "the sticky note really is the whole story". Stays: the room and the warehouse, which is still true and still the clearest image in the chapter.

**Part 2: what your machine can do, by job.** A table of four jobs, each with a small, medium and large setup, and for each: the model's bucket in use (file plus working space), speed on two reference machines, and a plain quality note.

| Job | Small | Medium | Large |
|---|---|---|---|
| Sort and tag short texts (classification) | to measure | to measure | to measure |
| Summarise a page | to measure | to measure | to measure |
| Draft a letter like Priya's | to measure | to measure | to measure |
| A coding agent | to measure | to measure | to measure |

Every cell is measured, and the table says on which machines (this 16 GB Mac and an RTX 4090 Linux box, as a start). No guessed numbers in the book.

**The test becomes:** "Which of these jobs can your machine do comfortably?" One row per job, marked in code against the learner's own two facts, as the fits card already is, with three answers per row: fits, depends, doesn't. Nobody is told "no chance"; a "depends" job gets "here's what you'd tune", and a job that doesn't fit gets "not on this machine, and here's what it would take".

**Have you got it?** "Say your two facts without looking, and name one job your machine does comfortably and one it doesn't."

### Chapter 2: What's in the file

**Change: absorbs quality and accountability.** It already "opens the file and explains the numbers on its label". Those numbers are the ones chapter 1 now points at:
- **Size (parameters):** bigger is usually better at the job, and needs more room.
- **Quantisation:** the dial between fit and quality (the existing `quant` station: "Fit versus quality is a dial you can measure").
- **Context length:** the biggest part of the working space you control, and the first dial a learner turns in chapter 1's "depends" band.

**Learning objective (Julian, 2026-11-05):** model size matters not just because of what fits on your machine, but because of quality, and to some extent speed.

Then the letter, three ways: Priya's request, the same fictional materials, sent to three sizes of one model generation (first run: Qwen 3 at 0.6B, 8B and 32B, because gruntus's Ollama 0.9.6 is too old for Qwen 3.5's 0.8B, 9B and 27B; the run can be repeated on 3.5 after an Ollama upgrade). Materials and script: `docs/design/letter-run/`, run on a real machine, **real outputs, not simulated**, each run three times, with memory in use, time to the first word and words per second beside each. Each letter is checked against the materials for wrong facts and invented law, and the checks are shown. Then the line the chapter has been heading for: whichever one you use, you read it, you fix it, and you sign it. That answers the question chapter 0 added.

### Chapters 3, 4 and 5

No change. Networks, the private link and the proof don't depend on model size or quality. Chapter 5's proof stays about where the words go.

### Book 2

No change to its plan. It already takes speed, graphics cards and the cache. Chapter 1 now points there by name instead of saying "ignore this for now".

## 4. Taxonomy changes (stations.json)

| Station | Now | Proposed |
|---|---|---|
| `machine` | headNote "RAM vs GPU memory, and why model size is the gate"; proof "state your RAM, GPU memory and disk free" | headNote "Your machine decides which jobs you can do, how well and how fast"; proof "State your memory and what does the work, and name a job your machine does comfortably and one it doesn't" |
| new `accountable`, "You're accountable" | none | "You answer for what it writes", **red** (it fails quietly: a confident draft nobody checked). Taught in chapter 2. Added to `d_legal`'s needs |
| `quant`, `context` | needs download, machine / lmbasics | unchanged; chapter 2 is where they first appear in the book |
| `compare` | "Same set, same scoring, write it down" | unchanged; the chapter 1 table is a first, fixed comparison, and `compare` teaches learners to make their own |

Term changes in `map.json`:
- "rule of thumb (three quarters)" becomes "rule of thumb (half)", or whatever the measurements support, with the three bands in its gloss and recap. The "elbow room" analogy becomes the computer's bucket.
- New terms, defined in chapter 1: "what the computer needs", "what the model needs", "working space" (pointing to "context window" in chapter 2) and "other supporting features" (pointing to Book 2).

Other places the three-quarters rule appears, all of which change with it:
- book text: `chapters/know-your-machine.md` lines 228, 230 and 318, plus its front-matter;
- `lessons/machine.json`: the hint, the rubric and the recap;
- figures: `will-it-fit`, `room-and-warehouse` and `one-file` (the mark, the captions and the verdict lines in `make_figures.py`), and the rule's own copy in `validate.py`;
- coach code: `fits_room` and `grade_choices` in `checks.py` grade two answers today, and need a third.

The two kinds of memory also change:
- `map.json` term "two rooms (separate graphics card memory)", which becomes "graphics card memory", with "normal memory" as its partner;
- `chapters/know-your-machine.md` line 260 ("A complication you can ignore for now"), its front-matter claim that the card "changes speed, not whether it runs", and the reference machine "16 GB laptop, no GPU";
- the 16 uses of "graphics card" in the curriculum, which stay as they are.

## 5. What it means for the coach (V1)

- **Lesson `machine`:**
  - step 1 asks for both facts (memory, and what does the work);
  - step 2 checks the memory number as now, and a new probe reads the kind of machine: graphics card memory and how much (`nvidia-smi` or `rocm-smi` on Linux, `system_profiler SPDisplaysDataType` on a Mac, which reports built-in graphics using normal memory);
  - step 3 becomes the job table test on the existing choice card.
- **Figures:**
  - will-it-fit draws the two buckets, and the three bands instead of a three-quarters mark;
  - one-file stops claiming "runs wherever the room is big enough";
  - room-and-warehouse stays.
- **New:** the letter at three sizes, as a story figure or a coach card, in chapter 2's lesson (not in V1's scope unless you add chapter 2 to it).
- **The measuring itself:** a small script runs each setup on this Mac and on gruntus and records memory in use and words per second. It runs with Ollama on gruntus, as I did for step 3, and its output goes in `curriculum/` as data the validator can check, like the figures.

## 6. Decisions (yours)

1. **The flow:** two facts and a job table in chapter 1, quality and accountability named in chapter 2. Yes, or a different split?
2. **The book text:** do chapters 0 and 1 change as described, or only the coach?
3. **The accountability station:** add it (red), and what's it called?
4. **Measuring:** may I measure the job table on this Mac and gruntus and publish the numbers labelled with those machines?
5. **V1 scope:** the letter-at-three-sizes example belongs to chapter 2, which isn't in V1. Add it to V1, or leave it for after?
6. **The band edges:** "under half fits, over the whole doesn't" is my candidate. It replaces your three-quarters rule in the book, so the numbers are yours. Should I test it against the job table first, and is an 8 GB machine available to measure on?

Decided 2026-11-05 (Julian): decision 6, the band edges: under half your memory fits, bigger than your memory doesn't, in between depends. No 8 GB machine is available, so the rule is marked as not measured on 8 GB wherever it appears, until someone measures it. The names "normal memory" and "graphics card memory", and machines described by which of the two they have. Also decided: the two buckets, what the computer needs and what the model needs (weights, inference server, context window, other supporting features); "working space" kept as a phrase; and a rule of thumb wide enough that "fits" and "doesn't" are almost certain, with the middle left to tuning.

Decided 2026-11-05 (Julian), decisions 2 and 3:
- **Book text changes with the coach.** Coach changes go back into the book; CLAUDE.md now makes this a policy for every artefact and medium. Chapters 0 and 1 change as described; I draft, Julian edits.
- **Accountability is taught, through Priya getting it wrong.** Let Priya burn her reputation, not the learner's. Proposed scene for chapter 2 (draft for Julian): on a rushed day Priya sends a letter from the big model with only a skim. It reads well. The landlord's reply is confused: his deposit is with the DPS, so what is "the TDS", and which law gives him ten days from the end of the tenancy? Her client forwards it asking the same questions. Every one of those errors is real, from the 32B letters in `letter-run/20261105-letter-run.md`. She spends the afternoon on an apology letter and a phone call she didn't need. The chapter then names the skill: read it, check every fact against the papers, and sign it only when it's yours. The station is `accountable`, "You're accountable" (Julian; sentence case, like every other station name).
- **Decision 5 (Julian, 2026-11-05):** chapter 2's letter comparison stays out of V1. Chapter 1's job table carries the letter row.

## 7. "Your number" goes (Julian, 2026-11-05)

Feedback: "knowing your number" reads as ominous ("your number is up"). It's also out of date: chapter 1 now has two facts, not one number.

Decided (Julian, 2026-11-05): **frame it as the reader's goal, not the hardware fact.** The chapter's question is "What local AI can I do with my computer?". The two memory facts are how you answer it, not the headline. This is also chapter 1's learning objective (decision 1): the reader leaves able to say which everyday jobs their computer does comfortably, which slowly, and which not at all, and why, from its memory and graphics card memory.

Wherever "your number" stands for the goal (headings, the promise, the recap), it becomes the goal. Wherever it stands for the fact (the card where the reader types it, the check), it becomes the fact by name: "memory" or "graphics card memory".

Places that change:
- book text: `panel/final-narrative.md` and `curriculum/chapters/know-your-machine.md` (the "Find your number" heading, "Knowing your number is two minutes of your life, once.", the proof, the recap, and every "your number" in between, 9 in the chapter);
- `curriculum/lessons/machine.json`: step 1's text, the hint and the recap; `curriculum/map.json`: the rule-of-thumb recap;
- the coach: the number card's label "Your number" (`apps/app/src/components/coach/number-card.tsx`) and the figure's "Your number" control;
- docs: CLAUDE.md and `docs/design.md` call the step "Find your number".

## 8. No time promises (Julian, 2026-11-05)

Decided: the chapter makes no promises about how long anything takes the reader. The "two minutes", "five minutes" and "five seconds" lines go from the book text (`panel/final-narrative.md`, `curriculum/chapters/know-your-machine.md`) and the front-matter's "in two minutes". The "five-minute promise" I used as a design limit in sections 3 and in `20261105-what-fits-proposal.md` goes with them. The job table's model speeds stay: they are measurements of the machine, not promises to the reader.

Decided (Julian, 2026-11-05): the station and chapter are renamed "What can my computer do?". The station id `machine` stays, so progress files and links keep working; the name changes in `stations.json`, the chapter, the lesson, `scope.json` and wherever the coach shows it.

## 9. The jobs are Priya's work (Julian, 2026-11-05)

Decided: the job table's rows are Priya's own tasks, not generic ones. Proposed rows:
1. **Draft a letter** (the deposit letter; measured, `letter-run/`).
2. **Summarise a document** (for example the tenancy agreement or a client's long email; station `summarise`, already in the graph, needs `localchat`).
3. **A coding agent builds a legal tool** (station `codingagent`, zone 2, needs sandbox, context, codechat, git, toolcall). Hinted in chapter 1, built in later chapters.
4. Proposed by me, not yet agreed: **sort her inbox by client matter** (stations `classify` and `d_triage`). It's the cheapest job, and the one an office laptop does well at small sizes.

Julian's idea: the legal tool becomes the backbone of many chapters. Reach in the taxonomy:
- `d_legal` (Private legal drafting) is Priya's chapter 0 destination; `d_bundle` (Legal bundle review, zone 3) is the nearest later one. No destination yet says "build a tool a lawyer uses every week".
- Candidate tools, each something small practices do by hand all the time: a bundle index and page-numberer, a chronology from a pile of documents, a deadline calculator from court rules, a clause comparison between two versions of a contract. Each needs checking with a practising lawyer before it's chosen.
- A running case study gives the series continuity, but most destinations in the graph are not legal (photos, podcasts, CCTV, finance). Risk: non-legal readers feel it isn't their book. Mitigation to consider: Priya's practice as "a small office" whose jobs (letters, summaries, sorting, a small tool) are everyone's, with the legal detail as colour.

Open (author): the fourth row; which tool; a new destination or an extension of `d_bundle`; how far the backbone runs.

## 10. Scope and trusted channels (Julian, 2026-11-05)

Decided: be explicit about what the book handles and which channels the reader already trusts. Most people in Priya's position use and trust Microsoft 365, Copilot included, for mail. The book doesn't try to replace that. What's left for local AI: **Priya drafts documents with an AI that is local and trusted, and sends them over a channel she already trusts.**

Consequences:
- Inbox sorting leaves the job table: Copilot does it in a channel she trusts. Its stations (`classify`, `d_triage`) stay in the graph for readers who don't use 365.
- The summarising row is about documents that live with her, not her email: a bundle, file notes, the tenancy agreement on her disk.
- Open question the book must answer, or a reader with Copilot asks "why bother?": if she trusts 365 to hold the client's facts, why not trust Copilot to draft with them? Candidate answers, to be checked before any goes in the book: work she wouldn't give any AI vendor (strategy, privileged notes); client terms of engagement or a regulator that forbid AI processing by third parties; control over the model, its behaviour and its cost; working with no connection. I haven't verified what Microsoft currently commits to for Copilot's handling of data.
- Taxonomy gap: no station teaches "decide what you trust": which channels you accept (365, your network, the tailnet) and which work stays on machines you own. The nearest stations (`download`, `outputs`, `browseragent`) are about untrusted input, not about choosing trusted channels. Candidate: a station early on Priya's path, possibly taught in chapter 0's "Why?" questions.

Decided (Julian, 2026-11-05): **the book is for people who choose not to use Copilot.** It doesn't argue them out of it or into it; it starts from their choice.

Consequences, to settle:
- Chapter 0 has to show Priya making that choice, with a reason a reader recognises, or the reader can't place themselves. The story doesn't say yet why she doesn't use Copilot.
- Inbox sorting comes back into question: someone who keeps mail on 365 but won't use Copilot has nobody sorting it for them. That's exactly a gap local AI fills, but it brings `d_triage`'s eleven stations (injection, read-only access, retention and the rest), so it can't be a chapter 1 job beyond a measured row on invented emails.
- The book says who it's for early (chapter 0 or the series introduction), so a Copilot user knows it isn't aimed at them.
- Mac users (Julian: "basically every Mac user") are a large part of this audience, but not because Copilot is missing on a Mac: as far as I know Microsoft 365 Copilot runs in Office for Mac too (not verified for this book). They mostly don't use it because they're not on Microsoft's stack. Their nearest alternative is Apple Intelligence, which runs partly on the Mac itself and partly on Apple's servers (Private Cloud Compute). So for a Mac reader the question is "why not Apple Intelligence?", and the book's answer has to be specific: model choice and size, and proof of where the words go (chapter 5), against "some of it goes to Apple's servers". Apple's current claims need checking before any comparison is printed.
- Julian: there's a difference between Office users and Office users who'll pay the AI premium. So the audience includes everyone on Office who doesn't take the Copilot add-on, which makes cost a candidate for Priya's reason. Caution: Microsoft's bundling and prices change (some plans have already folded Copilot features in, as far as I know; not verified for this book). A reason that is only price can disappear with one announcement and dates the book. Cost paired with control (her model, her rules, proof of where it goes) survives a price change.

Decided (Julian, 2026-11-05): **Priya's reason, and the book's, is control.** Local AI is not cost-effective now for most people: a Copilot licence is cheaper, faster and better. The book says so plainly and never claims savings, speed or quality over hosted AI. Checked 2026-11-05: the curriculum and book text make no cost-saving claim. Chapter 0 already frames it as control ("local AI is a different deal from a subscription. Nobody else is running it... how much of the running is yours"), and the author's Book 2 promise to "come clean about what that cost" fits.

Decided (Julian, 2026-11-05): inbox sorting is out of the job table. Research on which office jobs people find local AI compelling for: `20261105-office-use-cases-research.md`.

## 11. The legal tool and redact-then-hosted (Julian, 2026-11-05)

Decided:
1. **The legal tool is "compare two versions of a contract".** Built by a coding agent (`codingagent`), hinted in chapter 1's job table, built in later chapters. No destination exists for it yet; candidate: a new destination on Priya's path between `d_legal` and `d_bundle`.
2. **Redact-then-hosted is a job.** A local model removes names and identifying details, a hosted model works on the clean copy, and the local side puts the details back. Hosted AI is better (section 10), so the book teaches using it safely instead of avoiding it.

Reach:
- `minimise` ("Minimise and redact before prompting", zone 1, needs `extract`) already exists; its proof ("A test record with names and numbers reaches the model as placeholders only") fits as is. What's new is pointing it at a hosted model and putting it on Priya's path.
- **It conflicts with chapter 5's proof.** `prove` and `d_legal` pass only when the chat app talks to loopback, private or tailnet addresses. A redact-then-hosted job talks to a public address by design, so the same check fails it. It needs its own proof: what left the machine contained only placeholders. That is much harder to show than "where the bytes went", and the `connections` probe can't see contents. Candidate: the learner's own pipeline logs exactly what it sent, and the check reads that log for any name from the original. This is a design question for the author and a new probe.
- The thesis line in section 10 ("Priya drafts with an AI that is local and trusted") widens to: local where it must be, hosted where it's safe, and she decides which.
- Redaction is best effort (research note): "You're accountable" applies to what the redactor missed.

## 12. Is "Prove it stays local" worth its place? (open)

Julian, 2026-11-05: "prove it's local" is "a bit off anyway because it's not particularly useful, easy or relevant."

Reach, if it goes or shrinks: `prove` is one of V1's four stations (CLAUDE.md "What V1 is", `scope.json`, `lessons/prove.json`); it is `d_legal`'s proof and chapter 5; the `connections` and `tailnet` probes and build step 3's done-criteria exist for it; section 11 and the Apple Intelligence comparison (section 10) lean on it as the book's answer to "trust us".

My challenge, for the author's decision: the *idea* (you can see where your words go, so control is checkable, not a claim) is the book's main difference from Copilot and Apple Intelligence. The *form* (reading a list of network connections) may be what's off: fiddly, technical, and a pass looks like nothing happened. Options: (a) keep it as a chapter; (b) shrink it to a one-press coach check inside Local chat, with the chapter cut; (c) drop it and let control rest on model choice and accountability alone.

Julian, 2026-11-05: "prove it doesn't leave" would mean teaching network security, application permissions and sandboxing: fine, but very error-prone and involved. Source: his article "A local AI model tried to contact..." (https://ailocal.substack.com/p/a-local-ai-model-tried-to-contact): running locally settles where the weights live, not what an agent does with its tools; the Rule of Two (untrusted content, sensitive data, acting outside: at most two); OS sandbox, narrow holes, allow-listed destinations.

What that shows about the current station: **the name overclaims, the same pattern as "fits".** The `connections` check sees one process (the chat app) and where it connects. It can't see whether the model server on the other machine calls out, or what any tool does. "Prove it stays local" promises a guarantee the check can't give, and a learner who passes it may feel safer than they are.

Proposed, for the author: keep the check, narrow the claim. Name it for what it shows: "Where do your words go?", for a chat with no tools. A model with no tools can't open a connection; the chat app and the server can, and the check covers the chat app. Say plainly what it doesn't cover, and point to the agent-security stations that follow the article (`sandbox`, `egress`, `readonly`, `scopes`, `outputs`), where the Rule of Two is taught.

Decided (Julian, 2026-11-05): **the station is renamed "Is my chat app talking to anyone else?"** It keeps its check (the chat app's connections, loopback, private or tailnet only, tailnet machines owned) and claims only that. The station id `prove` stays. Places that change: `stations.json` (name, headNote, proof), `lessons/prove.json`, `scope.json`, chapter 0's pointer to chapter 5, chapter 5's title, CLAUDE.md and `docs/design.md` where they name the station, `d_legal`'s proof wording, and coach text that names it. "Protecting my data from escaping" was considered and kept back as a possible title for the later agent-security part (not decided).
