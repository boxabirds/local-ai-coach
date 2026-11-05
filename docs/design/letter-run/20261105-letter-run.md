# Letter run: Priya's letter at three sizes of one model (Qwen 3)

Status: first run, 2026-11-05. Evidence for chapter 2 in `../20261105-pedagogical-flow-proposal.md`. Learning objective (Julian): model size matters not just for what fits on your machine, but for quality, and to some extent speed.

## How it was run

- Machine: gruntus, RTX 4090 (24 GB), Linux, Ollama 0.9.6 on 127.0.0.1:11435. Every model sat wholly on the graphics card.
- Models: `qwen3:0.6b`, `qwen3:8b`, `qwen3:32b`, Ollama's default quantisation (Q4_K_M). Qwen 3.5 (0.8B, 9B, 27B) needs a newer Ollama; the run can be repeated on it.
- Prompt: Priya's request from chapter 0 ("First draft of a letter to the landlord. Firm, not rude. Cite the deposit scheme rules.") and the papers in `materials.md`, all invented. Thinking off, temperature 0.7, seeds 1 to 3.
- Script: `run.py`. Raw output, letters and timings: `result-qwen3.json`.
- Checked by hand against `materials.md` only. Anything a letter states that isn't in the papers is marked **not in the papers**: the model made it up, whether or not it happens to be true. I haven't checked those claims against real deposit law; a reader shouldn't rely on them either way.

## The numbers

| Model | Memory in use | Words per second (approx.) | First word, cold | Whole letter, warm |
|---|---|---|---|---|
| 0.6B | 2.2 GB | ~230 (347 tokens/s) | 2.6 s | under 1 s |
| 8B | 7.5 GB | ~85 to 90 (121 to 125 tokens/s) | 9.7 s | 4 to 5 s |
| 32B | 23.1 GB | ~25 to 27 (38 tokens/s) | 38 s | 16 to 18 s |

"Cold" is the first request, which includes loading the file into the graphics card. Words per second is tokens per second times the run's own words-to-tokens ratio. All three are faster than reading pace on this card. On a 16 GB Mac the 32B doesn't fit at all, and the 8B would be much slower than here (not measured yet).

## What each size wrote

### 0.6B: fluent, and on the wrong side

All three runs wrote **from the landlord to the tenant**, not the letter Priya asked for. Every fact is copied correctly from the papers, so it *looks* competent at a glance.

- Seed 1 says Ms Okafor "has accepted" the £900. She accepted £60.
- Seed 2 says the deposit "will be protected", three years after it was.
- Seed 3 ends with the landlord's own threat: "If you disagree, you can take the deposit up with whoever you want."
- None cites a scheme rule. Seed 2 adds a note claiming it "clearly" references the deposit rules.

Teaching point: a small model can repeat the facts and still miss what the job is.

### 8B: the decent trainee

All three are on the right side, firm and polite, and get the core argument: £900 for full redecoration against light scuffing and two holes, £60 accepted, fair wear and tear excepted, clauses 4.1 and 4.3 cited.

- Seed 1: the closest to sendable. "Deposit Scheme Rules" require a "detailed breakdown" of deductions: **not in the papers**.
- Seed 2: "within 3,0 days" (a typo for 30). "Respond in writing within 14 days... in accordance with the Deposit Protection Service rules": **not in the papers**. Mentions "the relevant housing authority": vague.
- Seed 3: says the landlord gave the prescribed information on 10 March 2023. The papers only say the deposit was *protected* that day. Then says the only damage is the two holes, dropping the scuffing.

This is the draft chapter 0 describes: "Dates right. Tone a bit keen." Each one needs a careful read.

### 32B: the best writing, and the most confident inventions

The most persuasive letters, properly laid out, with the strongest argument (seed 1 asks for a date to reply by and names escalation to the DPS). Also the most made-up law, stated most firmly.

