# Handoff

Unpack this at the root of boxabirds/local-ai-coach (after `git reset --hard upstream/main`). It adds CLAUDE.md, docs/, curriculum/ and panel/; it overwrites upstream's CLAUDE.md and nothing else.

Then, in the repo:

    claude

First prompt:

    Read CLAUDE.md and docs/design.md. Start build step 1 (curriculum contract and validator) in plan mode; stop and show me the plan before writing code.

Before step 4 you need an OpenAI key and a TypeSafe key for testing, and someone should read node_modules/@copilotkit/license-verifier once it is installed.
