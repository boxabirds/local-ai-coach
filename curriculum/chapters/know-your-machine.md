---
# Front-matter for Book 1, chapter 1: Know your machine.
# Read by the build and the checker. Never rendered on the page.
# Fields marked "author" need the author's hands or hardware before publication.

book: 1
chapter: 1
title: Know your machine
slug: know-your-machine

whatIsNew: >
  One number (memory, in GB) decides whether a model runs at all, and the
  reader gets it from their own settings in two minutes with nothing
  installed. Every other hardware guide starts from specs, benchmarks or a
  GPU; this one defers all three to Book 2 and says so.

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
  models: []                  # none run in this chapter

stations:
  - id: machine
    name: Know your machine
    colour: amber             # inYourHead: know what it does
    zone: 1
    needs: []
    proof: >
      Say your number without looking; then for a 2 GB, a 5 GB and a 20 GB
      file say fits or does not fit. On 16 GB: fits, fits, no. On 32: the
      last one fits too.
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
        cause: Room is nearly full; the machine is working hard
        fix: Nothing broken; Book 2 covers living with it, shrinking the model, or buying more room

beforeYouStart:               # resources, not knowledge
  software: []
  downloads: []
  accounts: []
  physical:
    - A computer whose settings you can open (Mac, Windows or Linux)
    - A sticky note and a pen
  diskFreeGb: 0
  memoryFreeGb: 0
  timeMinutes: 5
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
    gloss: >
      The space your laptop works in; whatever it is doing right now has to
      be in there. Measured in gigabytes; the Settings line that says
      Memory or RAM.
    analogy: The room (the drive is the warehouse; the choir sings in the room, not the warehouse)
    recap: Memory (Book 1, ch 1) is the room a model has to fit in, whole, before it can speak. Your sticky-note number.
    station: machine
    avoid: [RAM as a different thing from memory, storage, space, disk]
  - term: model file
    gloss: >
      The single file a model is downloaded as; the whole of the clever part
      in one lump. No account, no key, no phoning home. Closer to a film
      file than to an app.
    analogy: "A film file: copy it to another machine with enough memory and it plays there too"
    recap: The model file (Book 1, ch 1) is one file holding the whole model. Fits in memory or it does not run.
    station: machine
    avoid: [weights, checkpoint, binary, the model (when the file is meant)]
  - term: rule of thumb (three quarters)
    gloss: >
      If the file is more than about three quarters of your memory number,
      expect a squeeze; bigger than the number, it does not run.
    analogy: Elbow room, because the laptop is already using some memory for being a laptop
    recap: "Three quarters of your number is comfortable; over it is a squeeze; over the number is no."
    station: machine
    avoid: [headroom, overhead, VRAM budget]

previews:                     # mentioned on purpose before their own chapter
  - term: two rooms (separate graphics card memory)
    taughtIn: Book 2
    note: Named as "a complication you can ignore for now"; changes how fast, never whether
  - term: model sizes and the numbers on the label (quantisation, parameters)
    taughtIn: Book 1, chapter 2
    note: "Chapter 2 opens the file"
  - term: memory-mapped loading
    taughtIn: Book 1, chapter 2
    note: The pedantic parenthesis about apps that pull the file in as they go

analogies:                    # one per section, for the checker
  - section: Find your number
    analogy: The sticky note on the lid
  - section: Why it fits or it doesn't
    analogy: "Memory is the room; the drive is the warehouse; the model is a choir that must be in the building before the concert"
  - section: The model file is the whole brain
    analogy: A film file, not an app
  - section: Have you got it?
    analogy: '"Rubbish model," says everyone who skipped this chapter. Small room.'
  - section: Where that leaves you
    analogy: More hardware knowledge than the forums, for the price of a sticky note

jokes:
  - "On Linux you already know, and I know you know."
  - "Mine says 128… which is showing off."
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
  - claim: 16 GB and 32 GB machines run the model Priya used
    source: arithmetic from the model table file sizes; not timed
    status: not tested; stated as arithmetic in the text
  - claim: The three-quarters rule of thumb
    source: the author's own rule; labelled as such on the page
    status: opinion, labelled
  - claim: Machines with a separate graphics card have GPU memory distinct from system memory; fitting there changes speed, not whether it runs
    source: Book 2 chapter on GPU memory (forward reference)
    status: untested in this chapter

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

## Chapter 1: Know your machine

### What this chapter covers

