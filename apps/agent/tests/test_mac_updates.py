"""The Mac app's updater (Ceetrix story 39).

Integration cases build the app from fake release trees (test_mac_app's) with a throwaway
update key made by openssl, and run scripts/make-appcast.sh with it. The end-to-end cases
(COACH_RELEASE_E2E=1, a Developer ID in the keychain, UI scripting allowed) build an old
version and a new one, serve the new one's update list on 127.0.0.1, and drive the old app by
its AppleScript command and its menu, clicking Sparkle's own buttons through System Events.
GitHub is never contacted; Julian's key and ~/.local-ai-coach are never used.
"""

from __future__ import annotations

import http.server
import os
import plistlib
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from xml.etree import ElementTree

import pytest

from tests.test_mac_app import APP_NAME, RunningApp, app_cases, build, fake_tree, signing_identity, snapshot, throwaway_key, write_exe, FAKE_SHELL, session_env

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="the app is a Mac app")

REPO = Path(__file__).resolve().parents[3]
MAKE_APPCAST = REPO / "scripts" / "make-appcast.sh"
SIGN_UPDATE = REPO / "apps" / "mac" / ".build" / "artifacts" / "sparkle" / "Sparkle" / "bin" / "sign_update"
OLD, NEW = "0.0.1", "0.0.2"
DMG = "Local-AI-Coach-{}.dmg"
DAY = 86400
FOUND, UP_TO_DATE = "update found ", "up to date"
# The words of Sparkle's window when a signature fails, for the update list and the disk image alike.
REFUSED = "improperly signed"
UPDATE_WAIT = 120
INSTALL_WAIT = 180
CLICK_WAIT = 60
NOTES = "## A made-up release\n\n- A made-up change.\n"


def appcast(version: str, dmg: Path, out: Path, key: tuple[Path, Path], downloads: str = "http://127.0.0.1:1") -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "SPARKLE_KEY_FILE": str(key[0]), "COACH_SPARKLE_PUBLIC_KEY": str(key[1]), "COACH_RELEASE_DOWNLOADS": downloads}
    notes = out.parent / "notes.md"
    notes.write_text(NOTES)
    return subprocess.run(["bash", str(MAKE_APPCAST), version, str(dmg), str(notes), str(out)], env=env, capture_output=True, text=True, timeout=300, check=False)


def enclosure(xml: str) -> dict[str, str]:
    tag = re.search(r"<enclosure ([^>]*)>", xml)
    assert tag, xml
    return dict(re.findall(r'([\w:]+)="([^"]*)"', tag.group(1)))


# ---------------------------------------------------------------- the built bundle (TC-04)
@pytest.fixture(scope="module")
def keyed(tmp_path_factory) -> tuple[Path, tuple[Path, Path]]:
    dist = tmp_path_factory.mktemp("dist")
    key = throwaway_key(tmp_path_factory.mktemp("key"))
    fake_tree(dist)
    result = build(dist, public_key=key[1])
    assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-2000:]
    return dist / APP_NAME, key


@app_cases
def test_tc04_the_bundle_carries_sparkle_its_key_and_the_settings(keyed):
    app, key = keyed
    info = plistlib.loads((app / "Contents" / "Info.plist").read_bytes())
    assert info["SUPublicEDKey"] == key[1].read_text().strip()
    assert info["SUEnableAutomaticChecks"] is True and info["SUScheduledCheckInterval"] == DAY
    assert info["SURequireSignedFeed"] is True and info["SUVerifyUpdateBeforeExtraction"] is True
    # Nothing about the tester or their Mac is sent, and nothing installs without them.
    assert info["SUSendProfileInfo"] is False and info["SUAllowsAutomaticUpdates"] is False
    assert info["NSAppleScriptEnabled"] is True
    assert (app / "Contents" / "Resources" / info["OSAScriptingDefinition"]).is_file()
    framework = app / "Contents" / "Frameworks" / "Sparkle.framework"
    assert (framework / "Versions" / "B" / "Sparkle").is_file()
    rpaths = subprocess.run(["otool", "-l", str(app / "Contents" / "MacOS" / "LocalAICoach")], capture_output=True, text=True, check=True).stdout
    assert "@executable_path/../Frameworks" in rpaths
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True, capture_output=True)


@app_cases
def test_tc04_a_missing_or_malformed_public_key_builds_nothing(tmp_path):
    fake_tree(tmp_path)
    missing = build(tmp_path, public_key=tmp_path / "none")
    assert missing.returncode == 1 and "sparkle-key.sh" in missing.stderr
    bad = tmp_path / "bad-key"
    bad.write_text("not a key\n")
    malformed = build(tmp_path, public_key=bad)
    assert malformed.returncode == 1 and "Ed25519" in malformed.stderr
    assert not (tmp_path / APP_NAME).exists()


