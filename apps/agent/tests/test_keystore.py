"""Keys kept in the macOS Keychain, the routes that manage them, and their use per request
(Ceetrix story 16, TC-01 to TC-14, TC-17 to TC-20).

The Keychain is replaced by FakeKeychain (an injected runner that behaves like
/usr/bin/security) except in TC-09, which uses this Mac's real Keychain under a throwaway
service name and removes it afterwards. Keys are shaped like real ones and generated per test.
"""

from __future__ import annotations

import asyncio
import secrets
import shlex
import string
import subprocess
import sys
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.coach import keystore, stored_keys

ALNUM = string.ascii_letters + string.digits


def openai_key() -> str:
    return "sk-proj-" + "".join(secrets.choice(ALNUM) for _ in range(48))


def jev_key() -> str:
    return "".join(secrets.choice(ALNUM) for _ in range(40))


class FakeKeychain:
    """Answers the security commands keystore sends; records every argv and stdin."""

    def __init__(self, *, refuse_write=False, corrupt=None, timeout=False):
        self.items: dict[tuple[str, str], str] = {}
        self.calls: list[tuple[list[str], str | None]] = []
        self.refuse_write, self.corrupt, self.timeout = refuse_write, corrupt, timeout

    def __call__(self, argv, *, input=None, **kwargs):
        self.calls.append((list(argv), input))
        if self.timeout:
            raise subprocess.TimeoutExpired(argv, keystore.TIMEOUT_S)
        args = argv[1:]
        if args == ["-i"]:
            if self.refuse_write:
                return subprocess.CompletedProcess(argv, 1, "", "")
            for line in (input or "").splitlines():
                words = shlex.split(line)
                service, account, value = words[words.index("-s") + 1], words[words.index("-a") + 1], words[words.index("-w") + 1]
                self.items[(service, account)] = self.corrupt or value
            return subprocess.CompletedProcess(argv, 0, "", "")
        command, service, account = args[0], args[args.index("-s") + 1], args[args.index("-a") + 1]
        if command == "find-generic-password":
            if (service, account) in self.items:
                return subprocess.CompletedProcess(argv, 0, self.items[(service, account)] + "\n", "")
            return subprocess.CompletedProcess(argv, 44, "", "not found")
        if command == "delete-generic-password":
            found = self.items.pop((service, account), None)
            return subprocess.CompletedProcess(argv, 0 if found is not None else 44, "", "")
        raise AssertionError(f"unexpected command {argv}")


@pytest.fixture
def mac(monkeypatch):
    monkeypatch.setattr(keystore, "where", lambda: keystore.KEYCHAIN)


# ------------------------------------------------------------------ the keystore (TC-01 to TC-08)

def test_tc01_keys_never_appear_in_any_argument_list(mac):
    fake, a, b = FakeKeychain(), openai_key(), jev_key()
    keystore.save(a, b, run=fake)
    for argv, _ in fake.calls:
        assert not any(a in arg or b in arg for arg in argv)
    assert any(stdin and a in stdin and b in stdin for _, stdin in fake.calls)


def test_tc02_a_save_reads_back_both_and_is_cached(mac):
    fake, a, b = FakeKeychain(), openai_key(), jev_key()
    keystore.save(a, b, run=fake)
    assert keystore.load(run=fake) == (a, b)
    assert keystore.cached(run=FakeKeychain()) == (a, b)  # from memory, not a second read


@pytest.mark.parametrize("bad", ["", "x" * (keystore.MAX_KEY_CHARS + 1), "sk-proj-abc def", 'sk-"quote', "sk-'quote", "sk-back\\slash"])
def test_tc03_a_key_that_isnt_shaped_like_one_is_refused_before_the_keychain(mac, bad):
    fake = FakeKeychain()
    with pytest.raises(keystore.StoreError, match="doesn't look like an API key"):
        keystore.save(bad, jev_key(), run=fake)
    assert fake.calls == []


def test_tc03_the_longest_key_is_accepted(mac):
    fake, long_key = FakeKeychain(), "k" * keystore.MAX_KEY_CHARS
    keystore.save(long_key, jev_key(), run=fake)
    assert keystore.load(run=fake)[0] == long_key


@pytest.mark.parametrize("fake", [FakeKeychain(corrupt="tampered"), FakeKeychain(refuse_write=True)])
def test_tc04_a_failed_or_different_write_leaves_neither_key(mac, fake):
    before = keystore.load(run=fake)
    with pytest.raises(keystore.StoreError, match="didn't save"):
        keystore.save(openai_key(), jev_key(), run=fake)
    assert before is None and fake.items == {} and keystore.load(run=fake) is None
    assert keystore.cached(run=fake) is None


def test_tc05_a_timeout_leaves_neither_key(mac):
    with pytest.raises(keystore.StoreError, match="didn't save"):
        keystore.save(openai_key(), jev_key(), run=FakeKeychain(timeout=True))


def test_tc06_off_a_mac_nothing_is_stored(monkeypatch):
    monkeypatch.setattr(keystore, "where", lambda: None)
    fake = FakeKeychain()
    with pytest.raises(keystore.StoreError, match="can't remember keys yet"):
        keystore.save(openai_key(), jev_key(), run=fake)
    assert fake.calls == [] and keystore.load(run=fake) is None


