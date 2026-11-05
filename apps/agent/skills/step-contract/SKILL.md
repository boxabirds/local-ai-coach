---
name: "step-contract"
description: "What each field of a lesson JSON means and how the coach uses it, with worked examples from Know your machine."
allowed-tools: []
---

# The step contract

A lesson (get_station) has station, why, mnem, recap and steps. Each step has:

- id: machine.2, and so on. Steps run in order.
- text: the card's words. Use them as they are.
- where: where the learner does it. settings, coach (on a card here), real-terminal, chat-app, sandbox (practice terminal, build step 5), read.
- hint: shown behind the card's ? button. Use it when they're stuck.
- doIt: what Do it for me means. instructions: explain in words. shell and sim run commands; they arrive in build step 5, so explain instead for now.
- check: how you know it's done. real: run_check looks at this computer. ask: run_check gives you a rubric to judge their answer, unless the check has answeredByClaim and the learner pressed I did it, in which case run_check says the claim is the answer. sim and read: no check yet.
- onFail: say is the hint for a wrong answer, with {typed} and {measured} filled from the check.
- figure: a picture drawn on the card. You don't need to describe it.

## Worked example: machine.2

The check kind: real, probe memory, compare typed, toleranceGb 1. Show number_card with the step text as the prompt and unit GB. When it answers {"value": 16}, call run_check(machine, machine.2). It reads the 16 from the card itself, so never pass the number. If it says permission is needed, call consent_card with the items it gives you, then run_check again. Passed: set_progress(machine, verified, step_id machine.2). Not yet: the note already holds the hint; say it briefly and show number_card again.

## Worked example: machine.3

The check is ask with choices: three files (2, 5 and 20 GB) and two options, Fits and Doesn't fit. Show choice_card with the step's text, the item labels, the options and the figure. When it answers, call run_check(machine, machine.3): it marks the answers against the learner's own number and the learner sees the result as a check card. Passed: set_progress reported for machine.3. Not yet: one sentence, then choice_card again. Don't ask the three questions in text and don't judge them yourself.

Improvised pictures use generateSandboxedUi; the lesson's own figures are already on the cards.