# ---------------------------------------------------------------- the update list (TC-05 to TC-07)
@pytest.fixture
def made_up_dmg(tmp_path) -> Path:
    dmg = tmp_path / DMG.format(NEW)
    dmg.write_bytes(os.urandom(4096))
    return dmg


def test_tc05_the_update_list_names_the_version_and_its_signed_disk_image(tmp_path, made_up_dmg):
    key = throwaway_key(tmp_path / "key")
    out = tmp_path / "appcast.xml"
    result = appcast(NEW, made_up_dmg, out, key, downloads="https://example.test/releases/download")
    assert result.returncode == 0, result.stderr
    xml = out.read_text()
    assert f"<sparkle:version>{NEW}</sparkle:version>" in xml
    assert "A made-up change." in xml and 'sparkle:format="markdown"' in xml
    attrs = enclosure(xml)
    assert attrs["url"] == f"https://example.test/releases/download/v{NEW}/{made_up_dmg.name}"
    assert attrs["length"] == str(made_up_dmg.stat().st_size)
    verify = subprocess.run([str(SIGN_UPDATE), "--verify", "--ed-key-file", str(key[0]), str(made_up_dmg), attrs["sparkle:edSignature"]], capture_output=True, text=True, check=False)
    assert verify.returncode == 0, verify.stderr
    # The list itself is signed: the app refuses an unsigned one.
    assert "sparkle-signatures:" in xml and "edSignature:" in xml.split("sparkle-signatures:")[1]


def test_tc05_release_notes_cannot_end_their_section(tmp_path, made_up_dmg):
    key = throwaway_key(tmp_path / "key")
    out = tmp_path / "appcast.xml"
    env = {**os.environ, "SPARKLE_KEY_FILE": str(key[0]), "COACH_SPARKLE_PUBLIC_KEY": str(key[1])}
    notes = tmp_path / "tricky.md"
    notes.write_text("made up ]]> <item>not an item</item>\n")
    result = subprocess.run(["bash", str(MAKE_APPCAST), NEW, str(made_up_dmg), str(notes), str(out)], env=env, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    items = ElementTree.parse(out).getroot().findall("./channel/item")
    assert len(items) == 1
    assert items[0].findtext("description").strip() == "made up ]]> <item>not an item</item>"


def test_tc06_no_key_writes_no_update_list(tmp_path, made_up_dmg):
    key = throwaway_key(tmp_path / "key")
    out = tmp_path / "appcast.xml"
    result = appcast(NEW, made_up_dmg, out, (tmp_path / "no-such-key", key[1]))
    assert result.returncode != 0 and "no-such-key" in result.stderr
    assert not out.exists()


def test_tc07_a_key_that_does_not_match_the_apps_writes_no_update_list(tmp_path, made_up_dmg):
    mine, other = throwaway_key(tmp_path / "mine"), throwaway_key(tmp_path / "other")
    out = tmp_path / "appcast.xml"
    result = appcast(NEW, made_up_dmg, out, (other[0], mine[1]))
    assert result.returncode != 0 and "doesn't match" in result.stderr
    assert not out.exists()


# ---------------------------------------------------------------- publish (TC-15)
def test_tc15_publish_checks_the_update_key_first_and_uploads_the_update_list(tmp_path):
    notes = tmp_path / "notes.md"
    notes.write_text("made up")
    dry = subprocess.run(["make", "-n", "publish", "VERSION=9.9.9-test", "TITLE=made up", f"NOTES={notes}"], cwd=REPO, capture_output=True, text=True, check=False)
    lines = dry.stdout.splitlines()

    def first(fragment: str) -> int:
        return next(i for i, line in enumerate(lines) if fragment in line)

    key, tested, mac = first("sparkle_check_key"), first("test_release.py"), first("build-mac-app.sh")
    cast, upload = first("make-appcast.sh"), first("gh release create")
    assert key < tested < mac < cast < upload, dry.stdout
    assert "appcast.xml" in lines[upload]


def test_tc15_sparkle_check_fails_without_the_key(tmp_path):
    env = {**os.environ, "SPARKLE_KEY_FILE": str(tmp_path / "missing")}
    result = subprocess.run(["make", "-s", "sparkle-check"], cwd=REPO, env=env, capture_output=True, text=True, check=False)
    assert result.returncode != 0 and "missing" in result.stderr


def test_sparkle_key_refuses_to_replace_a_key(tmp_path):
    existing = tmp_path / "sparkle_ed25519"
    existing.write_text("made up\n")
    env = {**os.environ, "SPARKLE_KEY_FILE": str(existing), "COACH_SPARKLE_PUBLIC_KEY": str(tmp_path / "pub")}
    result = subprocess.run(["bash", str(REPO / "scripts" / "sparkle-key.sh")], env=env, capture_output=True, text=True, check=False)
    assert result.returncode == 1 and "not replacing" in result.stderr
    assert existing.read_text() == "made up\n" and not (tmp_path / "pub").exists()


def test_sparkle_key_makes_a_matching_pair(tmp_path):
    env = {**os.environ, "SPARKLE_KEY_FILE": str(tmp_path / "k" / "sparkle_ed25519"), "COACH_SPARKLE_PUBLIC_KEY": str(tmp_path / "pub")}
    result = subprocess.run(["bash", str(REPO / "scripts" / "sparkle-key.sh")], env=env, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "k" / "sparkle_ed25519").stat().st_mode & 0o777 == 0o600
    dmg = tmp_path / "a.dmg"
    dmg.write_bytes(b"made up")
    cast = appcast(NEW, dmg, tmp_path / "appcast.xml", (tmp_path / "k" / "sparkle_ed25519", tmp_path / "pub"))
    assert cast.returncode == 0, cast.stderr


# ---------------------------------------------------------------- end to end (TC-09 to TC-14)
e2e = pytest.mark.skipif(os.environ.get("COACH_RELEASE_E2E") != "1", reason="set COACH_RELEASE_E2E=1 (signs two apps and installs one over the other)")


class Feed:
    """A folder served on 127.0.0.1, recording each path asked for."""

    def __init__(self, root: Path):
        self.asked: list[str] = []
        feed = self

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(root), **kwargs)

            def do_GET(self):
                feed.asked.append(self.path)
                super().do_GET()

            def log_message(self, *args):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()


