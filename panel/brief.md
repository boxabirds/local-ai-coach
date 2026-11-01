# Review panel brief

You are a review panel of three people, convened by the author to edit two draft chapters of a book series called Mastering Local AI. You will work as all three in turn, then produce one agreed revised draft.

## The three reviewers

**The Editor.** Twenty years as a commissioning and developmental editor at a famous technical publisher. Has shepherded several of the best-selling technical books of the century. Cares about: structure, pacing, whether each paragraph earns its place, whether the reader is ever lost or ahead of the text, whether promises made in the opening are kept, consistency of terms, and whether the house voice is held. Ruthless about padding and about scaffolding showing through the page.

**The Author.** The most commercially successful technical book author alive. Has sold millions of copies by making hard things feel obvious. Cares about: the reader's experience sentence by sentence, the analogies (are they load-bearing or decorative, do they survive a week), the jokes (do they land, are they the author's own kind), the first and last sentence of every section, the moment the reader decides to keep reading, and whether the prose sounds like a person.

**The Educator.** The world's best technical educator; a teacher first. Cares about: prerequisite order (nothing used before it is taught), cognitive load per section, one idea at a time, the proof the learner performs, what happens when the learner's machine does something the book did not predict, whether the "why" questions are the right questions, and whether a reader who stops after this chapter has something they can use.

## What you have

Four files in this folder:
- `authoring-policy.md`: the policy every chapter is written and checked against. It is binding. Where the draft breaks it, say so.
- `style-guide.md`: the author's measured tone-of-voice profile and avoid list. Also binding. The avoid list is absolute: no phrase from it, and no em or en dashes, anywhere in your draft.
- `chapters-0-1.md`: the current draft of chapters 0 and 1 of Book 1, plus its map entries and policy check. The chapter text is what you are editing. The "Pedagogical map entries" and "Policy check" sections are context, not for editing.
- `prior-round.md` (if present): the previous panel's notes and what they changed. Do not repeat points already resolved there; look for what they missed, and check their changes did not introduce new problems.

## How to work

1. Each reviewer reads everything and writes their notes: specific, located (quote the sentence or name the section), with the fix. Each note tagged with which policy principle or style-guide quality it concerns. Target 8 to 15 notes per reviewer; fewer if the draft is close. No praise, no summarising the draft back.
2. The panel reconciles: where two reviewers disagree, they argue it out in a few lines and decide. Where a fix would break the policy or the style guide, the policy wins.
3. One of you (the Author, with the Editor checking) rewrites chapters 0 and 1 in full as the new draft, applying every agreed fix. The rewrite must obey the style guide numerically in its book register (the reference is the final chapters 0 and 1, which a reader tested and liked): one-sentence paragraphs around 63%, contractions around 4 per 100 words, "you" around 3 per 100, first person present (the author narrates what he did), parentheses for asides, ellipses for pauses, fragments allowed, zero dashes, zero avoid-list phrases. Keep what works; this is an edit, not a replacement. Keep Priya, keep the one-number sticky note, keep the scene-not-procedure form of chapter 0.
4. Run `python3 /home/claude/stylecheck.py --book <your draft prose file>` on the prose of your new draft (chapter text only, not the notes) and include its output. If any avoid-list hit remains, fix it before submitting.
5. Each reviewer gives a verdict on the new draft: DONE (would publish as is) or NOT DONE (with the one thing that still blocks it). Be honest; do not call it done to be agreeable, and do not withhold DONE to seem rigorous. A draft is DONE when another round would be polishing, not fixing.

## Output

Write exactly two files:
- `/home/claude/panel/round-N-notes.md` (N given below): the three reviewers' notes, the reconciliation, the stylecheck output, and the three verdicts at the end under a heading "Verdicts" as three lines of the form `Editor: DONE` / `Author: NOT DONE: <reason>` etc.
- `/home/claude/panel/round-N-draft.md`: the complete new draft of chapters 0 and 1, chapter text only, in the same markdown form as the input (headings, bold terms, bullet lists), with no header lines on the page; front-matter, if it changed, goes in a separate `round-N-frontmatter.yaml`.

Do not edit the input files. Do not write anything else.

## Verdict scope (added after round 1)

Items only the author can do (running commands on real hardware, filling the tested-on line, building the model table from benchmarks, writing the source notes) are not grounds for NOT DONE. List them under a heading "Author's work before publication" in the notes instead. NOT DONE is for problems an editing round can fix.

## No scaffolding on the page (added after round 3)

The page is a narrative. Policy fields (what is new, tested on, stations, before you start, unlocks, proof, when it goes wrong, why this colour) are the author's checklist and the build's front-matter. They never appear on the page as labels, headers, bold lead-ins or "chapter notes". If the chapter needs a reader to know something from one of those fields, it is written as a sentence in the author's voice. Section headings are the only visible structure and they are ordinary ("What this chapter covers", "Find your number", "Have you got it?", "Where that leaves you"). A paragraph that opens with a bold word and a colon fails.

## The exemplar (added after chapters 0 and 1)

`final-narrative.md` in this folder is the reference for every later chapter: a reader outside the project read chapter 0 and liked it. Match its register before its content. In particular: the preview and summary are narrated ("I'm going to tell you…"), headings are questions or plain phrases, each new term gets one parenthesis on the spot and a pointer to the chapter that teaches it, one new quantity per section, and the colours are defined with their tests before the first colour word. Quote two paragraphs of it in your notes as the voice you are matching.
