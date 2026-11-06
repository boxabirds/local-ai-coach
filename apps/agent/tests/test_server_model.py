"""Any OpenAI-compatible server (Ceetrix story 21, TC-01 to TC-10). The chosen server is faked
with an httpx mock transport; provider.json is real, in each test's temp COACH_HOME."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.coach import server_model

TOGETHER = "https://api.together.ai/v1"
MODEL = "zai-org/GLM-5.3-Flash"
KEY = "tgp_v1_" + "a1B2c3D4" * 5
JEV = "k9Z8y7X6" * 5


def transport(server_status: int | None, jev_status: int = 200, seen: list | None = None) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(str(request.url))
        if "chat/completions" in str(request.url):
            if server_status is None:
                raise httpx.ConnectError("refused")
            return httpx.Response(server_status, json={})
        return httpx.Response(jev_status, json={})
    return httpx.MockTransport(handle)


# ------------------------------------------------------------------ the setting (TC-01 to TC-03)

def test_tc01_save_then_load():
    server_model.save(TOGETHER + "/", f"  {MODEL} ")
    assert server_model.load() == {"base_url": TOGETHER, "model": MODEL}
    assert json.loads(server_model._path().read_text()) == {"base_url": TOGETHER, "model": MODEL}


@pytest.mark.parametrize("base_url, model", [("ftp://x", MODEL), ("", MODEL), ("https://", MODEL), (TOGETHER, ""), (TOGETHER, "   ")])
def test_tc02_a_bad_address_or_no_model_is_refused_and_nothing_written(base_url, model):
    with pytest.raises(ValueError):
        server_model.save(base_url, model)
    assert not server_model._path().exists()


def test_tc03_clear():
    server_model.save(TOGETHER, MODEL)
    server_model.clear()
    assert server_model.load() is None
    server_model.clear()  # clearing nothing is fine


# ------------------------------------------------------------------ the check and the routes (TC-04 to TC-07)

def test_tc04_a_server_that_answers_and_jev_that_answers_is_ok():
    assert asyncio.run(server_model.check(TOGETHER, MODEL, KEY, JEV, transport(200))) is None


@pytest.mark.parametrize("server_status, jev_status, failure", [
    (401, 200, "server_invalid"), (403, 200, "server_invalid"), (404, 200, "model_unknown"),
    (400, 200, "model_unknown"), (None, 200, "server_unreachable"), (500, 200, "server_unreachable"), (200, 401, "jev_invalid"),
])
def test_tc05_each_failure_is_named(server_status, jev_status, failure):
    assert asyncio.run(server_model.check(TOGETHER, MODEL, KEY, JEV, transport(server_status, jev_status))) == failure


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(server_model.router)
    return TestClient(app)


@pytest.mark.parametrize("header", [{"Origin": "https://evil.example"}, {"Sec-Fetch-Site": "cross-site"}])
def test_tc06_a_browser_request_is_refused_and_changes_nothing(client, header):
    server_model.save(TOGETHER, MODEL)
    assert client.post("/coach/provider", json={"base_url": "https://evil.example/v1", "model": "x"}, headers=header).status_code == 403
    assert client.delete("/coach/provider", headers=header).status_code == 403
    assert client.post("/coach/provider/check", json={}, headers=header).status_code == 403
    assert server_model.load() == {"base_url": TOGETHER, "model": MODEL}


def test_tc07_a_bad_address_gets_422_and_nothing_is_sent(client, monkeypatch):
    sent = []
    monkeypatch.setattr(server_model, "check", lambda *a, **k: sent.append(a))
    response = client.post("/coach/provider/check", json={"base_url": "file:///etc/passwd", "model": MODEL, "key": KEY, "jev": JEV})
    assert response.status_code == 422 and response.json()["error"] == server_model.BAD_ADDRESS
    assert sent == []
    assert client.post("/coach/provider", json={"base_url": "ftp://x", "model": MODEL}).status_code == 422
    assert server_model.load() is None


def test_routes_save_report_and_clear(client):
    assert client.get("/coach/provider").json() == {"server": None}
    assert client.post("/coach/provider", json={"base_url": TOGETHER, "model": MODEL}).json() == {"server": {"base_url": TOGETHER, "model": MODEL}}
    assert client.get("/coach/provider").json()["server"]["model"] == MODEL
    assert client.delete("/coach/provider").json() == {"server": None}


# ------------------------------------------------------------------ ServerModel (TC-08 to TC-10)

class Request:
    def __init__(self):
        self.model = "upstream-openai-model"

    def override(self, **kw):
        out = Request()
        out.model = kw["model"]
        return out


def run(middleware, credentials):
    from src.credentials import Credentials, current_credentials

    token = current_credentials.set(Credentials(*credentials) if credentials else None)
    try:
        return middleware.wrap_model_call(Request(), lambda r: r.model)
    finally:
        current_credentials.reset(token)


def test_tc08_with_a_server_chosen_requests_go_there_with_the_key():
    server_model.save(TOGETHER, MODEL)
    model = run(server_model.ServerModel(), (KEY, JEV))
    assert model.model_name == MODEL
    assert str(model.openai_api_base).rstrip("/") == TOGETHER
    assert model.openai_api_key.get_secret_value() == KEY


def test_tc09_without_a_choice_the_model_is_unchanged():
    assert run(server_model.ServerModel(), (KEY, JEV)) == "upstream-openai-model"


def test_tc10_without_credentials_the_model_is_unchanged():
    server_model.save(TOGETHER, MODEL)
    assert run(server_model.ServerModel(), None) == "upstream-openai-model"
