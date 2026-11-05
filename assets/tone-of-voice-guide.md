# Julian Harris: writing style and tone of voice

Oct 31, 2026 · @Julian Harris

## How this profile is built

The template below merges four traditions that each describe voice from a different angle, so that the qualities overlap as little as possible: stylometry (measurable surface features: sentence length, punctuation, lexical repetition), Biber's register dimensions (involved vs informational, narrative vs non-narrative, overt persuasion), Hyland's metadiscourse (hedges, boosters, self-mention, engagement with the reader, code glosses that define terms), and the Nielsen Norman Group's four tone dimensions (formal vs casual, serious vs funny, respectful vs irreverent, matter-of-fact vs enthusiastic). Each quality states what it measures and how to assess it from a sample, so the profile can be checked against a draft rather than argued about.

Three findings from the research shaped how the profile is written:

- Verbatim exemplars beat descriptions. A 2025 study of LLMs imitating everyday authors found five-shot prompting roughly doubled authorship-attribution accuracy over zero-shot, that going from 2 to 10 exemplars gave little further gain, and that choosing exemplars by topic similarity made imitation worse. Outputs without exemplars defaulted to a generic style. So this profile is a table plus exemplars, and the exemplars should be whole paragraphs of yours chosen for voice, not for subject.
- Banning everything backfires. Wikipedia's Signs of AI writing guidance warns that prompting against every tell produces stiff, generic text, and recommends restricting a few high-value patterns. The avoid list below is therefore grouped into categories, so a writer learns the shape of the tell rather than a word list it can route around.
- The dimensions are not fully independent in practice; NN/g never claims theirs are. Where two qualities tend to move together (casual register and enthusiasm, for instance) the table notes it, so you can set them separately on purpose.

**The template: 14 qualities**

| # | Quality | Measures | How to assess from a sample | Tradition |
| --- | --- | --- | --- | --- |
| 1 | Sentence rhythm | Mean length and spread | Count words per sentence over 30 sentences; note mean, shortest, longest, and whether fragments appear | Stylometry |
| 2 | Register | Casual to formal | Contractions per 100 words, colloquialisms, slang, Latinate vs plain verbs | NN/g, Biber D1 |
| 3 | Technical density | How much jargon, and how it is glossed | Terms per 100 words; how each is introduced (bold, parenthesis, contrast pair, not at all) | Hyland code glosses |
| 4 | Person and address | Who is speaking to whom | Rates of I, you, we per 100 words; imperatives; questions aimed at the reader | Hyland self-mention and engagement |
| 5 | Stance marking | How opinion and certainty are signalled | Hedges vs boosters ratio; explicit labels ("my view"); whether verdict precedes or follows the hedge | Hyland |
| 6 | Humour | Serious to funny, and the kind | Jokes per 1,000 words; type: self-deprecating, mock-voice, wordplay, absurd image | NN/g |
| 7 | Reverence | Respectful to irreverent about the subject | Count of deflating remarks about vendors, tools, hype | NN/g |
| 8 | Energy | Matter-of-fact to enthusiastic | Intensifiers and exclamation per 100 words; superlatives | NN/g |
| 9 | Evidence mode | Where claims come from and how specific they are | Share of first-hand vs cited vs hypothetical; numbers per 100 words; whether untested things are declared | Rhetoric, ethos |
| 10 | Figurative language | Metaphor density and type | Metaphors per 1,000 words; physical vs abstract; sustained vs one-shot | Stylometry |
| 11 | Argument shape | How a piece moves | Name the move sequence (hook, definition, test, verdict, forward look); narrative or not | Biber D2, rhetoric |
| 12 | Block rhythm | Paragraphs, headings, lists | Sentences per paragraph; headings per 1,000 words; list vs prose ratio; heading style | Stylometry |
| 13 | Typography | Punctuation and markup habits | Rates of ellipsis, parentheses, bold, emoji, exclamation, dashes, capitals | Stylometry |
| 14 | Signature lexicon | Words and phrases unique to the author | Recurring words with above-expected frequency; coined names | Stylometry |