@pytest.fixture(scope="module")
def two_versions(tmp_path_factory):
    """The old app and the new version's signed disk image, both from this repo, one key."""
    if not signing_identity():
        pytest.skip("no Developer ID: Sparkle installs only an update signed like the running app")
    key = throwaway_key(tmp_path_factory.mktemp("key"))
    built = {}
    for version in (OLD, NEW):
        dist = tmp_path_factory.mktemp(f"dist-{version}")
        tree = fake_tree(dist, version=version)
        # Signing expects the page server; any Mach-O file stands in for it.
        shutil.copy("/bin/sleep", tree / "bin" / "coach-web")
        result = build(dist, "--sign", version=version, public_key=key[1])
        assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-2000:]
        built[version] = dist
    return built, key


def serve(tmp_path: Path, two_versions, version: str = NEW) -> Feed:
    built, key = two_versions
    root = tmp_path / "feed"
    (root / f"v{version}").mkdir(parents=True)
    shutil.copy(built[version] / DMG.format(version), root / f"v{version}" / DMG.format(version))
    feed = Feed(root)
    result = appcast(version, built[version] / DMG.format(version), root / "appcast.xml", key, downloads=feed.url)
    assert result.returncode == 0, result.stderr
    return feed


def start_old(tmp_path: Path, two_versions, feed: Feed) -> tuple[RunningApp, Path, dict[str, str]]:
    built, _ = two_versions
    app = tmp_path / "Applications" / APP_NAME
    app.parent.mkdir()
    subprocess.run(["ditto", str(built[OLD] / APP_NAME), str(app)], check=True)
    home = tmp_path / "home"
    home.mkdir()
    shell = tmp_path / "login-shell"
    write_exe(shell, FAKE_SHELL)
    env = {**session_env(), "HOME": str(home), "COACH_HOME": str(home / ".local-ai-coach"), "SHELL": str(shell), "COACH_UPDATE_FEED": f"{feed.url}/appcast.xml"}
    running = RunningApp(app, env)
    running.ready()
    return running, app, env


def wait_line(app: RunningApp, prefix: str, timeout: float = UPDATE_WAIT) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        hit = next((line for line in app.lines if line.startswith(prefix)), None)
        if hit:
            return hit
        time.sleep(0.2)
    pytest.fail(f"no '{prefix}' line:\n" + "\n".join(app.lines[-30:]))


def ask_by_applescript(app: Path) -> None:
    subprocess.run(["osascript", "-e", f'tell application "{app}" to check for updates'], check=True, capture_output=True, timeout=CLICK_WAIT)


def system_events(pid: int, script: str) -> str:
    """Runs `script` inside `tell process` for the app with this pid."""
    full = f'tell application "System Events" to tell (first process whose unix id is {pid})\n{script}\nend tell'
    return subprocess.run(["osascript", "-e", full], capture_output=True, text=True, timeout=CLICK_WAIT, check=False).stdout.strip()


