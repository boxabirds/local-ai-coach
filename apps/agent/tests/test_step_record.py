"""step_shown is recorded from the model's decision, not from a card's fetch (Ceetrix story 22,
TC-12 to TC-15). COACH_HOME is a temp folder per test and the curriculum is the fixture copy
(conftest), so progress.json is real and no real lesson wording is asserted."""

from __future__ import annotations

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from src.coach import curriculum, progress, tools
from src.coach.middleware import CoachStateMiddleware

STATION = "machine"


def shown() -> list[dict]:
    return [e for e in progress.load(progress.home()).get(tools.EVENTS, []) if e.get("event") == "step_shown"]


def ai(*calls: tuple[str, dict, str]) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id} for name, args, call_id in calls])


def after(*messages) -> None:
    CoachStateMiddleware().after_model({"messages": [HumanMessage(content="a sample question"), *messages]}, None)


def test_tc12_the_model_showing_a_step_records_it_once_with_its_call():
    after(ai(("show_next_step", {"station": STATION, "step": "machine.2"}, "call-1")))
    [event] = shown()
    assert (event["station"], event["step"], event["call"]) == (STATION, "machine.2", "call-1")


def test_tc13_the_same_call_seen_again_is_not_recorded_twice():
    message = ai(("show_next_step", {"station": STATION, "step": "machine.2"}, "call-1"))
    after(message)
    after(message, ToolMessage(content="{}", tool_call_id="call-1"), AIMessage(content="Done."))
    after(message)
    assert len(shown()) == 1


def test_tc13_two_calls_are_two_events_in_order():
    after(ai(("show_next_step", {"station": STATION, "step": "machine.1"}, "call-1")))
    after(ai(("show_next_step", {"station": STATION, "step": "machine.2"}, "call-2")))
    assert [e["step"] for e in shown()] == ["machine.1", "machine.2"]


def test_tc14_other_tools_and_plain_replies_record_nothing():
    after(AIMessage(content="A plain sample reply."))
    after(ai(("set_progress", {"station": STATION, "status": "read"}, "call-9")))
    after(ToolMessage(content="{}", tool_call_id="call-9"))  # newest message isn't the model's
    assert shown() == []


def test_tc14_a_call_missing_its_station_or_step_records_nothing():
    after(ai(("show_next_step", {"station": STATION}, "call-1")))
    assert shown() == []


def test_tc15_fetching_a_step_never_writes():
    import main

    client = TestClient(main.app)
    step = curriculum.lesson(STATION)["steps"][0]
    before = progress.load(progress.home())
    for _ in range(2):
        assert client.get(f"/curriculum/step/{STATION}/{step['id']}").status_code == 200
    assert progress.load(progress.home()) == before
    assert not (progress.home() / "progress.json").exists() or shown() == []


def test_tc12_integration_a_real_agent_turn_records_the_models_call():
    """The hook runs inside a real deep agent turn, not only when called by hand."""
    from deepagents import create_deep_agent

    from src.bounded_memory_saver import BoundedMemorySaver
    from src.prompt import SYSTEM_PROMPT
    from src.skill_backend import SKILL_SOURCES, build_agent_backend
    from tests.test_coach_agent import ScriptedModel, call

    model = ScriptedModel(script=[call("show_next_step", {"station": STATION, "step": "machine.2"}, "call-7"), AIMessage(content="Done.")], seen=[])
    agent = create_deep_agent(model=model, tools=tools.COACH_TOOLS, middleware=[CoachStateMiddleware()],
                              skills=SKILL_SOURCES, backend=build_agent_backend, checkpointer=BoundedMemorySaver(max_threads=2),
                              system_prompt=SYSTEM_PROMPT)
    agent.invoke({"messages": [HumanMessage(content="a sample question")]}, {"configurable": {"thread_id": "t-step-record"}})
    assert [(e["step"], e["call"]) for e in shown()] == [("machine.2", "call-7")]
