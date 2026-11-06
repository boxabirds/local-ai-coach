"""
This is the main entry point for the agent.
It defines the workflow graph, state, tools, nodes and edges.
"""

import os
import warnings

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from copilotkit import CopilotKitMiddleware, LangGraphAGUIAgent
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from deepagents import create_deep_agent

from src.anthropic_compat import ConsecutiveSystemMessagesMiddleware
from src.bounded_memory_saver import BoundedMemorySaver
from src.model import build_model, RequestModelMiddleware, CredentialScopedModel
from src.credentials import (
    CredentialsMiddleware,
    CredentialScopedAgent,
    current_credentials,
    validate_credentials,
)
from src.visualization_router import JevVisualizationMiddleware
from src.skill_backend import SKILL_SOURCES, build_agent_backend
from src.prompt import SYSTEM_PROMPT
from src.coach.curriculum import figure, story_markdown
from src.coach.middleware import CoachStateMiddleware
from src.coach.tools import COACH_TOOLS
from src.coach.stub import stub_graph
from src.coach.stored_keys import StoredKeys, router as keys_router
from src.coach.turn_log import TurnLog
from src.coach.server_model import ServerModel, router as server_router

load_dotenv()

agent = create_deep_agent(
    model=CredentialScopedModel(fallback=build_model(allow_unconfigured=True)),
    # The coach's tools (Ceetrix story 10); the demo tools are gone.
    tools=COACH_TOOLS,
    middleware=[
        RequestModelMiddleware(),
        # Right after upstream's model choice: an OpenAI-compatible server, if the learner chose one (story 21).
        ServerModel(),
        CopilotKitMiddleware(),
        CoachStateMiddleware(),
        JevVisualizationMiddleware(),
        ConsecutiveSystemMessagesMiddleware(),
        # Last, so it logs exactly what the model is sent (story 19).
        TurnLog(),
    ],
    skills=SKILL_SOURCES,
    backend=build_agent_backend,
    checkpointer=BoundedMemorySaver(max_threads=200),
    system_prompt=SYSTEM_PROMPT,
)

app = FastAPI()
app.add_middleware(CredentialsMiddleware)
# Added after, so it runs first: saved keys reach CredentialsMiddleware as the usual headers
# on requests from the app's own server (Ceetrix story 16).
app.add_middleware(StoredKeys)
app.include_router(keys_router)
app.include_router(server_router)


@app.post("/credentials/validate")
async def validate_provider_credentials():
    credentials = current_credentials.get()
    if credentials is None:
        return JSONResponse({"ok": False, "code": "invalid_keys"}, status_code=400)
    return await validate_credentials(credentials)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/curriculum/story/{story_id}")
def curriculum_story(story_id: str):
    """A story listed in curriculum/scope.json, read-only. Anything else is 404."""
    text = story_markdown(story_id)
    if text is None:
        return PlainTextResponse("", status_code=404)
    return PlainTextResponse(text, media_type="text/markdown; charset=utf-8")


@app.get("/curriculum/step/{station}/{step_id}")
def curriculum_step(station: str, step_id: str):
    """One lesson step, for the show_next_step card to draw (story 19). Records that it was
    shown, so a detour can say where the learner was. Unknown station or step: 404."""
    from src.coach.tools import _record_event, _step

    step = _step(station, step_id)
    if step is None:
        return JSONResponse({}, status_code=404)
    _record_event("step_shown", station=station, step=step_id)
    return JSONResponse({"station": station, "step": step})


@app.get("/curriculum/figure/{figure_id}")
def curriculum_figure(figure_id: str):
    """A figure listed in curriculum/figures.json, read-only. Anything else is 404."""
    found = figure(figure_id)
    if found is None:
        return JSONResponse({}, status_code=404)
    return JSONResponse(found)


# The stub coach (build step 2): no model, no keys, walks chapter 0 and 1.
# CredentialsMiddleware only gates "/", so this path needs no keys. Select it
# with LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8123/stub.
add_langgraph_fastapi_endpoint(
    app=app,
    agent=LangGraphAGUIAgent(
        name="stub_coach",
        description="Stub coach for Mastering Local AI: fixed wording, no model",
        graph=stub_graph,
    ),
    path="/stub",
)


add_langgraph_fastapi_endpoint(
    app=app,
    agent=CredentialScopedAgent(
        name="sample_agent",
        description="Open Generative UI by CopilotKit — answers you can interact with",
        graph=agent,
    ),
    path="/",
)

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8123"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