def click_when_there(pid: int, button: str, timeout: float = INSTALL_WAIT) -> None:
    """Clicks Sparkle's button with this name, once enabled, in whichever of the app's windows has it.
    Install and Relaunch is in the download window, disabled, before the download ends."""
    deadline = time.monotonic() + timeout
    script = f'repeat with w in windows\nif exists button "{button}" of w then\nif enabled of button "{button}" of w then\nclick button "{button}" of w\nreturn "clicked"\nend if\nend if\nend repeat\nreturn ""'
    while time.monotonic() < deadline:
        if system_events(pid, script) == "clicked":
            return
        time.sleep(1)
    pytest.fail(f"no {button} button appeared")


def wait_for_words(pid: int, words: str, timeout: float = UPDATE_WAIT) -> None:
    """Waits until one of the app's windows shows these words: what the tester reads."""
    deadline = time.monotonic() + timeout
    seen = ""
    while time.monotonic() < deadline:
        seen = system_events(pid, "return value of static texts of windows")
        if words in seen:
            return
        time.sleep(1)
    pytest.fail(f"no window said '{words}'; last seen: {seen}")


def version_on_disk(app: Path) -> str:
    return plistlib.loads((app / "Contents" / "Info.plist").read_bytes())["CFBundleShortVersionString"]


@e2e
def test_tc09_tc10_found_by_applescript_and_installed_leaving_progress_alone(tmp_path, two_versions):
    feed = serve(tmp_path, two_versions)
    running, app, env = start_old(tmp_path, two_versions, feed)
    home = Path(env["COACH_HOME"])
    before = snapshot(home)
    try:
        ask_by_applescript(app)
        assert wait_line(running, FOUND) == FOUND + NEW
        assert "/appcast.xml" in feed.asked
        click_when_there(running.process.pid, "Install Update")
        click_when_there(running.process.pid, "Install and Relaunch")
        # Started with --no-open, the app isn't relaunched: Sparkle installs once whoever
        # started it quits it, as the release test does here.
        assert running.quit() == 0
        deadline = time.monotonic() + INSTALL_WAIT
        while version_on_disk(app) != NEW and time.monotonic() < deadline:
            time.sleep(1)
        assert version_on_disk(app) == NEW, (running.process.poll(), feed.asked, running.lines[-20:])
        assert f"/v{NEW}/{DMG.format(NEW)}" in feed.asked
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True, capture_output=True)
        assert snapshot(home) == before
    finally:
        running.quit()
        feed.close()


@e2e
def test_tc11_tc12_the_menu_item_on_the_same_version_says_up_to_date(tmp_path, two_versions):
    built, key = two_versions
    root = tmp_path / "feed"
    root.mkdir()
    feed = Feed(root)
    assert appcast(OLD, built[OLD] / DMG.format(OLD), root / "appcast.xml", key, downloads=feed.url).returncode == 0
    running, app, _ = start_old(tmp_path, two_versions, feed)
    try:
        # The menu-bar item, clicked as a tester would (TC-12).
        clicked = system_events(running.process.pid, 'click menu bar item 1 of menu bar 1\nclick menu item "Check for updates…" of menu 1 of menu bar item 1 of menu bar 1\nreturn "clicked"')
        assert clicked == "clicked"
        wait_line(running, UP_TO_DATE)
        assert not any(path.endswith(".dmg") for path in feed.asked)
        assert version_on_disk(app) == OLD
    finally:
        running.quit()
        feed.close()


@e2e
def test_tc13_an_unsigned_update_list_is_refused(tmp_path, two_versions):
    feed = serve(tmp_path, two_versions)
    cast = tmp_path / "feed" / "appcast.xml"
    cast.write_text(cast.read_text().split("<!-- sparkle-signatures:")[0])
    running, app, _ = start_old(tmp_path, two_versions, feed)
    try:
        ask_by_applescript(app)
        wait_for_words(running.process.pid, REFUSED)
        assert not any(line.startswith(FOUND) for line in running.lines)
        assert not any(path.endswith(".dmg") for path in feed.asked)
        assert version_on_disk(app) == OLD
    finally:
        running.quit()
        feed.close()


@e2e
def test_tc14_a_disk_image_changed_after_signing_is_not_installed(tmp_path, two_versions):
    feed = serve(tmp_path, two_versions)
    served = tmp_path / "feed" / f"v{NEW}" / DMG.format(NEW)
    data = bytearray(served.read_bytes())
    data[len(data) // 2] ^= 0xFF  # same length, one byte changed
    served.write_bytes(bytes(data))
    running, app, _ = start_old(tmp_path, two_versions, feed)
    try:
        ask_by_applescript(app)
        wait_line(running, FOUND)
        click_when_there(running.process.pid, "Install Update")
        wait_for_words(running.process.pid, REFUSED, timeout=INSTALL_WAIT)
        assert version_on_disk(app) == OLD
    finally:
        running.quit()
        feed.close()