Openings and closings are assessed under 11 (they are the first and last moves). Qualities 2, 6 and 8 tend to move together in this author's writing; the profile sets each anyway.

## The profile

Measured on the full text of the five posts (13,607 words, 1,174 sentences, 615 paragraphs). Rates are per 100 words unless stated. Examples are quoted from the posts; the Sources section links them. Posts are abbreviated: Frameworks, Opus, Contact, Shouldn't, Design.

| # | Quality | Measured setting | Example 1 | Example 2 |
| --- | --- | --- | --- | --- |
| 1 | Sentence rhythm | Mean 13.7 words, median 12, but the spread is the point: 10th percentile 5 words, 90th 25, longest 56. One sentence in six (17%) is a fragment of one to three words. | "Then… …things became a bit of a rollercoaster." (Opus) | "Except." then "The key is the “a3b” part." (Opus) · "Onward." (Opus) |
| 2 | Register | Casual, British, spoken: 1.8 contractions per 100 words, slang beside exact technical terms with no gear change. | "this is all me baby" · "Anthropic started dicking around with access times" (Opus) | "No more calvanting around the file system for YOU Mr Agent" (Contact) |
| 3 | Technical density | High, and every term is glossed on first use: bold or quoted term, plain phrase, often an everyday analogy. | "Digital video has different resolutions… Qwen's resolution can be changed too, measured in bits" (Opus, for quantisation) | "Tailscale is a bit like a “VPN between your devices”." (Contact) · "Open weights: model file only" (Shouldn't) |
| 4 | Person and address | I and you at almost equal rates (1.9 and 1.8 per 100 words); we almost absent (0.17). The piece is one person telling another what he did. | "I remember it well: the productivity I was getting… was intoxicating." (Opus) | "If you're used to your agent cheerily wandering all over your file system, this is gone with hardening." (Contact) |
| 5 | Stance marking | Verdict first, labelled as his, then scoped. Intensifiers (0.73) outnumber hedges (0.50); explicit certainty words are rare (0.05). Hedges are "I think", "probably", "quite", "a bit", not "it could be argued". | "My view? It's still important." (Contact) · "This is not a viable business relationship." (Opus) | "I'd venture to say that Qwen 3.8… is the best there is (this week 😆)." (Opus) · "This is speculation 🔮" (Design) |
| 6 | Humour | Steady, roughly one gag per 150 words (hand count). Types, in order of frequency: mock voices in quotation marks, self-deprecation, absurd images, emoji punchlines. | "“I spent $1000 on what now?”" · "lazy, gaslighting genius interns who just want to go the pub" (Opus) | "Hopefully you were a smart cookie and didn't buy this configuration." (Opus) · "(or something like that 😉)" (Shouldn't) |
| 7 | Reverence | Irreverent toward vendors, hype and his own past decisions; respectful toward named individuals and readers. | "whimsical PM decisions in some distant American startup" (Opus) · "Overhyped, much? 🤯" (Shouldn't) | "Youssof Al Toukhi, Mac kernel wizard" · "The man is destined for big things." (Opus) |
| 8 | Energy | Enthusiastic. Top intensifiers by count: really 16, absolutely 10, actually 10, massive 7, exciting 6, truly 5. Capitals for emphasis 0.32 per 100 words ("WORKED", "TRILLION", "NEVER"). Exclamation marks are rarer than expected (0.19), used in teasers and asides, not in claims. | "You could just ask for stuff and it WORKED." (Opus) | "THIRTY FIVE THOUSAND people signed up." (Shouldn't) |
| 9 | Evidence mode | First-hand trials with counts, screenshots and install commands. Named sources linked. Hypotheticals in quotation marks. What was not tested is stated. | "35-72 tok/s" · "At last count I have identified approximately: 133 agent maker solutions, 46 of which are open source" (Frameworks) | "Might be the same website, or might be 387 different ones, unfortunately we don't know" (Contact) · "Benchmarks are lame so I did a few tests with actual sessions." (Opus) |
| 10 | Figurative language | One physical, slightly absurd image per idea, then dropped. Teaching analogies are domestic: video resolution, car parts, the Apple I. | "a tsunami of solution hammers crashing on a shore sprinkled with problem nails" (Shouldn't) | "Kinda like upgrading one component in your car." · "send the 4090 shooting into the distance leaving the Mac choking on its dust" (Opus) |
| 11 | Argument shape | Cold open in one or two short lines; a numbered or bulleted inventory early (reasons, components, options); a walkthrough the reader can repeat; a labelled prediction; a teaser for the next piece. Subscription ask sits apart from the argument. | Open: "So you want to make an agent. How useful are agent frameworks anyway?" (Frameworks) | Close: "Next article: protecting personal data" (Contact) · "🔮 Prediction: 2027 and the era of the “AI PC”." (Opus) |
| 12 | Block rhythm | Two thirds of paragraphs are one sentence (66%); mean 1.6 sentences. About 9 headings per 1,000 words, many written as full sentences or questions; checklists with ✅ and ❌; labelled sidebars and "Pedantic note" / "Side note" asides. | "Wait what's an agent again? 🤔" (Shouldn't) · "Geek sidebar: you be the judge: does this look purposeful?" (Contact) | "Pedantic note: this is the Qwen 3.8 27b variant specifically" (Opus) |
| 13 | Typography | Parentheses are the main aside device (1.1 per 100 words, about one every 90 words). Ellipses as pauses and teasers (0.27). Emoji 0.43 per 100 words, 30 distinct, with 🧙‍♂️ reserved for recommendations and 🔮 for predictions. Dashes almost absent (0.04). | "Then… …things became a bit of a rollercoaster." (Opus) | "🧙‍♂️ For Mac, MTPLX is my pick." (Opus) |
| 14 | Signature lexicon | friction (13), simple (11), compact (6), "the new hotness" (2), "at last count" (2), "labour of love" (2), "stay tuned" (3), "more on this" (4), PITA, wizard, "Julian's Law". Discourse openers: So (54), Well (16), Yes (13). | "uv, the new hotness when it comes to python package management" (Frameworks) | "Julian's Law of Justified Tedium" (Contact) |

**How to use it when drafting.** Supply this table plus five whole paragraphs from the posts chosen for voice rather than topic (the research found topic-matched exemplars hurt imitation). Lead the draft with an opening line in the author's own words where possible; the same study found a verbatim opening snippet raised the share of outputs judged human. Check a draft against qualities 1, 5, 8 and 13 first: those are where imitation most often drifts toward the generic middle (my judgement from the posts, not a measured claim).

**Where a draft will tend to go wrong without correction.** Sentence rhythm flattens toward the mean (the 17% fragment rate is the first thing to vanish); one-sentence paragraphs get merged; the verdict-then-hedge order reverses; intensifiers are replaced with neutral words; parentheses become commas or dashes; emoji and capitals are tidied away; a one-shot metaphor gets extended into a paragraph. These are predictions from the measurements, not observed failures.

**Corrections to the first draft of this profile.** Measuring the full text changed three earlier estimates. Hedges are less rare than the fragments suggested (0.5 per 100 words, about two thirds of the intensifier rate). Exclamation marks are not a habit; capitals are. And the five posts contain five em dashes and two uses of "honestly", so the avoid list is slightly stricter than the author's own practice, which is fine for a list meant to steer a drafter.

## Book register (added after chapters 0 and 1)

The measures above come from the five newsletter posts. Book chapters are the same voice in a different seat: the author is telling one reader a story and then teaching them, so some measures move. The reference is the final text of Book 1 chapters 0 and 1 (2,714 words), which a reader outside the project read and liked. `stylecheck.py --book` uses these as targets; the posts remain the targets for articles.

| Measure | Posts | Book | Why it moves |
| --- | --- | --- | --- |
| Mean sentence length | 13.7 | 13.1 | Same |
| Fragments | 17% | 13.5% | Narrative needs a few more full sentences |
| One-sentence paragraphs | 66% | 63% | Same |
| Contractions per 100 words | 1.8 | 3.8 | Spoken register: "I'm going to", "she's done this", "it'll" |
| I, me, my | 1.9 | 1.1 | The author steps back while the scene plays |
| you, your | 1.8 | 3.3 | One reader, addressed directly |
| Intensifiers | 0.73 | 0.44 | The scene does the emphasis; fewer "really"s |
| Hedges | 0.50 | 0.52 | Same |
| Parentheses | 1.1 | 0.9 | Same; now used for on-the-spot definitions |
| Ellipses | 0.27 | 0.18 | Same |
| Capitals, emoji | 0.32, 0.43 | 0.22, 0.26 | Fewer punchlines per page in a chapter than in a post |
| Dashes | 0 | 0 | Same |

Three habits of the book register that the posts do not show and a drafter must copy: the preview is narrated in the first person ("I'm going to tell you a story about…", never "This chapter introduces…"); a term the story cannot avoid is defined in a parenthesis on the spot, one sentence, with a pointer to the chapter that teaches it ("(A **model** is the file that does the thinking. One file, and you'll open one up in chapter 2.)"); and the author admits the device ("I made Priya up. The afternoon, I suspect, you'll recognise."). Use whole paragraphs of chapters 0 and 1 as the exemplars for later chapters, chosen for voice, as the research above says.

## Avoid list

Your supplied tells, sorted into the category each belongs to, so a drafter avoids the shape and not just the phrase. Wikipedia's Signs of AI writing patterns are merged in where they overlap. The last column says what the posts do instead, which is the real instruction.

| Category | What it does | Your examples | Other members of the category | What the posts do instead |
| --- | --- | --- | --- | --- |
| Performative candour | Announces honesty instead of being direct | genuinely; worth being honest about; says this out loud; is the most honest thing | honestly; to be frank; I'll be direct; let me be clear | States the verdict, then labels it: "My view? It's still important." |
| Manufactured significance | Tells the reader a point matters rather than showing why | worth naming; worth knowing; is the signal worth dwelling on; worth chewing on; worth sitting on; worth reading carefully; hold and carry as weight metaphors (hold onto this, hold that thought, let that hold, carries the argument, the idea carries, carry this with you); is doing work; load-bearing; is real; that actually matters; is earned; earns its keep; rewards closer interrogation | it's important to note; it is worth; serves as a testament; watershed moment; crucially | Gives the number or the thing that happened: "387 blocked attempts in a month" |
| Contrast framing | Negative parallelism that fakes insight | it's not … it's …; stops being … starts being …; not a … not a … but a … (the triple negation before the reveal) | not just X but Y; less about X, more about Y; the question isn't X, it's Y | A plain claim, often a one-word verdict: "Resoundingly, no." |
| Faux revelation | Narrates the writer's own epiphany to borrow weight | that's the part that stopped me; the bit that matters; the unlock is; the part nobody is talking about; the quiet one; quiet win; that catches … off guard; has … I keep coming back to; it does something most … refuse to do; kind of changes nobody writes | here's the thing; what struck me; the real story; a subtle but important | A "Turns out…" followed by the fact, or a question heading answered bluntly |
| Padded evaluation | Adjectives that grade without content | sharp | nuanced; compelling; thoughtful; robust; elegant; powerful | A concrete comparison: "72 lines vs 224" |
| Typographic | Punctuation that signals machine prose | any em dash or en dash | bold lead-in bullets that restate the sentence; excessive bold on names; rule-of-three lists for rhythm | Parentheses for asides, ellipses for pauses, emoji for punchlines |
| Structural | Moves that pad or restate |  | summary paragraph that restates the piece; "in today's fast-paced world" openers; rhetorical question immediately answered by a hedge; trailing "-ing" clauses (ensuring…, highlighting…); vague attribution ("industry reports", "some argue") | Cold open in one line; close with a teaser or an ask; name the source with a link |
| Transitions | Overused connectives |  | moreover; furthermore; additionally; that said; ultimately | "So…", "Then…", or a heading |

**Two things that look like tells but are the author's own.** Rhetorical questions as headings ("Wait what's an agent again?") and the "Turns out…" reveal are both on generic tells lists, and both are in his voice. The difference is what follows: his questions are answered with a verdict and a test, never with a hedge; his "Turns out" introduces a fact he checked. Keep them.

**Caveat from the sources.** Wikipedia's page and the stylometry literature both note that every one of these phrases also appears in human writing; it is frequency and co-occurrence that mark machine prose, not a single instance. Equally, prompting against every item makes text stiff. The practical rule: ban the four categories at the top of the table outright (candour, significance, contrast, revelation), since those are where your list concentrates, and treat the rest as things to notice on a read-through.

## Raw observations from the five posts

Gathered before the framework arrived, so they are organised by what was visible rather than by the final template. Quotes are short fragments; the full posts are linked in Sources. Posts are abbreviated: Frameworks (which agent framework), Opus (Opus-level coding agent), Contact (local model tried to contact), Shouldn't (making AI agents and why you shouldn't), Design (high-quality agents).

| Dimension | What the posts show | Fragments |
| --- | --- | --- |
| Openings | Cold, short, often a question or a one-line scene; sometimes a disclaimer about hand-writing | "So you want to make an agent." (Frameworks) · "AI Agents at the moment are like a tsunami of solution hammers" (Shouldn't) · "This article is a 100% hand-written long-form labour of love" (Opus) |
| Endings | A teaser for the next piece or a direct ask of the reader, then the subscription plea kept separate | "That's for a future article though." (Contact) · "I'd love to get your feedback." (Design) |
| Sentence length | Very wide range: one- or two-word verdicts beside 25 to 30 word compound sentences with parentheticals | "Safe." "Trusted." (Contact) · "Resoundingly, no." (Opus) · "Overhyped, much?" (Shouldn't) |
| Person | I throughout, narrating his own trials; you to the reader; we rarely, for shared predictions | "I remember it well" (Opus) · "You give it a brief" (Frameworks) · "we're going to have decent local AI for coding by EOY" (Opus) |
| Humour | Self-deprecating, mock-defensive, British colloquial; emoji as punctuation | "lazy, gaslighting genius interns" (Opus) · "Wasn't us guv I swear" (Contact) · "Awww MAN this security stuff means MORE WORK for me" (Contact) · "(ok not that kind of agent)" (Design) |
| Evidence | Concrete counts from his own sessions, not formal benchmarks; screenshots and code; what was and wasn't checked stated | 133 solutions, 46 open source, 32 Python; line counts 72 to 224 (Frameworks) · "Benchmarks are lame so I did a few tests with actual sessions" (Opus) · 387 blocked attempts in a month, flagged as not showing distinct sites (Contact) |
| Opinion and hedging | Blunt verdict first, then a scoped hedge; opinion explicitly labelled as his | "This is not a viable business relationship." (Opus) · "My view? It's still important." (Contact) · "Well, no, but sometimes yes." (Shouldn't) · "This is speculation" (Design) |
| Uncertainty | Admitted briefly and moved past; what is unknown named, then the argument proceeds anyway | "I don't know why hXXp was listed like that." (Contact) · "It's possible, but it has some thorny caveats." (Opus) · "Not sure it's there yet" (Shouldn't) |
| Register | Knowledgeable friend at the pub, with precise developer vocabulary when it counts | "PITA", "peeps", "the pub" (Opus) · "stop whining, it doesn't happen very often" (Contact) · "type-safe", "idiomatic" (Frameworks) |
| Structure | News hook or contrarian title, plain definition, then checklist or walkthrough, then forward look; sections stand alone | Question headings: "Wait what's an agent again?" (Shouldn't) · "Geek sidebar: you be the judge" (Contact) · ✅/❌ checklists (Shouldn't) |
| Defining terms | Bold term, plain gloss, paired contrasts; acronym in parentheses once | "Open weights: model file only" vs "Open source: model file, source code and data" (Shouldn't) · ""multi-hop" is the term used for this" (Design) |
| Metaphor | Vivid, physical, slightly absurd; used once per idea, not sustained | "tsunami of solution hammers" (Shouldn't) · "yapping like young pups" (Shouldn't) · "a bit of a brain-bender" (Design) |
| Formatting | Many headings, short paragraphs (1 to 3 sentences), bold lead-ins, bullets, captioned screenshots, ellipses as pauses, a wizard emoji marking recommendations | "Suffice to say" · "Turns out…" · 🧙‍♂️ before recommendations (Opus) |
| Recurring words | Intensifiers: absolutely, really, truly, massive, astonishing, huge; friction, hack, hacky; "Turns out", "So…", "Rinse and repeat", "This is the big one", "Julian's Law" | across all five |
| Reader relationship | Asks for help, feedback and corrections; admits his own code is weak | "Maybe a proper python practitioner or Langgraph expert can improve this." (Frameworks) · "I want to learn from you." (Shouldn't) |

## Sources

**The five posts**

- [Which agent framework should you use? I tried 7](https://makingaiagents.substack.com/p/which-agent-framework-should-you)
- [I'm running an Opus-level coding agent](https://ailocal.substack.com/p/im-running-an-opus-level-coding-agent)
- [A local AI model tried to contact…](https://ailocal.substack.com/p/a-local-ai-model-tried-to-contact)
- [Making AI agents, and why you shouldn't](https://makingaiagents.substack.com/p/making-ai-agents-and-why-you-shouldnt)
- [How to design high-quality AI agents](https://makingaiagents.substack.com/p/how-to-design-high-quality-ai-agents)

**Framework**

- [Nielsen Norman Group, The Four Dimensions of Tone of Voice](https://www.nngroup.com/articles/tone-of-voice-dimensions/) (2016, reviewed 2023). Four spectra: formal vs casual, serious vs funny, respectful vs irreverent, matter-of-fact vs enthusiastic. Does not claim independence.
- [Biber, Dimensions of Register Variation (1995)](<https://jan.ucc.nau.edu/~biber/Biber/Biber%20(1995).pdf>). Multidimensional analysis; dimensions used here: involved vs informational, narrative vs non-narrative.
- Hyland's metadiscourse model (interactional resources: hedges, boosters, attitude markers, self-mention, engagement markers; interactive resources including code glosses), as applied in [this register study](https://ir.unimas.my/id/eprint/36785/). Primary text is Hyland, Metadiscourse (2005), not fetched here.
- [Catch Me If You Can? Not Yet: LLMs Still Struggle to Imitate the Implicit Writing Styles of Everyday Authors](https://arxiv.org/html/2509.14543v1) (2025). Five-shot vs zero-shot, exemplar count and selection, opening-snippet effect.
- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), read via [this summary](https://www.blakestockton.com/takeaways-from-wikipedias-signs-of-ai-writing-2/) because the page itself did not fetch. Negative parallelism, inflated significance, editorialising, conjunctive overuse, trailing -ing clauses, vague attribution, bold and em-dash habits; caveats on false positives and over-correction.

**Measurement.** All rates in the profile were computed on the full text of the five posts as supplied (13,607 words) with a short script: sentence splits on terminal punctuation, fragments counted as sentences under four words, rates per 100 words, headings detected as short unpunctuated lines before a blank line. The humour rate is a hand count. **Not verified here:** the Hyland primary text; GOV.UK and Mailchimp style-guide conventions, which were not consulted.
