# Proposal: what "fits" should teach (Know your machine)

Status: proposed 2026-11-05, from Julian's feedback on the fits test. Nothing in the curriculum has changed yet. The decisions in section 5 are the author's.

## 1. The feedback

- The fits lesson is naive. A learner who stops there thinks the model file is the only thing using memory. It leaves out context and the KV cache, other caches, quantisation, system overhead, and that a machine may not have the power to run a model at a usable speed (CPU against GPU). It also leaves out quality: smaller models are worse.
- "20 GB doesn't fit in 16 GB" is both wrong and condescending.
- The middle ground: teach that local models take a lot of memory *and* compute, then show real setups by use case, from basic summarising and classifying up to coding agents. Without a use case the numbers mean nothing.
- For Priya's letter: low, medium and high quality results and their speeds, with simulated examples of low-quality output. Whatever the quality, the person stays accountable and has to review it.

## 2. Where it lands in the curriculum

| Place | What it says now | Impact |
|---|---|---|
| `stations.json` `machine` | headNote "RAM vs GPU memory, and why model size is the gate"; proof "You can state your RAM, GPU memory and disk free" | The station already promises GPU memory and disk. Chapter 1 teaches one number and says to ignore the GPU. **The lesson is narrower than its own station.** Either the station shrinks to match or the lesson grows. |
| `stations.json` `quant`, `context`, `kvcache`, `prefill`, `compare` | Each is its own later station: "Fit versus quality is a dial you can measure"; "The cache is memory and it is data"; "Reading is bandwidth-bound and fast; writing is one token at a time" | Your list of omissions is the taxonomy's own list of later stations. Chapter 1 should **point to them**, not teach them: name them as what "elbow room" is made of. |
| `stations.json` `d_legal` | headNote "Only the proof that it stays local"; needs prove, write, encrypt | Accountability for the draft is not on Priya's path at all. **Taxonomy gap:** no station says "you review and you answer for it". `review` exists but is about data pipelines (sampling auto-accepted extractions). |
| `stations.json` (new?) | Nothing maps use cases to model size, quality and speed | The use-case ladder has no home. Candidates: inside `machine` (chapter 1 grows), inside `compare`, or a new station between `machine` and `localchat`. |
| `chapters/know-your-machine.md` (book text) | "A 20 GB model on a 16 GB laptop doesn't run slowly. It doesn't run."; "On a 16 GB machine that's fits, fits, absolutely no chance."; the three-quarters rule of thumb; "A complication you can ignore for now" (two rooms) | The two flat claims are what you called wrong and condescending. The book's own pedantic note already admits some apps "have a go". Book text is the author's to change. |
| `lessons/machine.json` | machine.3 is the fits test (2, 5, 20 GB); rubric and onFail "The choir doesn't sing in the warehouse" | The test changes if the lesson does (section 4). |
| `map.json` term "rule of thumb (three quarters)" | gloss: over three quarters is a squeeze | Stays a useful heuristic, but it should say what the quarter is for (context, cache, the system), not imply the file is everything. |
| Figures `will-it-fit`, `room-and-warehouse`, `one-file` | Draw the file alone in the room | Would need a second block for the working space (context and cache) and the system. One-file's "runs wherever the room is big enough" overclaims for the same reason. |
| Coach code: the fits test's Not yet line (mine, not the book's) | "Have another look at A 20 GB file. Memory is the room: a model file has to fit in it whole, and the drive doesn't count." | Same tone problem in my own words. Fix whatever you decide. |
| Story `legal-letter.md` (chapter 0) | "It's… fine. It's the draft a decent trainee would hand her. Dates right. Tone a bit keen." … "She spends the next twenty making it hers." | The story already models medium quality and the review. That is the hook for teaching accountability; the chapter text just never names it as a skill. |

## 3. Challenge

- **The one-number simplicity was the chapter's design, and it works for the five-minute promise.** Your list (KV cache, quants, context, GPU) is four or five stations of material. Pulling it into chapter 1 recreates the forum overwhelm the chapter set out to beat. The fix is not more material in chapter 1. It is to stop the chapter **claiming** the one number is the whole story ("the sticky note really is the whole story").
- **"Fits" is necessary, not sufficient.** That's the honest middle ground between "duh" and a VRAM lecture. Fitting decides whether a model *runs*. How *fast* (compute) and how *good* (size and quantisation) are two more questions. Each gets one sentence and a pointer in chapter 1.
- **A use-case ladder is only as good as its numbers.** Without measurements it's guesswork in a table, and the book is about proof. I can measure them myself: memory in use, speed, and the same prompts at each size. I have this Mac (16 GB, unified memory) and gruntus (RTX 4090, 24 GB, Ollama, small to mid models already pulled). Two machines is not "your machine", so the table would be labelled with the machines it was measured on.
- **Accountability is a bigger idea than chapter 1** and belongs on Priya's path: as a step in `d_legal`, or a red station of its own. It is the kind of thing that "fails quietly": an unreviewed confident draft.

## 4. A shape for the middle ground (for discussion)

Chapter 1, two parts, as you suggested:

1. **Local models use a lot of memory and compute.** Memory holds the model file *plus* working space: what you're talking about (the context) and the cache that grows with it, plus your computer's own needs. The three-quarters rule leaves room for that working space, and this is where to say so in one sentence, with a pointer to chapters 2 to 4. Compute decides speed: a graphics card or Apple silicon answers at reading pace, a plain CPU much slower. One sentence plus a pointer to `prefill`.
2. **What your number gets you, by job.** A table of real setups by use case, measured, with memory in use, rough speed and a quality note:
   - sorting and tagging short texts (classification);
   - summarising a page;
   - drafting a letter like Priya's;
   - a coding agent.

   The test becomes "which of these jobs can your machine do comfortably?", marked against the learner's number. That's more useful than three file sizes, and nobody is told "no chance".

Priya, in the coach (and the book if you want it): the same letter at three model sizes, **simulated and labelled as simulated**, with speeds measured or marked as untested. Then the line that matters: whichever one you use, you read it, you fix it, and you sign it.

Example of the simulated low-quality version (illustration only; not model output):

> Dear Landlord, I am writing about the deposit. The deposit should be returned because it is the law. You were MORE than REASONABLE but the tenant disagrees. Please return the deposit within 30 days or legal action will be taken under the Deposit Protection Act 1998.

What it shows a reader, without a lecture: it repeats the landlord's capitals back at him, misses the point, invents a statute and a deadline, and says nothing about the actual dispute. The medium version is the "decent trainee" draft the story already describes. The high version is better, and still has to be checked.

## 5. Decisions (yours)

1. **Book or coach?** Does chapter 1's book text change (the two flat claims, "the whole story"), or only the coach's lesson?
2. **Where does the use-case ladder live?** Inside `machine` (chapter 1 grows a second part), in `compare`, or a new station between `machine` and `localchat`?
3. **Accountability:** a step in `d_legal`, or a new red station on Priya's path?
4. **Numbers:** may I measure the ladder on this Mac and gruntus (it means running Ollama on gruntus again, as I did for step 3), and label the table with those machines?
5. **The machine station's proof** ("RAM, GPU memory and disk free"): keep it and teach the GPU line in chapter 1, or narrow the proof to match the one-number chapter?

Until then the fits test stays as built, except my own Not yet wording, changed 2026-11-05 to: "Have another look at <file>. A model needs room in memory for the whole file and for its working space while it answers."
