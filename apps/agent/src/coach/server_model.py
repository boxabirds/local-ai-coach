"""Any OpenAI-compatible server instead of OpenAI (Ceetrix story 21).

The learner can choose a server (an address such as https://api.together.ai/v1 and a model
name such as zai-org/GLM-5.3-Flash). The choice isn't secret and lives in
$COACH_HOME/provider.json; the key for that server travels in the OpenAI key's place (saved
in the Keychain, or held for the session), so nothing about keys changes.

ServerModel runs right after upstream's RequestModelMiddleware (src/model.py, which stays as
upstream wrote it): with a server chosen and a key present, it swaps the request's model for
one pointed at that server. Without a choice it does nothing, and the coach uses OpenAI.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from langchain.agents.middleware import AgentMiddleware

from src.coach import progress
from src.coach.stored_keys import from_a_browser

SETTING_FILE = "provider.json"
SCHEMES = ("http", "https")
CHECK_TIMEOUT_S = 20
MAX_FIELD = 512
FORBIDDEN = 403
UNPROCESSABLE = 422
REFUSED_CODES = {401, 403}
UNKNOWN_MODEL_CODES = {400, 404, 422}

# Learner-facing, in the coach's voice.
FAILURES = {
    "server_invalid": "That server didn't accept the key.",
    "model_unknown": "That server doesn't know that model name. Check it, including the part before the slash.",
    "server_unreachable": "I couldn't reach that server. Check the address.",
    "jev_invalid": "Jev didn't accept its key.",
}
BAD_ADDRESS = "The server address needs to start with https:// or http://."
NO_MODEL = "Add the model's name, as that server writes it."

# How hard the chosen model thinks before it answers. Unset: the provider's default. Measured on
# Together GLM 5.3 Flash with the coach's context: default 4.5 to 5.6 s a call, mostly hidden
# reasoning; low 2.1 to 2.5 s. Shared with the evals so a setting is measured before it is used.
REASONING_ENV = "COACH_REASONING_EFFORT"
REASONING_LEVELS = ("low", "medium", "high")


def reasoning_effort() -> str | None:
    """The configured effort, or None (the provider's default) when unset or not a known level."""
    value = os.environ.get(REASONING_ENV, "").strip().lower()
    return value if value in REASONING_LEVELS else None


def _path() -> Path:
    return progress.home() / SETTING_FILE


def validate(base_url: Any, model: Any) -> tuple[str, str]:
    """The address and model, cleaned; ValueError with a learner-facing reason if either won't do."""
    if not isinstance(base_url, str) or urlparse(base_url.strip()).scheme not in SCHEMES or not urlparse(base_url.strip()).netloc or len(base_url) > MAX_FIELD:
        raise ValueError(BAD_ADDRESS)
    if not isinstance(model, str) or not model.strip() or len(model) > MAX_FIELD:
        raise ValueError(NO_MODEL)
    return base_url.strip().rstrip("/"), model.strip()


def load() -> dict[str, str] | None:
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
        base_url, model = validate(data.get("base_url"), data.get("model"))
    except (OSError, ValueError, AttributeError):
        return None
    return {"base_url": base_url, "model": model}


def save(base_url: Any, model: Any) -> dict[str, str]:
    """Write the choice by atomic rename. ValueError, and nothing written, if it won't do."""
    clean_url, clean_model = validate(base_url, model)
    folder = progress.home()
    folder.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".provider-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump({"base_url": clean_url, "model": clean_model}, handle)
    os.replace(tmp, _path())
    return {"base_url": clean_url, "model": clean_model}


def clear() -> None:
    _path().unlink(missing_ok=True)


async def check(base_url: str, model: str, key: str, jev: str, transport: httpx.AsyncBaseTransport | None = None) -> str | None:
    """None if the server takes the key and knows the model, and Jev takes its key; else the failure's code."""
    try:
        async with httpx.AsyncClient(timeout=CHECK_TIMEOUT_S, follow_redirects=False, trust_env=False, transport=transport) as client:
            response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {key}"},
                                         json={"model": model, "messages": [{"role": "user", "content": "Reply OK."}], "max_tokens": 8})
    except httpx.HTTPError:
        return "server_unreachable"
    if response.status_code in REFUSED_CODES:
        return "server_invalid"
    if response.status_code in UNKNOWN_MODEL_CODES:
        return "model_unknown"
    if not response.is_success:
        return "server_unreachable"
    return await _check_jev(jev, transport)