This chapter answers one question: what can my machine run? (Your laptop, or a box like Priya's. Same number, same sticky note.)

You'll find one number on your own computer, write it on a sticky note, and from then on you'll be able to look at any model on the internet and know in five seconds whether it'll fit.

No benchmarks. No spec sheets. One number.

Why I'm making you do this: in chapter 0 the app looked at Priya's box and chose her model for her, and it chose well.

One day it'll choose badly, or you'll want something it didn't offer, and the sticky note is how you check.

You'll need a computer whose settings you can open (any Mac, Windows or Linux machine), a sticky note, a pen, and five minutes. No downloads, no account, nothing installed.

### Find your number

One number. How much **memory** your machine has, in gigabytes (the line in your settings that says Memory, or RAM; same thing, and I'll explain what it actually is in a moment).

On a Mac: Apple menu, About This Mac, the line that says Memory.

On Windows: Settings, System, About, Installed RAM. If it shows two numbers (“16.0 GB (15.7 GB usable)”), write the first one.

On Linux you already know, and I know you know.

(Those are the click paths as I write this. If your machine has moved them, the one-line command for each operating system is on the series' companion page, awesome-local-ai on GitHub, which is where every script in this series lives, because scripts change and books do not.)

🧙‍♂️ Write it on a sticky note and put it on the laptop. I mean it: pen, paper, lid.

Mine says 128… which is showing off, and I'll come clean about what that cost in Book 2.

Yours probably says 16 or 32.

Both of those should run the model Priya used. (That's arithmetic, not my stopwatch. I'll say so plainly when I've timed it.)

If yours says 8, you're not out. You're shopping from the small end of the shelf, and the table at the end of this chapter marks those rows for you.

### Why it fits or it doesn't

This whole chapter is two ideas.

#### Memory is the room, not the speed

Memory is the space your laptop works in. Whatever it's doing right now has to be in there. The drive is where things are kept; memory is where they're used.

A model has to be loaded, in full, into memory before it can say a word.

Not a page at a time. All of it, all at once, like a choir that has to be in the building before the concert starts.

(Pedantic note: some chat apps pull the file in from the drive as they go rather than in one gulp, and a few will even have a go at a file that's too big. Have a go is the phrase. It still has to fit. Chapter 2 has the gory version.)

So the first question about any model is “does it fit”.

Clever comes second, and it's a very distant second if the answer's no. We'll get to clever in chapter 2.

A 5 GB model needs about 5 GB of memory plus elbow room, because your laptop's already using some for, you know, being a laptop.

My rule of thumb (mine, not a benchmark): if the file is more than about three quarters of your number, expect a squeeze.

A 20 GB model on a 16 GB laptop doesn't run slowly. It doesn't run.

“But I've got a 2 TB drive!” Lovely. The drive's the warehouse. The choir doesn't sing in the warehouse. 😆

This is why the app Priya used had a look at her laptop before showing her a shelf.

It was measuring the room.

#### The model file is the whole brain

When Priya's app downloaded the model it downloaded one file: the **model file**, which is the whole of the clever part in one lump, and I do mean the whole of it.

No account, no key, no phoning home.

It is closer to a film file than to an app.

Copy it to another machine with enough memory and it works there too.

This is why her Wednesday check was possible. There was nothing outside her own network to call.

(Chapter 2 opens the file and explains the numbers on its label. For now: one file, fits or doesn't.)

#### A complication you can ignore for now

Some machines, mostly Windows and Linux PCs with a separate graphics card, have two rooms rather than one: a small fast one on the graphics card and the big ordinary one. A model that fits in the small fast room runs a lot quicker. It changes how fast, never whether.

If you have one of those, your sticky note gets the big number (and I'm a little jealous; more on this in Book 2).

Macs and most laptops have one room, and the sticky note really is the whole story.

### Have you got it?

Here's what this station unlocks: reading any model's download page and knowing in five seconds whether it fits. (Model download pages list the file size, in GB, somewhere near the download button. That is the number you compare.)

Here's how you know you've got this station: say your number without looking. Then, for each of these three, say fits or doesn't fit before reading on: a 2 GB file, a 5 GB file, a 20 GB file. On a 16 GB machine that's fits, fits, absolutely no chance. On 32, the last one fits too, which is rather the point of knowing your number. Got all three? You've got it. When the model table at the end of this chapter is in front of you, do the same for any three rows.

Here's what it looks like when it goes wrong. The symptom is a download that sits at 100% and then the app says nothing, or says “loading”… forever, or quietly picks a different model. 😱

The cause is almost always room: the model is bigger than the memory.

The fix is the sticky note.

Check the file size against your number.

If it does not fit, pick the smaller version; most models come in several sizes and the table lists them.

The other symptom is a model that fits and runs but takes a minute to say hello.

Nothing's broken. The room's full and the laptop's working really hard.

You'll decide in Book 2 whether to live with it, shrink the model, or buy more room.

Why is this station amber and not grey? The app found Priya's number for her, and it'll find yours. But the day it picks wrong you need to know what it was measuring, or you'll blame the model, reinstall three times, and give up.

“Rubbish model,” says everyone who skipped this chapter. I've said it myself. 😅 Nope. Small room.

Knowing your number is two minutes of your life, once.

### Your turn

Take your sticky note to the table at the end of this chapter. It lists every model the series uses, with its file size and which chapter first uses it. (The live version, updated as models change, is on the companion page, awesome-local-ai on GitHub.)

- Mark the ones that fit. Those are yours today.

- Note the first one that doesn't fit at all. That's the price tag on your next machine, and you now know exactly what you would be paying for: room, not cleverness.

- Two-room machine? Ignore the small fast room for now. Book 2 shows you how to read its size and which rows will feel quick.

If you're on 16 GB with no graphics card, you'll find most of this series is open to you, and the table marks the rows that aren't (the table's arithmetic, not my stopwatch).

Write that down too, because the forums will tell you otherwise, LOUDLY.

The table of models the series uses is at the end of this chapter, and the version that's kept current lives in the awesome-local-ai repo on GitHub.

### Where that leaves you

Your machine has a room, measured in gigabytes, and a model has to fit in it, WHOLE, before it can speak.

The model is one file.

You now have one number that tells you what fits, the one question to ask of any model page (how big is the file?), and my rule of thumb for the answer: under about three quarters of your number, fine; over it, a squeeze; bigger than the number, no.

That's truly more hardware knowledge than most of the people arguing on the forums have, and it cost you a sticky note.

Next chapter: what's actually in that file, and what the three numbers on its label mean for your room.
