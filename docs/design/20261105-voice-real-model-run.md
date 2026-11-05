# Real-model run: the coach's voice after story 12

Date: 2026-11-05. Commit e3713b4. Model: OpenAI `chat-latest` (alias; snapshot not reported by the API). Jev routing not included (no TypeSafe key on this machine). Driver: a headless scripted learner (the cards answer as a learner would; everything else is the real coach). Station: Know your machine, then two typed questions.

## Assessed against assets/tone-of-voice-guide.md (chat subset in src/prompt.py)

| Quality | Seen | Verdict |
|---|---|---|
| Contractions, spoken British register | "matches the Mac's reading", "the 20 GB model's too big", "Lovely." | Meets |
| I and you, not we | "I checked using", "Your 1 TB drive" | Meets |
| Short sentences, one-sentence paragraphs | Mostly one or two sentences per paragraph | Meets |
| No dashes, no headings or lists in a chat reply | None in any reply | Meets |
| Terms glossed on the spot | "A **gigabyte (GB)** is a unit for measuring how much information a computer can hold." | Meets (bold used for the defined term only) |
| Book images first | The room and the warehouse; the choir | Meets |
| At most four sentences for a question | Drive answer about six sentences; gigabyte answer about eight | **Fails** |
| Not talking down; fits framing | "So a 20 GB model won't fit, however much storage you've got. The choir doesn't sing in the warehouse." | **Fails the what-fits feedback**: the chapter text in context pulls replies to the framing under review in docs/design/20261105-what-fits-proposal.md |

## The replies (verbatim)

COACH: Your 16 GB matches the Mac's reading. I checked using `sysctl -n hw.memsize`.
COACH: All three right. On your 16 GB Mac, the 20 GB model's too big.
COACH: You've finished Chapter 1: Know your machine.

LEARNER: Quick question: why doesn't my 1 TB drive count?
COACH: The drive's the warehouse, where things are kept. **Memory** is the room where they're used.

Your 1 TB drive can store hundreds of model files. Lovely. But when you run one, the model has to fit into your Mac's 16 GB of memory before it can speak.

So a 20 GB model won't fit, however much storage you've got. The choir doesn't sing in the warehouse.

You've finished Know your machine, and your map
LEARNER: What's a gigabyte, actually?
COACH: A **gigabyte (GB)** is a unit for measuring how much information a computer can hold. One gigabyte is roughly a billion bytes. A byte is enough information to store one ordinary English letter.

Your Mac has 16 GB of memory. Think of that as the size of your room. A 5 GB model takes up roughly five of those sixteen gigabytes, leaving space for everything else your Mac's doing.

Your 1 TB drive, by

