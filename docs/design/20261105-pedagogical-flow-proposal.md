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
- Memory holds the model file *plus* its working space while it answers: what you're talking about, and the notes it keeps as it goes. Plus your computer's own needs. The three-quarters rule of thumb stays, now explained as "leave a quarter for the working space and the rest of your machine". Context and the cache are named in one sentence each, with pointers to chapter 2 and Book 2.
- What does the work decides speed: at reading pace, or a word every few seconds. One sentence, a pointer to Book 2.
- Goes: "A 20 GB model on a 16 GB laptop doesn't run slowly. It doesn't run." (some apps will have a go, as the chapter's own pedantic note admits) and "the sticky note really is the whole story". Stays: the room and the warehouse, which is still true and still the clearest image in the chapter.

**Part 2: what your machine can do, by job.** A table of four jobs, each with a small, medium and large setup, and for each: memory in use (file plus working space), speed on two reference machines, and a plain quality note.

| Job | Small | Medium | Large |
|---|---|---|---|
| Sort and tag short texts (classification) | to measure | to measure | to measure |
| Summarise a page | to measure | to measure | to measure |
| Draft a letter like Priya's | to measure | to measure | to measure |
| A coding agent | to measure | to measure | to measure |

Every cell is measured, and the table says on which machines (this 16 GB Mac and an RTX 4090 Linux box, as a start). No guessed numbers in the book.

**The test becomes:** "Which of these jobs can your machine do comfortably?" One row per job, marked in code against the learner's own two facts, as the fits card already is. Nobody is told "no chance"; a job that won't run comfortably gets "not on this machine, and here's what it would take".

**Have you got it?** "Say your two facts without looking, and name one job your machine does comfortably and one it doesn't."

### Chapter 2: What's in the file

**Change: absorbs quality and accountability.** It already "opens the file and explains the numbers on its label". Those numbers are the ones chapter 1 now points at:
- **Size (parameters):** bigger is usually better at the job, and needs more room.
- **Quantisation:** the dial between fit and quality (the existing `quant` station: "Fit versus quality is a dial you can measure").
- **Context length:** how much working space it can use, which is the memory chapter 1 left a quarter for.

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

Two term changes in `map.json`: "rule of thumb (three quarters)" gets the working-space reason in its gloss, and a new term, "working space", defined in chapter 1 with a pointer to "context window" in chapter 2.

## 5. What it means for the coach (V1)

- **Lesson `machine`:**
  - step 1 asks for both facts (memory, and what does the work);
  - step 2 checks the memory number as now, and reads the chip with a new probe (`sysctl -n machdep.cpu.brand_string` and the GPU on a Mac; `lspci` or `nvidia-smi` on Linux);
  - step 3 becomes the job table test on the existing choice card.
- **Figures:**
  - will-it-fit draws the working space beside the file;
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
