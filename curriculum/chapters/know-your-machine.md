---
# Front-matter for Book 1, chapter 1: What can my computer do?
# Read by the build and the checker. Never rendered on the page.
# Fields marked "author" need the author's hands or hardware before publication.

book: 1
chapter: 1
title: What can my computer do?
slug: know-your-machine

whatIsNew: >
  Starts from the reader's goal (what local AI can I do with my computer?),
  not from specs. Two facts from the reader's own settings (memory, and
  graphics card memory if any), a rule of thumb wide enough that "fits" and
  "doesn't" are almost certain, and Priya's own letter written by three sizes
  of model and a hosted one, measured in November 2026, so size means quality
  and speed, not only room.

testedOn:                     # author: fill before publication
  status: not yet tested      # the chapter's claims are arithmetic, not stopwatch; see sources
  month: 2026-11
  machines:
    - name: author Mac        # the "128" on the author's sticky note
      memory_gb: 128
      os: macOS
      checked: []             # click path "About This Mac > Memory" to be confirmed on this version
    - name: 16 GB laptop, no GPU
      memory_gb: 16
      os: ""                  # author: Windows or Linux, whichever is to hand
      checked: []             # Windows "Installed RAM (usable)" wording to be confirmed
  models:                     # the letter run, docs/design/letter-run/20261105-letter-run.md
    - qwen3:0.6b, qwen3:8b, qwen3:32b (Q4_K_M), Ollama 0.9.6, Linux, RTX 4090, graphics card on and off
    - qwen3:0.6b, qwen3:8b, Ollama 0.40.14, MacBook Air M2 16 GB (busy, not a quiet machine)
    - chat-latest (OpenAI), hosted reference

stations:
  - id: machine
    name: What can my computer do?
    colour: amber             # inYourHead: know what it does
    zone: 1
    needs: []
    proof: >
      Say your two facts without looking; then for a 2 GB, a 5 GB and a 20 GB
      file say fits, depends or doesn't. On 16 GB with no graphics card:
      fits, fits, doesn't. On 32: fits, fits, depends. Then name one of
      Priya's jobs your computer does comfortably and one it doesn't.
    whyThisColour: >
      The app finds the number for the reader and usually picks well, so
      grey is tempting. The day it picks wrong the reader must know what it
      was measuring or they blame the model and give up. Not red: nothing
      fails silently or expensively; the symptom is loud.
    whenItGoesWrong:
      - symptom: 'Download reaches 100%, then the app says nothing, or "loading" forever, or quietly picks a different model'
        cause: The model file is bigger than memory
        fix: Compare file size with the sticky note; pick the smaller size
      - symptom: Model fits and runs but takes a minute to say hello
        cause: It has spilled off the graphics card memory, or there isn't any
        fix: Nothing broken; Book 2 covers living with it, shrinking the model, or a bigger graphics card

beforeYouStart:               # resources, not knowledge
  software: []
  downloads: []
  accounts: []
  physical:
    - A computer whose settings you can open (Mac, Windows or Linux)
    - A sticky note and a pen
  diskFreeGb: 0
  memoryFreeGb: 0
  costsMoney: false

reEntry:                      # terms defined earlier, recapped on first use here
  - term: model
    definedIn: Book 1, chapter 0
    recap: A model is the file that does the thinking. One file.
  - term: station
    definedIn: Book 1, chapter 0
    recap: A skill on the map. Each has a colour.
  - term: colours (grey, amber, red)
    definedIn: Book 1, chapter 0
    recap: "Grey, press go. Amber, know what it does but not how to fix it. Red, understand it well enough to tell when it is wrong."

