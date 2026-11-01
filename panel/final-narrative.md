# Book 1 Foundations: chapters 0 and 1

## Chapter 0: The whole game

### What this chapter covers

I'm going to tell you a story about a solicitor called Priya, a laptop, and a letter that never left the room.

Then I'm going to ask you why the ending matters.

That question, to my mind, is the whole of Book 1, and I'll finish by showing you the map we'll use to answer it.

Imagine this.

(I made Priya up. The afternoon, I suspect, you'll recognise.)

Priya runs a two-person practice above a bakery in Leicester.

Tuesday afternoon, a client's deposit dispute lands on her desk: eleven pages of tenancy agreement, a landlord's email that's mostly capital letters (“I have been MORE than REASONABLE”), and a client who'd like a firm letter by Thursday.

She's done this a hundred times.

It takes her about an hour and a half, and a good hour of that is the truly boring part.

Last year she'd have pasted the lot into a chat window and had a first draft in ninety seconds. She did, once.

Then… her regulator published a note on client confidentiality and cloud AI, her professional indemnity renewal came back with a new question on the form, and she stopped.

So here's what she does on Tuesday instead.

She opens a chat app on her laptop.

The app looks exactly like the one she used to use.

The difference is where it sends things.

The clever part isn't on her laptop at all. It's on a small, quiet computer on a shelf in the back office, next to the router. Second-hand, no screen, no graphics card. Nothing on it about AI, just a sticker that said 16 GB, which meant nothing to her at the time.

When she set it up, the app had a look at that box, offered her a really short shelf of three or four models, and recommended one. (A **model** is the file that does the thinking. One file, and you'll open one up in chapter 2.) She took the recommendation. It downloaded once, the week before, onto the box, and that was that.

She pastes in the agreement and the email and types: “First draft of a letter to the landlord. Firm, not rude. Cite the deposit scheme rules.”

The reply starts. Slowly, for the first few words… then at about the speed she reads.

It's… fine. It's the draft a decent trainee would hand her. Dates right. Tone a bit keen.

She types “firmer, and lose the second paragraph” and it does.

Nine minutes in, she has the letter.

She spends the next twenty making it hers, which is the half of the job she actually likes.

Now, the moment I really want you to see. Look at the top of her chat window.

Where the old app showed a company's name, this one shows the name of a computer: backroom.

Her laptop is talking to the box on the shelf, the same way it talks to the printer. (A **network** is a set of machines that can talk to each other without going through anyone else. Hers is the laptop, the box and the printer. Chapter 3 is where you meet yours.)

Not a server in Virginia. Not the bakery's wifi. A box on a shelf, talking to a laptop on a desk, above a bakery.

And on Wednesday, because Priya is the sort of person who checks, she did it again from her kitchen table.

Her laptop still found backroom from home, through a private link she set up once (chapter 4). Beside the chat she opened a little window that lists where each program is sending data (Macs and Windows laptops have one built in; chapter 5 is where you open yours).

She asked the model another question and watched the chat app's line.

One destination. backroom. Nothing else.

A list, on her screen, that said the only place her client's letter went was a box she owns. No privacy policy involved.

### Why?

How is that possible? Not long ago the clever part lived in a massive building full of servers that cost more than Leicester. 🤯 What's on Priya's laptop that wasn't there before?

How did a laptop with no graphics card, bought for spreadsheets, write a letter? What was it actually doing while the words appeared at reading pace?

Why a box in the back room, and not the laptop itself? And what's a network, if it isn't the internet?

And why did she check on Wednesday? What could have gone wrong on Tuesday that she wouldn't have seen?

That last one is the question this book is really about, and I'll give you my answer now, because it's the reason I wrote it.

Nearly everything Priya did on Tuesday, a script could do for her.

The Wednesday check is the one thing that has to live in her head, because the failure it guards against is silent.

Nothing beeps when a draft leaves the building. NOTHING.

It's an open window in a house you've just locked up: the house doesn't tell you, you go and look.

Those four questions take the next five chapters to answer, and we'll take them in order: what's in the box (chapter 1), what's in the file (chapter 2), what a network is and what the internet adds (chapter 3), how she kept the box on her own network and still reached it from home (chapter 4), and how she proved it (chapter 5).

By the end of Book 1 you'll be Priya on Wednesday, and nobody will have made you buy a graphics card on the way.

### The map, and three stations

This series comes with a map.

It's drawn like the London Underground: coloured lines, with a circle on each line for every skill you pick up along the way.

I call each of those circles a **station**, and getting to one means you can do the thing it's named after. (Yes, there is a Circle line. No, it doesn't go anywhere useful either. 😆)

Each station has a colour too: grey, amber or red.

Grey means press go. A script does it, and you never need to know what happened.

Amber means you need to know what it does and why it's there, but not how to fix it. It almost never breaks. When it does, knowing what it was for tells you where to look.

Red means you have to understand it well enough to tell when it's wrong, because when it fails it fails quietly, or expensively.

That's also the test for whether you've got a station. Grey: it ran. Amber: you can say in a sentence what it did. Red: you can say what it looks like when it goes wrong.

Why bother with colours at all? Because local AI is a different deal from a subscription. Nobody else is running it. The colours tell you how much of the running is yours.

Priya passed through three stations that week without knowing their names:

- **Know your machine.** The app worked out that the box could run this at all. Amber: she should know what it measured, because one day it'll be wrong.

- **Local chat.** She ran a model on a machine she owns and talked to it. Grey: press go. A script does this forever.

- **Prove it stays local.** The Wednesday check. Red: this one lives in her head, because the failure is silent.

Those are the station colours.

Three stations. Three different amounts of you.

The colours run through every chapter from here on, and they're the straight answer to “how much of this do I actually have to learn?” 🤔

Less than you fear, I promise. But not none.

### Where that leaves you

A solicitor wrote a confidential letter with an AI that lives on a box she owns, and the next day she checked where the words went, and the list had ONE name on it. Hers.

You can't do that yet.

You can see what it looks like, you know the four questions standing between you and it, and you've seen the map we'll follow to get there.

Next chapter: the first question. What's in the box, and the one number on a sticky note that tells you what yours can run.

You'll want a computer open for that one.

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
