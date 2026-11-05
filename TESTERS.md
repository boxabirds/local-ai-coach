# Trying the Mastering Local AI coach

This is an early version for testers. It runs entirely on your own computer: the
coach's checks look at your machine, so it can't run on a website.

## Install

Open Terminal (on a Mac: press Command and Space, type Terminal, press Return) and paste:

```sh
curl -fsSL https://github.com/boxabirds/local-ai-coach/releases/latest/download/install.sh | sh
```

It takes a minute or two. It installs into a folder called `.local-ai-coach` in your
home folder. It doesn't need your password, Homebrew or anything else installed first,
and it checks every download before using it.

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

`make release VERSION=x.y.z` builds `dist/local-ai-coach.tar.gz` and its `.sha256`.
`make release-test` builds, installs from scratch into a temporary home with the real
pinned Node and uv, and runs the browser suite against the installed coach. Publish by
attaching `dist/local-ai-coach.tar.gz`, `dist/local-ai-coach.tar.gz.sha256` and
`install.sh` to a GitHub release.
