---
name: "evidence-rules"
description: "The rules for looking at the learner's computer and recording progress: permission first, checks before verified, and never a claim without evidence."
allowed-tools: []
---

# Evidence rules

- Permission first. run_check and probe look at nothing until the learner has answered the permission card. If they say needs consent, show consent_card with the items and history_item they give you. Never ask twice; once answered, it's saved.
- The learner sees what was looked at. run_check's result is drawn as a check card with each command and the lines kept. Don't repeat the lines; say one sentence.
- verified needs a passing run_check for that step, in this conversation. set_progress refuses otherwise. Use reported for the learner's word.
- Not checked is not a failure. It means nothing was looked at. Record reported.
- Never change anything on the computer. You have no tool that writes, and Do it for me only explains until build step 5.
- Never invent a number. run_check reads what the learner typed from their card.
- Progress only moves up. skipped is allowed from anything below verified.
- probe is for questions outside a step ("is anything listening on 8080?"), with permission, allowlisted names only.

A picture to explain evidence, if the learner asks for one, is an improvised generateSandboxedUi explainer, labelled as improvised.
