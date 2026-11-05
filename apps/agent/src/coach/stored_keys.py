"""Saved keys, used per request and managed by the app's own server (Ceetrix story 16).

StoredKeys runs before CredentialsMiddleware (src/credentials.py, which stays as upstream
wrote it). A request from the app's server that carries no keys gets the saved ones as the
same two headers the browser used to send, so the existing per-request path works and
nothing restarts after a save.

Browsers always send Origin or Sec-Fetch-Site and the app's server never does, so a request
with either is a browser's: it never gets the saved keys, and the key routes refuse it. That
keeps any other website open in the same browser away from the keys.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.coach import keystore

OPENAI_HEADER = b"x-openai-api-key"
JEV_HEADER = b"x-jev-api-key"
BROWSER_HEADERS = (b"origin", b"sec-fetch-site")
FORBIDDEN = 403
UNPROCESSABLE = 422


def from_a_browser(headers: list[tuple[bytes, bytes]]) -> bool:
    return any(name.lower() in BROWSER_HEADERS for name, _ in headers)


class StoredKeys:
    def __init__(self, app: Any, load: Callable[[], tuple[str, str] | None] = keystore.cached):
        self.app = app
        self.load = load

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http":
            headers = scope.get("headers", [])
            names = {name.lower() for name, _ in headers}
            if OPENAI_HEADER not in names and JEV_HEADER not in names and not from_a_browser(headers):
                keys = self.load()
                if keys is not None:
                    added = [(OPENAI_HEADER, keys[0].encode()), (JEV_HEADER, keys[1].encode())]
                    scope = {**scope, "headers": [*headers, *added]}
        await self.app(scope, receive, send)


router = APIRouter()


def _state() -> dict[str, Any]:
    return {"saved": keystore.saved(), "where": keystore.where()}


def _refused(request: Request) -> JSONResponse | None:
    if from_a_browser([(name.encode(), value.encode()) for name, value in request.headers.items()]):
        return JSONResponse({"error": "Only the coach itself can do that."}, status_code=FORBIDDEN)
    return None


@router.get("/coach/keys")
def keys_state(request: Request):
    """Whether keys are saved and where saving goes on this computer. Never a key."""
    return _refused(request) or JSONResponse(_state())


@router.post("/coach/keys")
async def keys_save(request: Request):
    refused = _refused(request)
    if refused:
        return refused
    try:
        body = await request.json()
    except ValueError:
        body = None
    openai = body.get("openai") if isinstance(body, dict) else None
    jev = body.get("jev") if isinstance(body, dict) else None
    try:
        if not isinstance(openai, str) or not isinstance(jev, str):
            raise keystore.StoreError(keystore.NOT_A_KEY)
        keystore.save(openai, jev)
    except keystore.StoreError as error:
        return JSONResponse({**_state(), "error": str(error)}, status_code=UNPROCESSABLE)
    return JSONResponse(_state())


@router.delete("/coach/keys")
def keys_forget(request: Request):
    refused = _refused(request)
    if refused:
        return refused
    keystore.forget()
    return JSONResponse(_state())