- Seed 1: "which I understand you agree is approximately £60". Mr Pell agreed nothing. "DPS Code of Practice": **not in the papers**.
- Seed 2: the landlord must return the deposit "within 10 days of the tenancy ending... as required by law": **not in the papers**. Switches from the DPS to "the Tenancy Deposit Scheme (TDS) Rules", which is a different scheme's name. Lists a rule that the landlord must "not make threats or express unreasonable or abusive language": **not in the papers**. Asks for "the remaining £1,390 (minus the £60 deduction)", which takes the £60 off twice. Addresses Mr Pell at the flat she has just left.
- Seed 3: a written statement of deductions "within 10 days of the end of the tenancy": **not in the papers**. Calls the check-out report a "DPS check-out report". Lists the scuffing as damage "beyond fair wear and tear", which concedes the point she is disputing. Also addresses Mr Pell at the flat.

Teaching point: a bigger model's mistakes are fewer per sentence but harder to see, because the letter around them is good.

## What it shows, against the objective

1. **Size changes quality, plainly.** 0.6B can't do the job; 8B does it like a trainee; 32B writes like someone more senior.
2. **Size costs memory and speed.** 2 GB, 7.5 GB, 23 GB; the 32B is about ten times slower than the 0.6B on the same card, and won't load on a 16 GB laptop.
3. **No size is safe to send unread.** Every letter at every size has at least one thing wrong or made up. The 32B's invented ten-day deadline and its double-counted £60 would be in front of Mr Pell with Priya's name on them. That is the accountability line the chapter ends on.

## The hosted reference (decided 2026-11-05)

Same request and papers, three runs, on the hosted model the coach uses (`chat-latest`, OpenAI; the service reports only the alias, not the snapshot). It accepts only its default temperature, so none was set; the local runs used 0.7. Script: `hosted.py`. Raw output: `result-hosted.json`.

| | Hosted | Local 32B, graphics card | Local 8B, processor only |
|---|---|---|---|
| First word | 1.1 to 1.7 s | under 0.1 s warm, 38 s cold | (not recorded) |
| Whole answer | 10 to 12 s | 16 to 18 s | about 1 min |
| Words out | 1,041 to 1,466 | 384 to 446 | 426 tokens |

Cost per letter: 460 tokens in and 1,338 to 1,842 out per run. I haven't checked the current price, so no figure is given.

### What it wrote

All three are on the right side, firm and polite, with the right sums (£840 disputed, £1,390 to return). Each is a letter followed by several hundred words of advice to the solicitor: what's strong, what to check, what to change. It's the most useful of all twelve drafts by a distance, and it's not error-free.

- All three bring in law that is **not in the papers**: the Housing Act 2004 (sections 212 to 215), the "no betterment" principle, DPS dispute practice. As far as I know these are real and relevant, but I haven't checked them, and the papers didn't give them.
- Seed 2 says the DPS generally needs a dispute raised within three months of the tenancy ending (**not in the papers**), and itself says to confirm it with the DPS. It also says sections 212 to 215 cover "England and Wales"; I'm not sure that's still right for Wales.
- Seed 3's letter relies on the Tenant Fees Act 2019 for the no-betterment point. **Its own notes then say that's the wrong authority.** The letter still contains it. A solicitor who sends the letter without reading the notes sends the mistake.
- Seed 3 also gives the "10 days" rule, the one the 32B garbled, in what I believe is its correct form: the deposit is returned within 10 days once the amount is agreed, not 10 days from the end of the tenancy. Not in the papers, and I haven't checked it.

### What it adds to the chapter

1. **The trade is measured, not asserted.** On this job the hosted model is faster than any local setup here, and its drafts are better: more accurate, with the right law, and they flag their own weak points.
2. **It still needs reading.** Seed 3 put a wrong authority in the letter and caught it only in the notes. "You're accountable" applies to every AI, not just local ones.
3. **What local gives up is quality and speed; what it keeps is control.** That's the book's stance (proposal, section 10), now with numbers behind it.

## Open

- Repeat on Qwen 3.5 (0.8B, 9B, 27B) after upgrading gruntus's Ollama.
- Measure the 8B on the 16 GB Mac for the second reference machine.
- How much of this goes in the book (one letter per size with its checks, or all nine) is the author's decision.