def test_tc07_one_key_missing_loads_nothing(mac):
    fake = FakeKeychain()
    keystore.save(openai_key(), jev_key(), run=fake)
    fake.items.pop((keystore.service(), "jev"))
    assert keystore.load(run=fake) is None


def test_tc08_forget_with_nothing_stored_is_fine(mac):
    fake = FakeKeychain()
    keystore.forget(run=fake)
    assert [argv[1] for argv, _ in fake.calls] == ["delete-generic-password", "delete-generic-password"]
    assert keystore.cached(run=fake) is None


# ------------------------------------------------------------------ the real Keychain (TC-09)

@pytest.mark.skipif(sys.platform != "darwin" or not keystore.SECURITY.is_file(), reason="needs macOS and /usr/bin/security")
def test_tc09_a_round_trip_through_this_macs_keychain(monkeypatch):
    monkeypatch.setenv(keystore.SERVICE_ENV, f"local-ai-coach-test-{uuid.uuid4().hex[:12]}")
    a, b = openai_key(), jev_key()
    try:
        assert keystore.load() is None
        keystore.save(a, b)
        keystore.reset_cache()
        assert keystore.load() == (a, b) and keystore.cached() == (a, b)
        keystore.forget()
        assert keystore.load() is None and keystore.cached() is None
    finally:
        keystore.forget()


# ------------------------------------------------------------------ the agent's routes (TC-10 to TC-14)

@pytest.fixture
def client(mac, monkeypatch):
    fake = FakeKeychain()
    monkeypatch.setattr(keystore, "RUN", fake)
    app = FastAPI()
    app.include_router(stored_keys.router)
    yield TestClient(app), fake


def test_tc10_nothing_saved(client):
    http, _ = client
    assert http.get("/coach/keys").json() == {"saved": False, "where": "keychain"}


def test_tc11_save_then_ask_never_returns_a_key(client):
    http, fake = client
    a, b = openai_key(), jev_key()
    saved = http.post("/coach/keys", json={"openai": a, "jev": b})
    asked = http.get("/coach/keys")
    assert saved.status_code == 200 and saved.json() == {"saved": True, "where": "keychain"}
    assert asked.json() == {"saved": True, "where": "keychain"}
    for response in (saved, asked):
        assert a not in response.text and b not in response.text
    assert fake.items[(keystore.service(), "openai")] == a


def test_tc12_forget(client):
    http, fake = client
    http.post("/coach/keys", json={"openai": openai_key(), "jev": jev_key()})
    assert http.delete("/coach/keys").json() == {"saved": False, "where": "keychain"}
    assert http.get("/coach/keys").json()["saved"] is False and fake.items == {}


@pytest.mark.parametrize("header", [{"Origin": "https://evil.example"}, {"Origin": "http://localhost:3000"}, {"Sec-Fetch-Site": "cross-site"}])
@pytest.mark.parametrize("method", ["get", "post", "delete"])
def test_tc13_a_browser_request_is_refused_and_changes_nothing(client, header, method):
    http, fake = client
    a, b = openai_key(), jev_key()
    http.post("/coach/keys", json={"openai": a, "jev": b})
    before = dict(fake.items)
    kwargs = {"json": {"openai": openai_key(), "jev": jev_key()}} if method == "post" else {}
    response = getattr(http, method)("/coach/keys", headers=header, **kwargs)
    assert response.status_code == stored_keys.FORBIDDEN
    assert fake.items == before


@pytest.mark.parametrize("body", [{"openai": "has space", "jev": "x"}, {"openai": 1, "jev": 2}, {}, "not json"])
def test_tc14_a_save_that_fails_says_why_and_stores_nothing(client, body):
    http, fake = client
    response = http.post("/coach/keys", json=body) if not isinstance(body, str) else http.post("/coach/keys", content=body)
    assert response.status_code == stored_keys.UNPROCESSABLE
    assert response.json()["saved"] is False and "error" in response.json()
    assert fake.items == {}


# ------------------------------------------------------------------ used per request (TC-17 to TC-20)

def run_through(headers, stored):
    seen = {}

    async def downstream(scope, receive, send):
        seen["headers"] = scope["headers"]

    asyncio.run(stored_keys.StoredKeys(downstream, load=lambda: stored)({"type": "http", "headers": headers}, None, None))
    return dict(seen["headers"])


STORED = ("sk-proj-" + "a" * 48, "b" * 40)


def test_tc17_a_keyless_request_from_the_apps_server_gets_the_saved_keys():
    headers = run_through([(b"content-type", b"application/json")], STORED)
    assert headers[stored_keys.OPENAI_HEADER] == STORED[0].encode()
    assert headers[stored_keys.JEV_HEADER] == STORED[1].encode()


def test_tc18_a_request_with_its_own_keys_keeps_them():
    own = [(stored_keys.OPENAI_HEADER, b"own-openai"), (stored_keys.JEV_HEADER, b"own-jev")]
    assert run_through(own, STORED) == dict(own)


@pytest.mark.parametrize("browser", [(b"origin", b"https://evil.example"), (b"sec-fetch-site", b"cross-site")])
def test_tc19_a_browser_request_never_gets_the_saved_keys(browser):
    assert stored_keys.OPENAI_HEADER not in run_through([browser], STORED)


def test_tc20_nothing_saved_nothing_added():
    assert run_through([(b"content-type", b"application/json")], None) == {b"content-type": b"application/json"}
