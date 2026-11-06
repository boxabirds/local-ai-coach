# Installing the coach on a Mac like any other app (2026-11-06)

Asked by Julian: what is the easiest way for a semi-technical person to install the whole coach? Mac users expect "drag this icon into Applications": (a) the drag installs it, (b) a double-click starts it, so early users can give feedback. Bun migration is welcome if it makes this simpler.

This is an investigation. Nothing here is built yet.

## What has to be on the learner's Mac

| Piece | Today | Size today |
|---|---|---|
| The agent (Python 3.12: FastAPI, LangGraph, deepagents, LangChain) | `uv run uvicorn` from the repo | 109 MB of packages, plus Python itself |
| The app (Next.js) | `next dev` or `next start` from the repo | 1.3 GB of `node_modules` for development; a production build is 148 MB but still needs Node and its runtime packages |
| The learner's files | `~/.local-ai-coach/` (progress, ratings, logs) | small |
| Keys | the login Keychain, through `/usr/bin/security` | none |
| Probes | `lsof`, `ps`, `tailscale` and friends, all on the Mac already | none |

Nothing needs admin rights; everything runs as the learner, on 127.0.0.1.

## The honest bits about the Mac

1. **Dragging into Applications installs nothing.** It is a plain copy and runs no code. Whatever setup is needed happens the first time the app is opened. So "a) the drag installs" becomes "the first launch finishes the install, with a progress window", which is what Mac users see from most apps anyway.
2. **Gatekeeper.** An app downloaded from the internet that isn't signed with an Apple Developer ID and notarised by Apple is blocked. Since macOS 15 (Sequoia) the old right-click and Open trick is gone: the learner has to go to System Settings, Privacy & Security, and press Open Anyway. For a handful of friendly early users that is a one-time paragraph in the email. For anyone else it needs a paid Apple Developer membership, signing and notarisation, which can be automated in the release script.
3. **A server needs a way to stop.** A double-click that starts two servers and opens the browser leaves nothing to quit. The app needs a small menu-bar icon (Open coach, Quit) or a window.
4. **Ports.** If 3000 or 8123 is taken, the app must pick free ports and tell the page which ones.

## Three ways to build it

### 1. A small launcher app around today's stack
A `.app` whose executable is a short program that, on first launch, uses a bundled `uv` to install Python and the agent's packages into `~/Library/Application Support/Local AI Coach/`, then starts the agent and `next start`, and opens the browser. Node also has to be bundled. Needs the internet on first launch (for Python packages), unless they are bundled too.
- For: no migration.
- Against: two runtimes to bundle (Node and Python), a large download, many moving parts.

### 2. The same launcher after the Bun migration (recommended)
With the app moved off Next.js (see the CopilotKit check: its runtime has a plain `Request` to `Response` handler, and 12 of our 13 routes need no change), `bun build --compile` turns the whole web side (server, routes, CopilotKit runtime, built page) into **one executable file** with no Node and no `node_modules`. The app bundle then holds:
- `coach-web` (the Bun binary),
- the agent's source and lockfile, plus the `uv` binary,
- a launcher that runs `uv sync` once (it fetches a standalone Python 3.12 and the locked packages into Application Support), then starts both on free ports bound to 127.0.0.1, opens the page, and shows a menu-bar icon with Open and Quit.

Later, Python can be bundled too (a relocatable standalone Python with the packages preinstalled), so the first launch needs no internet. That makes the download bigger.
- For: one runtime fewer, a much smaller app, and the web side becomes a single file that is easy to sign.
- Against: needs the Bun migration first.

### 3. A desktop shell (Tauri or Electron)
Tauri (a native webview plus "sidecar" processes) or Electron (bundles Chromium) give a real window instead of a browser tab. Both still have to ship and start the agent as a sidecar. Electron adds a whole browser. Tauri adds a Rust toolchain to the build.
- For: feels most like an app.
- Against: more to build and maintain than a launcher, for little gain at the feedback stage.

## The launcher itself

For options 1 and 2: a small Swift program (no dependencies), about one screen of code, that:
1. on first launch, shows "Setting up the coach…" with a progress bar while `uv sync` runs, and says so plainly if there is no internet;
2. picks two free ports, starts the agent and the web server bound to 127.0.0.1, and waits until both answer;
3. opens the coach in the default browser;
4. puts an icon in the menu bar with Open coach and Quit (Quit stops both servers);
5. writes its logs to `~/.local-ai-coach/logs/`.

The release script builds the `.app`, signs it, optionally notarises it, and wraps it in a `.dmg` with the usual Applications shortcut, so the learner sees the familiar drag-to-install window.

## Order, if Julian goes ahead

1. The Bun migration (its own proposal and story; the styling proof first).
2. The launcher and a `.dmg` for friendly testers, unsigned, with the Open Anyway paragraph.
3. Signing and notarisation, once it goes beyond friendly testers.
4. Bundled Python for offline install, if testers have trouble with the first launch.

## Signing and notarising: reuse macscreencap's pipeline

Julian already signs and notarises Cutaway (`~/expts/macscreencap`: `ScreencapMenuBar/build-app.sh` and `scripts/release.sh`). The coach reuses the same pieces, so testers get a normal, notarised download from the start:

- the Developer ID Application certificate in the login Keychain (found with `security find-identity -v -p codesigning`), and the stored `notarytool-profile`;
- sign inside out: every nested executable first (here the Bun binary and the `uv` binary), each with `codesign --force --options runtime --timestamp`, then the app with its entitlements, then `codesign --verify --deep --strict`;
- zip, `xcrun notarytool submit … --keychain-profile notarytool-profile --wait`, `xcrun stapler staple`;
- the `.dmg` built with `hdiutil`, signed, notarised and stapled the same way;
- later, Sparkle and an appcast for updates, as Cutaway does.

Two things differ from Cutaway:

1. **The Bun binary needs JIT entitlements** under the hardened runtime (its JavaScript engine compiles code at run time). As far as I recall Bun's documentation lists `com.apple.security.cs.allow-jit` and related entitlements for compiled executables; to be confirmed when it is first signed.
2. **The Python packages are not in the bundle.** `uv` installs them into Application Support on first launch, so notarisation covers only what we ship. Files `uv` downloads are not quarantined, so Gatekeeper does not check them. If Python is bundled later for offline installs, every `.so` and `.dylib` in it must be signed too, which is exactly the "sign nested binaries" loop Cutaway's script already has.

## Decisions that are Julian's

1. Browser tab (launcher) or a real window (Tauri)?
2. ~~Unsigned for the first testers, or a Developer ID from the start?~~ Signed and notarised from the start, with macscreencap's pipeline (Julian, 2026-11-06).
3. The Bun migration, and with it retiring the two V1 rules (upstream stack unchanged; the do-not-touch runtime route).
