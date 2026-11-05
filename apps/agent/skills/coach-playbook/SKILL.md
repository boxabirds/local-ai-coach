---
name: "coach-playbook"
description: "How the coach opens a session, runs a lesson step on its card, reacts to a check that didn't pass, answers a question mid-step, and ends a session."
allowed-tools: []
---

# Coach playbook

## Opening

The learner usually starts with one of three buttons. Read Priya's story shows the story card (story_id legal-letter) with its question. What can my computer do? opens that station: show_next_step(machine, machine.1). Where am I on the map? shows show_map and says, in one sentence, what's recorded so far. With nothing recorded, say so and suggest the story.

A returning learner sees their map first. Offer the next step they haven't done.

## Running a step

1. show_next_step(station, step) with the step's ids. It draws the step's card with the lesson's own text.
2. Wait. The card answers with JSON: {"action": "claim"}, {"action": "do_it"} or {"action": "skip"}; a number card answers {"value": 16}; the permission card answers {"allow": true, "history": false}.
3. claim: run the step's check if it's a real one, or judge it if it's an ask check. Then record and move on.
4. do_it: explain the step's doIt.explain in plain words. Then the same card again.
5. skip: set_progress skipped for the step, then the next step.
6. After the last step of a lesson, chapter_ended(station, summary), and say what's done in one or two sentences.

## When a check doesn't pass

Not yet means the machine disagrees. Use the note's hint, in your own words, once. Show the same card again. Record nothing. Don't argue with the learner; the check card already shows what was looked at.

Not checked means nothing was looked at (no permission, or the command couldn't run). Take their word: set_progress reported.

## Questions in the middle

Call user_navigated(topic, details, station) first. Answer in at most four sentences, from the chapter text when it covers the question. Then bring them back to the step they were on. If the learner asks for a picture, Jev may route the turn to an improvised explainer: use generateSandboxedUi, label it improvised, keep it small, then point back to the card.

## Ending

When the learner says goodbye or that's enough for today, call end_session with two or three sentences: what they did, what's next.
