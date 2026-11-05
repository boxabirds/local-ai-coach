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

**Change: the main one.** Two parts, as you asked, inside the same five-minute promise.

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
| new `ownit` (name to choose) | none | "You answer for what it writes", **red** (it fails quietly: a confident draft nobody checked). Taught in chapter 2. Added to `d_legal`'s needs |
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
- **Accountability is taught, through Priya getting it wrong.** Let Priya burn her reputation, not the learner's. Proposed scene for chapter 2 (draft for Julian): on a rushed day Priya sends a letter from the big model with only a skim. It reads well. The landlord's reply is confused: his deposit is with the DPS, so what is "the TDS", and which law gives him ten days from the end of the tenancy? Her client forwards it asking the same questions. Every one of those errors is real, from the 32B letters in `letter-run/20261105-letter-run.md`. She spends the afternoon on an apology letter and a phone call she didn't need. The chapter then names the skill: read it, check every fact against the papers, and sign it only when it's yours. The station's name is still to choose.