terms:                        # map.json entries this chapter defines
  - term: memory
    gloss: "The space your computer works in; whatever it is doing right now has to be in there. Measured in gigabytes; the Settings line that says Memory or RAM."
    analogy: "The room (the drive is the warehouse; the choir sings in the room, not the warehouse)"
    recap: "Memory (Book 1, ch 1) is the room a model has to fit in, with room to work, before it can speak. The first fact on your sticky note."
    station: machine
    avoid: ["RAM as a different thing from memory", "storage", "space", "disk"]
  - term: model file
    gloss: "The single file a model is downloaded as; the whole of the clever part in one lump. No account, no key, no phoning home. Closer to a film file than to an app."
    analogy: "A film file: copy it to another machine with enough memory and it plays there too"
    recap: "The model file (Book 1, ch 1) is one file holding the whole model. Where you start when asking whether it fits, never the whole answer."
    station: machine
    avoid: ["weights", "checkpoint", "binary", "the model (when the file is meant)"]
  - term: working space
    gloss: "Everything a running model needs in memory besides its file: the program that runs it, the conversation so far, and a few helpers. It isn't a fixed amount: it changes with the program and its settings."
    analogy: "The choir isn't the only thing in the room: there's the stage crew and the music stands too"
    recap: "Working space (Book 1, ch 1) is what a running model needs beyond its file. Chapter 2 turns its dials."
    station: machine
    avoid: ["overhead", "KV cache (until Book 2)", "context (until chapter 2)"]
  - term: graphics card memory
    gloss: "Memory on a graphics card, separate from the computer's normal memory: much smaller and much faster. Only some computers have it; Macs and office laptops don't."
    analogy: "A workbench in the corner of the room: small, and everything on it goes faster"
    recap: "Graphics card memory (Book 1, ch 1) is the small fast workbench beside the room. A model that fits on it is quick; one that spills off runs at the room's pace."
    station: machine
    avoid: ["VRAM", "GPU memory", "video memory", "shared memory", "unified memory"]
  - term: rule of thumb (half)
    gloss: "Wide on purpose, so the answer is almost always obvious: a model file under half your memory fits; bigger than your memory, it doesn't; anywhere between, it depends on the settings."
    analogy: "A room with a half mark on the floor: under the mark there's room to work, past the walls there's none"
    recap: "Under half your memory fits; bigger than your memory doesn't; between, it depends."
    station: machine
    avoid: ["headroom", "overhead", "VRAM budget", "three quarters"]

previews:                     # mentioned on purpose before their own chapter
  - term: model sizes and the numbers on the label (quantisation, parameters)
    taughtIn: Book 1, chapter 2
    note: "Chapter 2 opens the file"
  - term: memory-mapped loading
    taughtIn: Book 1, chapter 2
    note: The pedantic parenthesis about apps that pull the file in as they go

analogies:                    # one per section, for the checker
  - section: "Fact one: how much memory"
    analogy: "Memory is the room; the drive is the warehouse; the model is a choir that must be in the building before the concert"
  - section: "Fact two: graphics card memory"
    analogy: A workbench in the corner of the room
  - section: Will it fit?
    analogy: The half mark on the floor
  - section: What can it do, then?
    analogy: The small model writing the landlord's letter instead of the tenant's
  - section: Have you got it?
    analogy: '"Rubbish model," says everyone who skipped this chapter. Small room.'
  - section: Where that leaves you
    analogy: More hardware knowledge than the forums, for the price of a sticky note

jokes:
  - "On Linux you already know, and I know you know."
  - "Mine says 128… which is really showing off."
  - "the forty tabs you're not admitting to"
  - "The choir doesn't sing in the warehouse."
  - "the forums will tell you otherwise, LOUDLY"

sources:                      # principle 3; tested/untested labelled
  - claim: macOS shows memory under Apple menu > About This Mac > Memory
    source: Apple Support, About This Mac
    url: https://support.apple.com/guide/mac-help/about-this-mac-mchlp2894/mac
    status: untested on current macOS version (author)
  - claim: Windows shows "Installed RAM" with an "(x GB usable)" figure under Settings > System > About
    source: Microsoft Support, Find out how much RAM your PC has
    url: ""                   # author: confirm current page and wording
    status: untested
  - claim: A model must be loaded into memory before inference; some runtimes memory-map the file and load lazily
    source: llama.cpp documentation (mmap and --no-mmap)
    url: https://github.com/ggml-org/llama.cpp
    status: tested by the author in earlier work, not re-run for this chapter
  - claim: Memory in use, speed and quality of the letter at three model sizes and hosted
    source: docs/design/letter-run/20261105-letter-run.md (run 2026-11-05)
    status: tested by the author on the machines in testedOn
  - claim: The half-and-whole rule of thumb
    source: the author's own rule; labelled as such on the page; checked against the letter-run memory figures
    status: opinion, labelled; not measured on an 8 GB machine, and the page says so
  - claim: A model too big for graphics card memory spills into normal memory and runs at about processor speed
    source: letter run with the graphics card off (8B at 8.4 tokens/s on the processor alone)
    status: tested for the processor-only case; spill on a small card not yet measured

companionRepo:
  name: awesome-local-ai
  url: https://github.com/boxabirds/awesome-local-ai
  pointsTo:
    - one-line memory command per OS
    - the live model table (file sizes, sizes available, first chapter used)

authorWork:                   # before publication
  - Fill testedOn with real machines and the month
  - Confirm the macOS and Windows click paths and wording
  - Build the model table (every model the series uses: file size, available sizes, first chapter) from awesome-local-ai
  - Write the source notes with links; label tested and untested
  - Decide which chat app chapter 0 names, so chapter 2 can open its model file
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

<!-- figure: one-file -->

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