async def _check_jev(jev: str, transport: httpx.AsyncBaseTransport | None) -> str | None:
    """Jev, checked the way upstream checks it (src/credentials.py), with its own key."""
    from src.credentials import Credentials, current_credentials
    from src.visualization_router import JEV_URL, request_options

    token = current_credentials.set(Credentials("", jev))
    try:
        async with httpx.AsyncClient(timeout=CHECK_TIMEOUT_S, follow_redirects=False, trust_env=False, transport=transport) as client:
            response = await client.post(JEV_URL, **request_options([{"role": "human", "content": "Hello"}]))
    except httpx.HTTPError:
        return "server_unreachable"
    finally:
        current_credentials.reset(token)
    return None if response.is_success else "jev_invalid"


class ServerModel(AgentMiddleware):
    """After upstream's RequestModelMiddleware: with a server chosen and a key present, use that server."""

    def _model(self, request: Any) -> Any:
        from src.credentials import current_credentials

        setting, credentials = load(), current_credentials.get()
        if not setting or credentials is None or not credentials.openai:
            return request
        from langchain_openai import ChatOpenAI

        # stream_usage: a streamed reply carries its token counts only when asked (turn log, story 21).
        return request.override(model=ChatOpenAI(model=setting["model"], base_url=setting["base_url"], api_key=credentials.openai,
                                                 stream_usage=True, reasoning_effort=reasoning_effort()))

    def wrap_model_call(self, request, handler):
        return handler(self._model(request))

    async def awrap_model_call(self, request, handler):
        return await handler(self._model(request))


router = APIRouter()


def _refused(request: Request) -> JSONResponse | None:
    if from_a_browser([(name.encode(), value.encode()) for name, value in request.headers.items()]):
        return JSONResponse({"error": "Only the coach itself can do that."}, status_code=FORBIDDEN)
    return None


async def _body(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


@router.get("/coach/provider")
def provider_get(request: Request):
    return _refused(request) or JSONResponse({"server": load()})


@router.post("/coach/provider")
async def provider_save(request: Request):
    refused = _refused(request)
    if refused:
        return refused
    body = await _body(request)
    try:
        return JSONResponse({"server": save(body.get("base_url"), body.get("model"))})
    except ValueError as error:
        return JSONResponse({"server": load(), "error": str(error)}, status_code=UNPROCESSABLE)


@router.delete("/coach/provider")
def provider_clear(request: Request):
    refused = _refused(request)
    if refused:
        return refused
    clear()
    return JSONResponse({"server": None})


@router.post("/coach/provider/check")
async def provider_check(request: Request):
    refused = _refused(request)
    if refused:
        return refused
    body = await _body(request)
    try:
        base_url, model = validate(body.get("base_url"), body.get("model"))
    except ValueError as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=UNPROCESSABLE)
    key, jev = body.get("key"), body.get("jev")
    if not isinstance(key, str) or not key.strip() or not isinstance(jev, str) or not jev.strip():
        return JSONResponse({"ok": False, "error": "Add both keys: the server's and Jev's."}, status_code=UNPROCESSABLE)
    failure = await check(base_url, model, key.strip(), jev.strip())
    if failure:
        return JSONResponse({"ok": False, "code": failure, "error": FAILURES[failure]})
    return JSONResponse({"ok": True})
