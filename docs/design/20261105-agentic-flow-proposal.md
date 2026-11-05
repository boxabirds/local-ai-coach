# Proposal: the coach's flow is agentic, and logged

Status: agreed 2026-11-05 (Julian: "it's v1, let's run with it"). Replaces the steering in `docs/design.md` (Agent design) where they differ.

## Why

Today the model gets the open lesson and chapter, a map of statuses and a playbook in prose, and two calls (`start_step` then a card tool) to show a step. After Priya's story nothing told it what to do, so it chatted and stopped ("You'll want a computer open for that one."). The learner had no next action.

## The rule

The coach is a standard agentic loop. **The model decides** what comes next from the whole curriculum and the full conversation. Code never decides, validates or nudges the order, never computes a next step, and holds no curriculum logic. When steering goes wrong, the fix is the prompt, the skills, the context or the model, never code that second-guesses it. (Memory: agentic-flow-no-hardcoding.)

## Context, every turn

- The whole curriculum: every station, the term map, every lesson, the chapters and the story. Measured: about 33,000 tokens. It goes first in the system message and doesn't change within a session, so prompt caching applies.
- The full conversation history. The model reads where the learner is from it.
- What's saved from earlier sessions (below), so a new conversation can pick up.

## Tools

| Tool | Who decides | What it does |
|---|---|---|
| `show_next_step(station, step)` | the model | Gives CopilotKit what it needs to draw that step's card (step, number, choice or permission card, from the lesson), and returns the learner's answer. Replaces `start_step` plus the separate card call. |
| `chapter_ended(station, summary)` | the model | Records that the chapter is done and shows the map. |
| `user_navigated(topic, details)` | the model | Records that the learner went to another topic, and what it is. |
| `run_check(station, step)` | unchanged | Marks an answer or reads the machine. Evidence, not steering. |

Progress is the conversation history. What the tools record is a copy in `~/.local-ai-coach/`, so the next session can resume.

## Logging

Every turn is written to `~/.local-ai-coach/logs/coach.jsonl`, one JSON object per event, so it can be tailed while testing (`make tail`, which pretty-prints):

- the model's input for the turn (system message length and a hash, and the messages it was sent);
- the model's output (text and tool calls with their arguments);
- each tool result;
- the model name the provider reported, the time and the thread id.

What never goes in: API keys or any header that carries them (stripped before logging, as `CredentialsMiddleware` strips them before the graph), and nothing leaves the learner's machine. The log holds the learner's own conversation, on their own computer, and the coach says so. One file per day, the last seven kept.

A side panel showing the same events live is a later option; the file comes first because it works with any tool and costs least.

## How we know it works

Scripted real-model conversations (the opt-in real-model test, extended) read through the log: count turns that end with no next action on screen, and read the transcript of each. No runtime guards.

## What changes

- `apps/agent/src/coach/tools.py`: `show_next_step`, `chapter_ended`, `user_navigated`; `start_step` and `get_station` go.
- `apps/app/src/hooks/use-coach-ui.tsx`: one `show_next_step` frontend tool that draws the right card from the lesson.
- `apps/agent/src/coach/middleware.py`: the whole curriculum in context, cached first; the turn logger.
- `apps/agent/src/prompt.py` and the skills: the loop described, the three tools, "end each turn with a next action unless the learner is mid-question".
- Tests: code tests for tool contracts and the logger (keys never logged); real-model runs for steering.
