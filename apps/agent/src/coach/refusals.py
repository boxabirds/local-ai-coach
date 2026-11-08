"""A turn a provider refuses ends with the coach saying so (Ceetrix story 37).

Upstream's wrappers (src/visualization_router.py for Jev, src/model.py for the model, kept as
upstream wrote them) raise a ValueError when a provider refuses or fails, and nothing caught
it: the agent's run raised after RUN_STARTED, the response stream stopped, and the page
showed the learner's message and nothing else. RefusalReportingAgent ends such a run with a
RUN_ERROR whose message is one of the lines below, which the page shows. It never passes on
a provider's own text, which can hold part of a key.
"""

from __future__ import annotations

import re
from typing import Any, AsyncGenerator

from ag_ui.core import EventType, RunAgentInput, RunErrorEvent

from src.coach import server_model
from src.credentials import CredentialScopedAgent

# The RUN_ERROR code the page looks for: the message is then the coach's own words.
CODE = "coach_turn_failed"
# Jev's wrapper names itself and the HTTP status; a refused key is one of these.
JEV_FAILURE = re.compile(r"^Jev .*\(HTTP (\d{3})\)")
REFUSED_STATUSES = {"401", "403"}
MODEL_FAILURE = "OpenAI request failed"

# Learner-facing, in the coach's voice (assets/tone-of-voice-guide.md).
JEV_REFUSED = "Jev turned down your Jev key, so I couldn't answer. Check it in API keys, then send your message again."
JEV_UNAVAILABLE = "Jev isn't answering right now, so I couldn't either. Try again in a minute."
OPENAI_FAILED = "OpenAI didn't answer, so I couldn't either. Check your OpenAI key in API keys and that your OpenAI account has credit, or try again in a minute."
SERVER_FAILED = "The server you chose didn't answer, so I couldn't either. Check its key in API keys and that the server is running, or try again in a minute."
# The page's own line for an answer that stopped (web/app.tsx), for anything else.
CUT_OFF = "Something cut my answer off. Try again, or ask me something else."


def learner_line(error: BaseException) -> str:
    """What to tell the learner about a failed turn. Reads only the wrapper's fixed wording."""
    text = str(error)
    jev = JEV_FAILURE.match(text)
    if jev:
        return JEV_REFUSED if jev.group(1) in REFUSED_STATUSES else JEV_UNAVAILABLE
    if text.startswith(MODEL_FAILURE):
        return SERVER_FAILED if server_model.load() else OPENAI_FAILED
    return CUT_OFF


class RefusalReportingAgent(CredentialScopedAgent):
    async def run(self, input: RunAgentInput) -> AsyncGenerator[Any, None]:
        try:
            async for event in super().run(input):
                yield event
        except Exception as error:  # noqa: BLE001: every failure ends the run with a line, never silence
            yield RunErrorEvent(type=EventType.RUN_ERROR, message=learner_line(error), code=CODE)
