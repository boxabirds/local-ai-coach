# Installing the coach on a Mac like any other app (2026-11-06)

Asked by Julian: what is the easiest way for a semi-technical person to install the whole coach? Mac users expect "drag this icon into Applications": (a) the drag installs it, (b) a double-click starts it, so early users can give feedback. Bun migration is welcome if it makes this simpler.

This is an investigation. Nothing here is built yet.

## What has to be on the learner's Mac

| Piece | Today | Size today |
|---|---|---|
| The agent (Python 3.12: FastAPI, LangGraph, deepagents, LangChain) | `uv run uvicorn` from the repo | 109 MB of packages, plus Python itself |
| The app (React page and its server) | `make serve`: `Bun.build` then `bun server.ts` (story 31) | one executable from `bun build --compile` (61 MB, 26 MB compressed with the page) plus the built page; no Node, no `node_modules` |
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
A `.app` whose executable is a short program that, on first launch, uses a bundled `uv` to install Python and the agent's packages into `~/Library/Application Support/Local AI Coach/`, then starts the agent and the web server, and opens the browser. Node also has to be bundled. Needs the internet on first launch (for Python packages), unless they are bundled too.
- For: no migration.
- Against: two runtimes to bundle (Node and Python), a large download, many moving parts.

### 2. The same launcher after the Bun migration (recommended)
Done in story 31: `bun build --compile` turns the web server (routes and the CopilotKit runtime) into **one executable file** with no Node and no `node_modules`; the built page is a folder of static files beside it. The app bundle then holds:
- `coach-web` (the Bun binary),
- the agent's source and its Python: since story 32 the release archive carries a standalone CPython 3.12 with the locked packages installed and compiled, so there is no `uv` and nothing to set up on first launch,
- a launcher that starts both on free ports bound to 127.0.0.1, opens the page, and shows a menu-bar icon with Open and Quit.
- For: one runtime fewer, a much smaller app, and the web side becomes a single file that is easy to sign.
- Against: none left; the Bun migration is done.

### 3. A desktop shell (Tauri or Electron)
Tauri (a native webview plus "sidecar" processes) or Electron (bundles Chromium) give a real window instead of a browser tab. Both still have to ship and start the agent as a sidecar. Electron adds a whole browser. Tauri adds a Rust toolchain to the build.
- For: feels most like an app.
- Against: more to build and maintain than a launcher, for little gain at the feedback stage.

## The launcher itself

For options 1 and 2: a small Swift program (no dependencies), about one screen of code, that:
1. picks two free ports, starts the agent and the web server bound to 127.0.0.1, and waits until both answer;
2. opens the coach in the default browser;
3. puts an icon in the menu bar with Open coach and Quit (Quit stops both servers);
4. writes its logs to `~/.local-ai-coach/logs/`.

The release script builds the `.app`, signs it, optionally notarises it, and wraps it in a `.dmg` with the usual Applications shortcut, so the learner sees the familiar drag-to-install window.

## Order, if Julian goes ahead

1. ~~The Bun migration~~ (done, story 31).
2. The launcher and a `.dmg` for friendly testers, unsigned, with the Open Anyway paragraph.
3. Signing and notarisation, once it goes beyond friendly testers.
4. ~~Bundled Python for offline install~~ (done, story 32: the archive carries it).

## Signing and notarising: reuse macscreencap's pipeline

Julian already signs and notarises Cutaway (`~/expts/macscreencap`: `ScreencapMenuBar/build-app.sh` and `scripts/release.sh`). The coach reuses the same pieces, so testers get a normal, notarised download from the start:

- the Developer ID Application certificate in the login Keychain (found with `security find-identity -v -p codesigning`), and the stored `notarytool-profile`;
- sign inside out: every nested executable first (here the Bun binary, the bundled `python3.12`, and every `.so` and `.dylib` in the bundled Python), each with `codesign --force --options runtime --timestamp`, then the app with its entitlements, then `codesign --verify --deep --strict`;
- zip, `xcrun notarytool submit … --keychain-profile notarytool-profile --wait`, `xcrun stapler staple`;
- the `.dmg` built with `hdiutil`, signed, notarised and stapled the same way;
- later, Sparkle and an appcast for updates, as Cutaway does.

Two things differ from Cutaway:

1. **The Bun binary needs JIT entitlements** under the hardened runtime (its JavaScript engine compiles code at run time). As far as I recall Bun's documentation lists `com.apple.security.cs.allow-jit` and related entitlements for compiled executables; to be confirmed when it is first signed.
2. **The bundled Python has many native files.** Since story 32 Python and the packages are in the archive, so every `.so` and `.dylib` in it must be signed too, which is exactly the "sign nested binaries" loop Cutaway's script already has. Nothing is downloaded at first launch, so everything that runs is covered by notarisation.

## Decisions that are Julian's

1. ~~Browser tab (launcher) or a real window (Tauri)?~~ Browser tab for the first version (Julian, 2026-11-06).
2. ~~Unsigned for the first testers, or a Developer ID from the start?~~ Signed and notarised from the start, with macscreencap's pipeline (Julian, 2026-11-06).
3. ~~The Bun migration?~~ Done (Julian, 2026-11-06; story 31). The release already ships the web side as one Bun executable per platform.
4. ~~The icon?~~ `docs/design/icons/round-4/14-chip-tick.svg` for now (Julian, 2026-11-06). It is the browser tab's icon (`apps/app/public/icon.svg`, black on light tabs, white on dark), and will be the menu-bar and app icon when the launcher is built.
