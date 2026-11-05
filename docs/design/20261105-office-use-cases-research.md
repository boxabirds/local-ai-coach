# Research: which office jobs people find local AI most compelling for

Done 2026-11-05 for the job table (`20261105-pedagogical-flow-proposal.md`, sections 9 and 10). Seven web searches. **The evidence is thin:** most sources are vendors selling local AI, with a stake in the answer. Independent sources: one academic study of r/LocalLLaMA (hobbyists and developers, not office workers) and Thomson Reuters surveys of professionals (about AI concerns generally, not local AI). I found no survey of office workers' local AI use.

## What recurs across sources

| Job | Who it's pitched to | Fit with "control, not cost" |
|---|---|---|
| Summarise long confidential documents (contracts, case files, tax returns, session notes) | lawyers, accountants, therapists | strong; the most cited job |
| First drafts of routine documents (client letters, engagement letters) | lawyers | strong; Priya's letter |
| Compare two versions of a document, flag unusual clauses | lawyers | strong; a natural first tool for a coding agent to build |
| Redact a document locally, then use a hosted AI on the redacted version | everyone | fits the book's honesty: hosted AI is better, so keep it, and control what it sees |
| Ask questions of your own documents (retrieval) | small businesses | medium; needs later stations (`rag`, `grounding`) |
| Coding on code you can't share | developers | medium; not office work |

## Limits the sources themselves name

- No access to case-law databases (Westlaw, LexisNexis) from a local model, so legal research stays hosted.
- 8B-class models "miss nuance" on complex contracts; 32B to 70B suggested for real legal drafting (one blog's claim, unmeasured). Agrees with our letter run.
- Everything needs a human check. Agrees with "You're accountable".
- "Your data stays local" marketing often doesn't say where prompts and logs are stored. That's the book's chapter 5 proof.
- Redaction is best effort; nobody guarantees it catches everything.

## Independent findings

- Thomson Reuters (2025, 1,702 professionals): privacy, confidentiality, data security and accuracy are the main risk concerns.
- North Carolina Bar Association summary of 2025 to 2026 surveys: 57% of solo and 55% of small firms have no AI policy, and many use generic consumer tools.
- r/LocalLLaMA study (arXiv 2606.22211, June 2026): adoption driven by autonomy, local control, privacy, reliability and resistance to platform instability; held back by steep learning curves and performance gaps with closed systems. Only the abstract and early sections were read.

## Sources

- https://arxiv.org/abs/2606.22211
- https://www.thomsonreuters.com/content/dam/ewp-m/documents/thomsonreuters/en/pdf/reports/2025-generative-ai-in-professional-services-report-tr5433489-rgb.pdf
- https://www.ncbar.org/nc-lawyer/2026-05/by-the-numbers-what-surveys-show-about-law-firm-ai-adoption/
- https://insiderllm.com/guides/local-ai-for-lawyers/ (vendor-adjacent guide)
- https://www.mayhemcode.com/2026/04/best-local-llm-for-lawyers-heres-what.html (blog)
- https://innerzero.com/blog/private-ai-for-lawyers (vendor)
- https://mljourney.com/local-llm-for-healthcare-legal-and-finance-a-professional-privacy-guide/ (blog)
- https://jupid.com/blog/local-llm-for-accounting (vendor)
- https://elephas.app/resources/ai-tools-keep-client-data-private (vendor)
- http://www.workinprivate.com/for-therapists/ (vendor)
- https://www.uclab.ai/blog/local-llm-business-guide-2026 (vendor)
- https://news.lavx.hu/article/safeprompt-redactor-protecting-your-data-in-the-age-of-ai-chatbots
- https://discuss.huggingface.co/t/local-redaction-of-gpt-queries/134696
