# Trying the Mastering Local AI coach

This is an early version for testers. It runs entirely on your own computer: the
coach's checks look at your machine, so it can't run on a website.

## On a Mac: the app

1. On the [latest release](https://github.com/boxabirds/local-ai-coach/releases/latest),
   download `Local-AI-Coach-<version>.dmg`. It works on Apple silicon and Intel Macs.
2. Open it and drag Local AI Coach onto Applications.
3. Double-click Local AI Coach in Applications. The first time, your Mac asks whether to
   open an app downloaded from the internet: choose Open.

The coach opens in your browser once it's ready. A chip icon in the menu bar at the top of
the screen has Open coach, Open logs and Quit Local AI Coach. To update, download the new
version and drag it into Applications again. Your progress is kept, and it's the same
progress as the Terminal install below.

## Your API keys

The coach answers with two hosted services, so you need a key from each:

- An OpenAI key: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- A Jev key: [console.typesafe.ai/keys](https://console.typesafe.ai/keys)

The first time you send the coach a message, it asks for both. Paste them in and save. On a
Mac they're kept in your Keychain, so you enter them once; on Linux they're kept for that
session only. What you use is charged to your own OpenAI and TypeSafe (Jev's maker) accounts.
The keys go only to OpenAI and TypeSafe, never to anyone else.

## Install with Terminal (Mac or Linux)

Open Terminal (on a Mac: press Command and Space, type Terminal, press Return) and paste:

```sh
curl -fsSL https://github.com/boxabirds/local-ai-coach/releases/latest/download/install.sh | sh
```

It downloads one file, checks it, and checks the coach runs on your computer. It installs
into a folder called `.local-ai-coach` in your home folder. It doesn't need your password,
Homebrew, Python or anything else installed first, and it doesn't change any Python you
already have.

## Start it

```sh
local-ai-coach
```

Your browser opens at the coach. Leave the Terminal window open while you use it;
press Ctrl-C there (or close the window) to stop it.

If Terminal says `command not found`, use the full path the installer printed
(`~/.local/bin/local-ai-coach`), or add `~/.local/bin` to your PATH as it suggests.

## Update or remove

- Update: paste the install line again. Your progress is kept.
- Version: `local-ai-coach --version`
- Remove: `local-ai-coach uninstall` (your progress stays in `~/.local-ai-coach`; delete
  that folder too if you want it gone).

## If something goes wrong

- "port 3000 is already in use": something else is using that port. Close it, or start
  with `COACH_APP_PORT=3005 local-ai-coach`.
- The coach's logs are in `~/.local-ai-coach/logs`. Send them with your feedback.

## For maintainers

`make release VERSION=x.y.z` builds one archive per kind of computer,
`dist/local-ai-coach-<platform>.tar.gz` and its `.sha256`, for darwin-arm64, darwin-x64,
linux-x64 and linux-arm64. Each holds the page's server as a single Bun executable for
that computer, and the agent's own Python (CPython 3.12.16 from python-build-standalone)
with its locked packages installed and compiled for that computer (story 32), so testers
download nothing but the archive: no Node, no uv, no Python packages. The build's inputs
are pinned with their SHA-256 in `scripts/build-release.sh` and kept in
`~/.cache/local-ai-coach-release`. `make release-test` builds this machine's archive,
installs it from scratch into a temporary home and runs the browser suite against the
installed coach; with `COACH_RELEASE_ALL_PLATFORMS=1` it also builds all four and checks
each one's Python is built for its own computer. Publish with
`make publish VERSION=x.y.z TITLE="what changed" NOTES=notes.md`: it refuses unless the
tree is committed, main is pushed and the tag is new, then runs `make release-test`,
builds all four archives, and only then creates the GitHub release with every
`dist/local-ai-coach-*.tar.gz`, its `.sha256`, `install.sh` and the Mac app's disk image.
The release runs the real coach. `COACH_STUB=1 local-ai-coach` starts the stub coach (no
model, no keys) from the same install; the release test uses it for the full browser suite.
`COACH_RELEASE_REAL=1 make release-test` also sends one real message through the signed app,
with the keys saved in this Mac's Keychain.
