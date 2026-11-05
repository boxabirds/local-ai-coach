# Draft: Book 1, chapter 1, "What can my computer do?"

Status: draft for Julian's edit, 2026-11-05. Implements `20261105-pedagogical-flow-proposal.md` (sections 3, 7, 8, 9, 13). Nothing in `curriculum/` or `panel/` has changed; once this text is agreed it replaces the page in `curriculum/chapters/know-your-machine.md` and `panel/final-narrative.md`, and the front-matter, lesson, map terms and figures change with it (list at the end).

Numbers in the table are measured (`letter-run/20261105-letter-run.md`); cells marked "to measure" are not, and the page must not print until they are or the rows go.

---

## Chapter 1: What can my computer do?

### What this chapter covers

I'm going to answer the question you'd ask if you were Priya on the day she set up her box: what local AI can I actually do with my computer?

The answer comes from two facts about your machine, which you'll find in its settings, and a table of real jobs, which I ran so you don't have to.

Why I'm making you do this: in chapter 0 the app looked at Priya's box and chose her model for her, and it chose well.

One day it'll choose badly, or you'll want something it didn't offer, and these two facts are how you check.

You'll need a computer whose settings you can open (any Mac, Windows or Linux machine) and a sticky note. Nothing to download, no account, nothing installed.

### Fact one: how much memory

How much **memory** your computer has, in gigabytes (the line in your settings that says Memory, or RAM; same thing, and I'll explain what it actually is in a moment).

On a Mac: Apple menu, About This Mac, the line that says Memory.

On Windows: Settings, System, About, Installed RAM. If it shows two numbers ("16.0 GB (15.7 GB usable)"), write the first one.

On Linux you already know, and I know you know.

(Those are the click paths as I write this. If your machine has moved them, the one-line command for each operating system is on the series' companion page, awesome-local-ai on GitHub, because scripts change and books don't.)

🧙‍♂️ Write it on a sticky note and put it on the lid. I mean it.

Mine says 128… which is really showing off, and I'll come clean about what that cost in Book 2.

Yours probably says 16 or 32.

#### Memory is the room

Memory is the space your computer works in. Whatever it's doing right now has to be in there. The drive is where things are kept; memory is where they're used.

A model has to be in memory before it can say a word. All of it, WHOLE, like a choir that has to be in the building before the concert starts.

"But I've got a 2 TB drive!" Lovely. The drive's the warehouse. The choir doesn't sing in the warehouse. 😆

<!-- figure: room-and-warehouse -->

And the choir isn't the only thing in the room.

Your computer needs some of it for being a computer: the system, the browser, the forty tabs you're not admitting to.

The model needs more than its file, too. The **model file** is the one file you download (the whole of the clever part in one lump, closer to a film file than to an app). Running it also takes **working space**: the program that runs it, the conversation so far, and a few helpers I'll name in Book 2.

How much? I measured it, and it moves. On my Linux box a 5 GB file used 7.5 GB once it was running, and a half-gigabyte file used 2.2 GB, four times its size. On my Mac, with a newer version of the same program, the same two used 5.2 GB and 0.8 GB. So the file size on the download page is where you start, never the whole answer.

### Fact two: graphics card memory

Some computers have a second, separate kind of memory on a **graphics card** (a board inside the computer built for drawing the screen, which happens to be very good at the sums a model does). It has its own memory, much smaller than the main one, and much faster.

So you've got two kinds: normal memory, which every computer has, and **graphics card memory**, which only some do.

To find it on Windows: Task Manager, Performance, GPU, the line that says Dedicated GPU memory. On Linux with an Nvidia card, `nvidia-smi` prints it.

On a Mac, or an ordinary office laptop, the answer is none, and that's fine. Write "none". (A Mac's built-in graphics uses normal memory directly, which is why a Mac does better than its sticker suggests. More in Book 2.)

Your sticky note now says two things. Mine says "128, none".

#### The workbench

If normal memory is the room, graphics card memory is a workbench in the corner. Small, and everything on it goes a lot faster.

A model that fits on the workbench is quick.

A model that's too big for it doesn't fail. It spills off the bench into the room, and runs at the room's pace, which is a lot slower.

If you have no workbench, everything runs at the room's pace. That's Priya's box, and it actually wrote her letter at about the speed she reads.

### Will it fit?

Here's my rule of thumb (mine, not a benchmark), and it's deliberately wide, so the answer is almost always obvious:

- the model file is under half your memory: it fits;
- the file is bigger than your memory: it doesn't;
- anywhere in between: it depends.

On 16 GB: a 2 GB file fits, a 5 GB file fits, a 10 GB file depends, a 20 GB file doesn't.

"Depends" isn't a fail. It's where you start tuning: a smaller version of the same model, a shorter conversation, fewer tabs. Chapter 2 is where we turn the dials.

Got a workbench? Do it twice. Against the workbench, the rule tells you whether it'll be quick. Against the workbench plus the room, whether it'll run at all.

(I haven't measured this rule on an 8 GB machine, where your computer's own share of the room is bigger. If yours says 8, treat "fits" as "depends" until I have.)

<!-- figure: will-it-fit -->

### What can it do, then?

Fits is only half of it. What you really want to know is what it's good for.

So we're going to do it with Priya's own jobs. I ran them on three sizes of the same model, on real machines, and wrote down what happened.

