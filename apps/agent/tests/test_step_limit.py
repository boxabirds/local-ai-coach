"""A coach turn gets the graph's own step limit, not LangGraph's default of 25.

ag_ui_langgraph builds each run's config with ensure_config(), which fills in
recursion_limit=25, and that run config wins over the limit the graph was built with
(deepagents builds it with 1000). A legitimate turn (a check, a progress record,
chapter_ended, then a reply) passes through every middleware node on each model call
and crossed 25: GraphRecursionError, and the page server fell over on the dropped
stream (2026-11-07). The route's agent has to carry the limit in its own config."""

from __future__ import annotations

import asyncio
from typing import TypedDict

import pytest
from langchain_core.runnables import ensure_config
from langgraph.errors import GraphRecursionError
from langgraph.graph import START, StateGraph

STEPS = 40  # more than LangGraph's default limit of 25


class Count(TypedDict):
    n: int


def looping_graph(limit: int):
    graph = StateGraph(Count)
    graph.add_node("step", lambda state: {"n": state["n"] + 1})
    graph.add_edge(START, "step")
    graph.add_conditional_edges("step", lambda state: "step" if state["n"] < STEPS else "__end__")
    return graph.compile().with_config({"recursion_limit": limit})


def run_like_ag_ui(graph, agent_config: dict) -> None:
    # What ag_ui_langgraph's run does with the agent's config before it streams.
    config = ensure_config(agent_config.copy())

    async def stream():
        async for _ in graph.astream_events({"n": 0}, config=config, version="v2"):
            pass

    asyncio.run(stream())


def test_a_run_config_from_ensure_config_loses_the_graphs_own_limit():
    with pytest.raises(GraphRecursionError):
        run_like_ag_ui(looping_graph(limit=STEPS * 2), {})


def test_the_coach_route_runs_with_the_graphs_own_step_limit():
    import main

    limit = main.agent.config["recursion_limit"]
    assert limit > STEPS
    run_like_ag_ui(looping_graph(limit=limit), main.coach_agent.config)
