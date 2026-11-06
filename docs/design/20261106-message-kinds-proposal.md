# Narrative, facts and tasks look different (2026-11-06, Ceetrix story 25)

Raised by Julian on the memory step's card: "In your settings" adds nothing, and the text "gives a task, then an explanation, then the task again in more detail". He asked for clear delineation in the chat between narrative, facts or concepts, and tasks: yellow for facts with a light bulb leading the text, two light greens for tasks (darker for the current one, lighter for answered ones).

## Where it reaches

| Place | What changes | What stays |
|---|---|---|
| `curriculum/lessons/*.json` | A step may have `fact`: what to know first. machine.1, machine.3, machine.4 and localchat.1 are split (below) | Every other step; ids, checks, hints, doIt |
| `curriculum/validate.py` | `fact` must be text; it is read before `text` for the term rules; a bracketed definition inside `text` is refused (STEP_TEXT_MIXED) | All other rules |
| `fixtures/curriculum/lessons/*.json` | The tests' copy split the same way, mechanically, so it stays valid | Its wording otherwise |
| App cards (`step-card`, `number-card`, `choice-card`, `next-step`, `fact-bubble`, `card`, `coach.css`) | Fact bubble in yellow with a light bulb; task cards green, stronger while waiting, paler once answered; the labels "In your settings", "Here, with me" and "Read this" are kept for screen readers only | The terminal and chat-app labels; every button |
| `apps/agent/src/coach/stub.py` | Passes a step's fact to its card | Everything else |
| The book (`panel/`) | Nothing: the book's chapter prose is not built from these step texts | |
| `curriculum/stations.json`, `map.json`, `scope.json`, the coach's prompt and skills | Nothing | |

## The rewrites (the author's to change)

**machine.1**
- Fact: **Memory** is the space your computer works in. Whatever it's doing right now has to be in there.
- Task: Find how much memory your computer has, in GB. On a Mac: Apple menu, About This Mac, the line that says Memory.
- Was: Fact one: how much **memory** your computer has, in GB. (Memory is the space your computer works in. Whatever it's doing right now has to be in there.) On a Mac: Apple menu, About This Mac, the line that says Memory.

**machine.3**
- Fact: **Graphics card memory** is separate from normal memory: much smaller and much faster. Macs and office laptops have none, and that's fine.
- Task: Find how much graphics card memory your computer has, if it has any. On Windows: Task Manager, Performance, GPU, Dedicated GPU memory.

**machine.4**
- Fact: A **model file** is the single file a model is downloaded as. A running model also needs **working space** beyond its file: the program that runs it, and the conversation so far.
- Task: Now the test. For each of these, say fits, depends or doesn't fit, against your memory: a 2 GB model file, a 5 GB one, a 20 GB one.

**localchat.1**
- Fact: A **terminal** is a window where you type a command and the machine types back. Your **server** is the program on the model's machine that holds the model in memory and answers.
- Task: First, a practice run in a pretend terminal, so nothing you type here can break anything. Ask your server which models it has: `curl http://{server}/v1/models`

"Fact one" and "Fact two" are gone from the tasks: with the fact in its own bubble they only repeated it.

## Decisions that are the author's

1. The wording above. Edit the lesson files directly; `make check` keeps the split honest.
2. prove.1 is a reading step that is all concept, with no task. It still shows as a task card with I did it. It could become a fact bubble alone; not done here.

## What was done

All of the above, through `make check` and the style check.
