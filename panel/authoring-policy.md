# Mastering Local AI: authoring policy

 · 

Every chapter in every book is written to this policy and checked against it before it is published. The policy is short on purpose; the checks are specific. The page is a narrative: a person telling you a story and then showing you why it worked. Everything that is not that (metadata, checklists, the policy's own words) lives in front-matter and never on the page.

## The twelve principles

The first nine are yours. The last three are drawn from what the most-read technical books of the last twenty years have in common; each names its source.

| # | Principle | What it requires | How a chapter is checked |
| --- | --- | --- | --- |
| 1 | Write in the house voice | Every chapter follows the tone-of-voice profile in its book register: first person present, the author narrating what he did and talking to "you"; verdict before hedge; one-sentence paragraphs; fragments allowed; parentheses for asides; ellipses for pauses; contractions throughout; no dashes; no phrase from the avoid list. | Run `stylecheck.py --book` on the chapter text (not the front-matter): all fourteen measures within range of the chapters 0 and 1 reference, dash count zero, avoid-list hits zero. Read one page aloud. |
| 2 | Make it stick | At least one analogy and one joke per major section. Analogies are domestic and physical (video resolution for quantisation, a padded cell for a sandbox). Jokes are mock voices, self-deprecation or absurd images, never at the reader's expense. | Each section heading has a note naming its analogy. A reader asked a week later can repeat the analogy, which is the only test that counts. |
| 3 | Respect the giants | Exhaustive research before drafting. Every claim about what exists, what a tool does or what someone found is traced to a primary source and credited by name, with a link. Prior art is named even when the chapter improves on it. | Every factual sentence has a source in the chapter notes. Any claim the author tested personally is marked as such; anything not tested is marked as not tested. No uncredited idea. |
| 4 | Fresh angle, written today | Each chapter states what it adds that nothing before it did, and uses the fact it is written in November 2026: models, hardware and incidents from the last twelve months, and the questions those raise that older material could not. | The chapter's one-line "what is new here" is written before drafting and survives the edit. If the chapter could have been written in 2024, it is rewritten or cut. |
| 5 | Tell them three times | Every chapter opens with a short preview of what it covers and why, covers it, then closes with a short summary of what was covered and what the reader can now do. The three agree. This is a structure, not a set of headings: the words "tell them" never appear on the page. Section headings are ordinary ("What this chapter covers", "Where that leaves you", or whatever fits the chapter). | The opening and closing paragraphs are written first and compared last. If they do not match the body, the body changed and they are rewritten. |
| 6 | Plain English by default | Short words, active voice, concrete nouns. Jargon only where principle 7 allows it. If a sentence would need a second read, split it. | Readability check on each section; no sentence over 40 words without a reason; the hard-word list in the draft is reviewed against principle 7. |
| 7 | Define before use | No technical term appears before its definition, and the rule covers the author's own metaphors: the map and its stations are introduced before any "stop", "line" or "journey", and the colours before any colour word. Definitions are a bold term, a plain gloss, and usually an analogy, on first use. The pedagogical map (below) is the register of what has been defined and where. | Automated: every term in the chapter's glossary is matched against the map; any term used before its first definition in reading order fails the build. |
| 8 | Terms are allowed once introduced | After definition, the term is used freely and exactly. No synonyms for variety; one word per concept throughout the series. | Glossary lint: each concept has one canonical term; near-synonyms in the draft are flagged. |
| 9 | Recap on re-entry | A term defined in an earlier chapter or book gets a sidebar recap on its first use in a new chapter: two or three lines, the analogy, and a pointer to where it was first taught. | Automated from the map: any term whose definition lies in another chapter triggers a recap sidebar; a missing sidebar fails the build. |
| 10 | Show it running before explaining it | Every concept is met first as something the reader runs or sees, then explained. Code and commands are complete and copyable; nothing is "left as an exercise". The whole-game chapter 0 is this principle at book scale. | Each concept section opens with a runnable example or a screenshot of real output. Every command in the chapter has been run on the stated hardware in the stated month. (Source: the Head First series and the Pragmatic Programmers' practice of runnable examples throughout; Zed Shaw's Learn the Hard Way sequence of type it, run it, then read why.) |
| 11 | Name the failure | Every technique is followed by what goes wrong when it is misapplied, what it looks like from the reader's chair, and how to recover. Criticality (grey, amber, red) is stated so the reader knows how carefully to read. The three colours are defined in full before the first colour word appears in each book, in this wording: grey, press go, a script does it and you never need to know what happened; amber, you know what it does and why it is there but not how to fix it, because it almost never breaks; red, you understand it well enough to tell when it is wrong, because it fails quietly or expensively. The same passage gives the test for each: grey, it ran; amber, you can say in a sentence what it did; red, you can say what it looks like when it goes wrong. | Each station section has a "when it goes wrong" block with a symptom, a cause and a fix. Red stations have a proof the reader performs. (Source: Kernighan and Pike's The Practice of Programming and the Site Reliability Engineering book, both of which teach through failure cases and post-mortems rather than only through happy paths.) |
| 12 | Version everything, date everything | Every chapter records the models, versions and hardware it was tested on and the month, in its front-matter, and says so in one sentence of prose where the reader needs it. Tool-specific detail lives in the companion repository (awesome-local-ai, named by its real name, never an invented site) that can change without reprinting the book; the book teaches the concept and points to the repo for the current command. | Front-matter carries the tested-on fields. Anything likely to change within a year is in the repo, not the prose. (Source: the companion-repo convention of the O'Reilly and Manning catalogues; the stated reason the serving-stack and model-choice chapters in recent local-AI titles date fastest.) |

## Chapter template

A chapter is two things: a page the reader reads, and front-matter the author and the build read. They never mix. The page is a narrative in the author's voice; the front-matter is data. Chapters 0 and 1 of Book 1, as tested with a reader in November 2026, are the exemplar for both.

**Front-matter** (YAML at the top of the chapter file, never rendered on the page): `whatIsNew` (principle 4), `testedOn` (hardware, models, versions, month; principle 12), `stations` with colours, `beforeYouStart` (the resources list: software, downloads with sizes, free disk and memory, accounts, time), `terms` (map entries this chapter defines), `sources` (principle 3, with tested/untested labels), `analogies` (one per section, for the checker). If the reader needs to know any of it, the author writes it as a sentence in the narrative.

**Page.** Six sections with ordinary headings. The headings below are the defaults; a chapter may replace one with a question or a phrase of its own, never with a policy label, and never with a bold word and a colon at the start of a paragraph.

| Default heading | What it does | Form |
| --- | --- | --- |
| What this chapter covers | The preview (principle 5): what you will be able to do, why it matters, what you will see first. | Narrated, first person, two to four one-sentence paragraphs. "I'm going to tell you a story about…" not "This chapter introduces…". |
| (the outcome) | The result first, before any explanation (principle 10). In chapter 0 a scene; elsewhere the thing running, with real output. | Scene or transcript. Any term the scene cannot avoid is defined in a parenthesis on the spot, in one sentence, with a pointer to the chapter that teaches it. |
| Why? / Why it fits or it doesn't / a question of the chapter's own | The rules: the concepts the outcome depends on, taught through what the reader just saw (principles 6, 7). | Question heading, answered bluntly, then built up. One quantity at a time: if a concept can be taught with one number, teach one and defer the rest to the chapter that needs them. |
| Have you got it? | The proof the reader performs, for the station's colour (principle 11). | A test the reader can do today with what the chapter gave them, plus the answer so they can check. The colour's meaning is restated here in one line. |
| Your turn | The reader rebuilds the outcome on their own data (Play). | Complete, copyable commands; the companion repo named once, by its real name. |
| Where that leaves you | The summary (principle 5): what was shown, what you can now do, what the next chapter opens. | Narrated, matches the preview. Ends on the hook for the next chapter. |

Chapter 0 of each book is a scene, not a procedure: a named ordinary person in an everyday setting, who already has the outcome; the reader watches one afternoon and is shown one visible moment that makes the point (the name of her own computer at the top of the chat window, where a company's name used to be), the author says plainly that the person is invented, and the chapter ends on the "Why?" questions the book answers. Nothing is installed, nothing is typed, and nothing is assumed to be set up: anyone who already has it set up does not need the book.

## The pedagogical map

A single register of every technical term in the series: where it is first defined, which chapters use it, and the recap text. It is a data file (one entry per term, alongside stations.json) and the build reads it, so principles 7, 8 and 9 are checked by machine rather than by memory. Each entry holds:

| Field | What it holds | Example |
| --- | --- | --- |
| term | The one canonical word or phrase (principle 8) | quantisation |
| definedIn | Book and chapter of first definition | Book 2, chapter 1 |
| gloss | The plain-English definition, one or two sentences, as it appears in the book | Storing a model's numbers at lower precision so it fits in less memory, at some cost to quality. |
| analogy | The teaching analogy used at first definition | Video resolution: 1080p is almost always enough. |
| recap | The two-line sidebar used on re-entry (principle 9) | Quantisation (Book 2, ch 1): a model stored at lower precision to fit in less memory. Think video resolution. Four-bit is the usual sweet spot. |
| station | The station it belongs to, if any | quant |
| usedIn | Chapters that use the term, filled by the build | Book 2 ch 11, Book 4 ch 10, … |
| avoid | Near-synonyms a drafter must not substitute | quants, compression, downsizing |

Three rules the build enforces from it:

- A term used in a chapter before its definedIn chapter, in series reading order, fails the build. Books 3 to 6 may be read in any order after Books 1 and 2, so a term defined in Book 3 and used in Book 5 is treated as a re-entry and gets a recap, not a failure.
- A term with no entry is an undefined term. The draft either defines it (and the map gains an entry) or rewrites around it in plain English.
- A near-synonym from the avoid column appearing in a draft is flagged for replacement with the canonical term.

The map is also a reader-facing artefact: published as the series glossary and as the "you'll meet" badges on the tube map, so a reader can see which concepts a station introduces before they travel to it.

**Resources, not just knowledge.** The station graph records what a reader must know (needs) and the hardware zone. It did not record what they must have in hand, and the first draft of Book 1 chapter 0 assumed a chat app and a model were already installed. So each station gains a `resources` field: software, downloads with sizes, free disk and memory, accounts, physical items, and time to allow. The journey planner sums them for a destination into a "before you start" list, the chapter header prints it, and the reader ticks it before the "Play" section. A resource that costs money or needs a download on the day is flagged, because those are the ones that stall a reader mid-chapter.

## Pre-publication checklist

Run in this order. The first four are automated; the rest are a read.

- Style script in book mode: all measures within range of the chapters 0 and 1 reference; dash count zero; avoid-list hits zero.
- Scaffolding scan: no policy label as a heading, no paragraph opening with a bold word and a colon, no "Tested on", "Stations", "Before you start", "Unlocks" or "Proof" on the page. Front-matter complete instead.
- Metaphors and colours: the map and station are introduced before any tube word; all three colours and their tests are defined before any colour word.
- One quantity at a time: no section introduces more than one new number or measure.
- Map lint: no term before its definition; every re-entering term has a recap sidebar; no near-synonyms.
- Commands: every command and script in the chapter run on the tested-on hardware this month, output captured.
- Sources: every factual claim has a named, linked source in the notes; tested and untested claims labelled.
- Opening and closing paragraphs agree with the body and with each other.
- Each major section has its analogy and its joke, and the joke is not at the reader's expense.
- Every red station has a proof the reader performs and a when-it-goes-wrong block.
- The "what is new here" line is still true after editing.
- Anything likely to change within a year lives in the companion repo, not the prose.
- One page read aloud. If it does not sound like the five posts, it goes back.