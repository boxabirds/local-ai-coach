# The three-stations figure, and how stations are drawn (2026-11-06)

Raised by Julian on the coach's story card (the figure after "Those are the station colours."), with five points. This is the impact check CLAUDE.md asks for before changing what is taught.

## What was raised

1. Amber isn't amber: `#b45309` reads as brown.
2. The choice buttons overflow and wrap untidily.
3. The visible word "Station" before the buttons means nothing to the learner.
4. The shapes look random, like an intelligence test, because the story never says what they are; the "you are here" ring is unclear. Covered stations and routes should be full strength, those not yet covered half strength.
5. The heading "Priya's week, on the map" and the caption "Priya's three stations. The shape says the same as the colour, so it reads in black and white too." are chatter.

## Where it reaches

| Place | What changes | What stays |
|---|---|---|
| `curriculum/stories/legal-letter.md` line 109 (coach) | "Each station has a colour too: grey, amber or red." becomes "Each station has a colour and a shape too: a grey circle, an amber diamond or a red triangle." | The meaning of each colour (lines 111 to 117) |
| `panel/final-narrative.md` line 107 (the book) | The same sentence, the same change, so the coach and the book agree | Everything else |
| `curriculum/figures.json` `three-stations` | `caption` removed; the control keeps its label "Station" for screen readers only | Title, alt text, options, `crit`, placement |
| `curriculum/figures/make_figures.py` `three_stations` | Heading removed; the blue ring replaced by a "You are here" label with a pointer; stations and line up to the chosen one at full strength, the rest at half; amber fill `#ffb000` with a `#92400e` edge | Station positions, names, colour words, the one-line test under the line |
| `curriculum/figures/three-stations.svg` and `print/three-stations.svg` | Regenerated | Print still shows the last station chosen, so the print copy is all full strength |
| `apps/app/src/components/coach/coach.css` | `--crit-amber: #ffb000`, new `--crit-amber-edge: #92400e` used for every amber outline (map and figure) so amber keeps 3:1 against paper; choice buttons laid out in an even grid; caption hidden when empty | Grey and red |
| `apps/app/src/components/coach/figure.tsx` | The control's label becomes screen-reader only; no caption element when there is no caption | The figure contract |
| `apps/app/src/components/coach/tube-map.tsx` (the learner's map) | Amber changes through the shared variables; nothing else in this change | Its fill-by-progress drawing (see decision 2) |
| `fixtures/curriculum` | Not changed: it is the tests' frozen copy | |
| `docs/design.md`, `curriculum/stations.json`, `map.json`, `scope.json`, the coach's prompt and skills | Nothing: none names the shapes or this figure's words | |

## Decisions that are the author's

1. **The story sentence (book text).** Proposed: "Each station has a colour and a shape too: a grey circle, an amber diamond or a red triangle." Done as proposed in both copies; change the wording in both if you want it different.
2. **The learner's map.** Your point 4 says covered stations and routes at full strength, the rest at half. The map today shows progress as how full each marker is (empty, a quarter, a half, full). Applying your rule there means choosing which statuses count as covered (for example reported, assisted and verified) and dropping or keeping the fill. Not done in this change; your call.
3. **"You are here" in Priya's figure.** The learner picks a station and the figure says "You are here" above it. In Priya's story that "you" is the reader following her week. Done; say if it should read differently.

## What was done

All of the above except decision 2, through `make check`; the figures are regenerated, and the coach, the book and the figure agree.
