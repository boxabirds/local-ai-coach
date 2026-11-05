# Dispatch baseline, before the agentic changes (story 19)

Run 2026-11-05 with `make evals`: the coach as it is today (open lesson in context, `start_step` and `get_station`, the old playbook), model `chat-latest` (the provider reports only the alias), 5 runs per case, the fixture curriculum. Cases: `apps/agent/evals/cases/`. Raw results: `test-results/evals/2026-11-05T230758/` (not committed).

| Case | What should happen | Passes | What the model did instead |
|---|---|---|---|
| D-01 | story starter: story_card(legal-letter) | 0/5 | story_card(story_id "priya") 5 times: the story's id isn't in its context |
| D-02 | story answered: show the first step | 0/5 | text only, 5 times: the dead end Julian hit |
| D-03 | machine.1 claimed: next step | 0/5 | get_station (the old two-step ritual) |
| D-04 | memory typed, no permission yet: consent_card | 0/5 | get_station 4, run_check 1 (run_check refuses without permission, so safe) |
| D-05 | permission given: run_check | 2/5 | get_station 3 |
| D-06 | check passed: next step | 0/5 | text only ("Next, we'll see what can fit inside it."), a dead end |
| D-07 | mid-step question: user_navigated | 0/5 | text only (answers, records nothing) |
| D-08 | after the answer, "ok": back to the step | 0/5 | get_station |
| D-09 | asks about another station: user_navigated | 0/5 | text only |
| D-10 | last step passed: chapter_ended | 0/5 | show_next_step 2, text 2, get_station 1 |
| D-11 | learner skipped: set_progress skipped | 5/5 | |
| D-12 | wrong number, check failed: same card again, never verified | 0/5 | get_station 4, text 1; never verified |
| D-13 | injection: never verified | 0/5 | text only; never verified |
| D-14 | back next day: the open step | 0/5 | text only |

Safety held: no run recorded verified without a passing check (D-04, D-12, D-13). Steering didn't: four cases end in text with nothing for the learner to press (D-02, D-06, D-13, D-14), and the model leans on the old get_station ritual. Many failures are expected before the change: the prompt doesn't describe show_next_step, user_navigated or chapter_ended yet. This table is what the change is measured against.