| Draft Priya's letter | Small (0.6B) | Medium (8B) | Large (32B) | Hosted, for comparison |
|---|---|---|---|---|
| File | 0.5 GB | 5.2 GB | 20 GB | not on your machine |
| Memory in use | 2.2 GB | 7.5 GB | 23.1 GB | none |
| With a 24 GB workbench | under 1 s | 4 to 5 s | 16 to 18 s | 10 to 12 s |
| No workbench (desktop processor) | about 5 s | about 1 min | about 4.5 min | 10 to 12 s |
| 16 GB Mac, built-in graphics | 8 to 9 s | 1.5 to 2 min | doesn't fit | 10 to 12 s |
| What you get | fluent, and on the wrong side | a decent trainee | the best local draft, and it invents law | better again, and still not safe unread |

| Summarise a document | to measure |
|---|---|
| Compare two versions of a contract (a tool a coding agent builds) | to measure |

(Measured in November 2026 with Qwen 3 on a Linux desktop with an RTX 4090, graphics card on and then off, on my 16 GB MacBook Air while it was busy doing other things, and with the hosted model this coach uses. The office laptop row is on the companion page once I've measured it.)

The small one wrote the letter from the landlord to the tenant. Every fact was right. It just didn't understand whose letter it was. 😱

The large one wrote a truly good local letter, then told the landlord he had ten days by law, which isn't in the papers.

The hosted one was best of all, and one of its three drafts still relied on the wrong Act, which its own notes then pointed out.

Whatever you use, you read it before it goes out with your name on it. Chapter 2 has a lot more to say about that, and about Priya's worst Thursday.

### Have you got it?

Here's what this station unlocks: looking at any model's download page and knowing, from your sticky note, whether it'll fit, and what kind of job it's worth trying.

Here's how you know you've got it. Say your two facts without looking. Then, for a 2 GB, a 5 GB and a 20 GB file, say fits, depends or doesn't. On 16 GB with no graphics card: fits, fits, doesn't. On 32: fits, fits, depends. Then name one of Priya's jobs your computer does comfortably, and one it doesn't.

Here's what it looks like when it goes wrong. A download sits at 100%, then the app says nothing, or says "loading"… forever, or quietly picks a different model.

The cause is almost always room: the model is bigger than memory.

The fix is the sticky note. Pick the smaller version; most models come in several sizes.

The other symptom is a model that runs but takes a minute to say hello.

Nothing's broken. It's really just spilled off the workbench, or there isn't one. You'll decide in Book 2 whether to live with it, shrink the model, or buy a bigger bench.

Why is this station amber and not grey? The app found Priya's facts for her, and it'll find yours. But the day it picks wrong, you need to know what it was measuring, or you'll blame the model, reinstall three times, and give up.

"Rubbish model," says everyone who skipped this chapter. I've said it myself. 😅 Nope. Small room.

### Your turn

Take your sticky note to the model table at the end of this chapter. It lists every model the series uses, with its file size and which chapter first uses it. (The live version, kept current, is on awesome-local-ai on GitHub.)

- Mark the ones that fit. Those are yours today.
- Mark the ones that depend. Those are yours after chapter 2.
- Note the first one that doesn't fit. That's the price tag on your next machine, and you know exactly what you'd be paying for: room.

If you're on 16 GB with no graphics card, most of this series is open to you. Write that down too, because the forums will tell you otherwise, LOUDLY.

### Where that leaves you

Your computer has a room, and maybe a workbench, and a model has to fit in them, with space to work, before it can speak.

You've got two facts on a sticky note, a rule of thumb that's right almost every time, and a table that says what each size of model is actually good for.

That's truly more hardware knowledge than most of the people arguing on the forums have, and it cost you a sticky note.

Next chapter: what's in the model file, what the numbers on its label do to your room and your results, and why Priya now reads every word before she signs.

---

## What else changes when this is agreed

- **Front-matter** (`curriculum/chapters/know-your-machine.md`, `panel/chapter-1.frontmatter.yaml`): title; `whatIsNew` (two facts and the job table, not one number); `timeMinutes` removed with the time promises; `testedOn` gets gruntus, the Katana and the office laptop as they're measured; terms: "memory" (gloss keeps the room), "model file", "working space", "graphics card memory", "rule of thumb (half)" replacing "three quarters"; previews: "two rooms" is now taught here as the workbench, so it leaves the previews; analogies: the workbench added; sources: the letter-run measurements, labelled.
- **`stations.json` `machine`:** name "What can my computer do?", headNote and proof as in the proposal, section 4.
- **`lessons/machine.json`:** step 1 asks for both facts; step 2 checks memory and reads graphics card memory with a new probe; step 3's choice card gets a third option, "Depends", graded on the half and whole edges; hint and recap rewritten.
- **`map.json`:** the terms above.
- **Figures:** `will-it-fit` draws the three bands and the workbench; `room-and-warehouse` stays; `one-file` drops "runs wherever the room is big enough".
- **Coach code:** `fits_room` and `grade_choices` grade three bands; the number card's label stops saying "Your number".
- **Chapter 0:** "her Wednesday check" now points to "Is my chat app talking to anyone else?"; one clause on the shelf ("picked for the job and the box").

## Choices I made in the draft that are yours to change

- "Workbench" for graphics card memory, beside your "room" and "warehouse".
- "Working space" for everything the model needs beyond its file, as one phrase, with the parts named but not taught.
- Mac and Ryzen AI Max are "none" for graphics card memory, with one parenthesis on why a Mac does better than its sticker. The unified-memory story is left to Book 2.
- The job table shows the letter row now and marks the other two "to measure"; the page can't print until they're measured or cut.
- "Priya's worst Thursday" as the hook for chapter 2's accountability scene.
