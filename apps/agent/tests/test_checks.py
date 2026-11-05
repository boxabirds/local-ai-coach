"""Evaluating a step's check from probe results (Ceetrix story 9, TC-18 to TC-26).

The lesson steps are the real ones from curriculum/lessons; only the probe
runner is replaced, with answers in the shape probes.run returns.
"""

from __future__ import annotations

import pytest

from src.coach import checks, curriculum

ALLOWED = {"probes": True, "history": False, "doIt": False}
MACHINE_2 = next(s for s in curriculum.lesson("machine")["steps"] if s["id"] == "machine.2")
LOCALCHAT_3 = next(s for s in curriculum.lesson("localchat")["steps"] if s["id"] == "localchat.3")
PROVE_3 = next(s for s in curriculum.lesson("prove")["steps"] if s["id"] == "prove.3")
CONTEXT = {"chat_app": "chatapp"}


class Probes:
    """Answers probes.run by name; records what was asked."""

    def __init__(self, **answers):
        self.answers = answers
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, name, params=None, **kwargs):
        self.calls.append((name, params or {}))
        answer = self.answers[name]
        return {"probe": name, "cmd": f"cmd-for-{name}", **answer}


def memory(gb):
    return Probes(memory={"matched": [str(gb * 1024**3)], "value": gb})


def dest(address, port, kind):
    return {"address": address, "port": port, "kind": kind}


TAILNET = {"matched": ["laptop", "backroom"], "value": [
    {"name": "laptop", "addresses": ["100.70.0.1"], "online": True, "owned": True},
    {"name": "backroom", "addresses": ["100.70.1.2"], "online": True, "owned": True},
    {"name": "friends-pc", "addresses": ["100.70.9.9"], "online": True, "owned": False},
]}


@pytest.mark.parametrize("typed, passed", [(16, True), (17, True), (15, True), (18, False), (14, False), (512, False)])
def test_tc18_memory_within_one_gb(typed, passed):
    verdict = checks.evaluate(MACHINE_2, typed=typed, consent=ALLOWED, run=memory(16))
    assert verdict["passed"] is passed and verdict["checked"] is True and verdict["measured"] == 16
    assert verdict["evidence"] == [{"probe": "memory", "cmd": "cmd-for-memory", "matched": [str(16 * 1024**3)]}]


def test_tc18_the_pass_note_names_both_numbers():
    assert checks.evaluate(MACHINE_2, typed=16, consent=ALLOWED, run=memory(16))["note"] == "You typed 16 GB and the machine says 16 GB."


def test_tc19_the_fail_note_is_the_lessons_own():
    verdict = checks.evaluate(MACHINE_2, typed=512, consent=ALLOWED, run=memory(16))
    assert verdict["note"] == MACHINE_2["onFail"]["say"].format(typed="512", measured=16)
    assert "warehouse" in verdict["note"]


@pytest.mark.parametrize("consent", [None, {"probes": False, "history": False, "doIt": False}])
def test_tc20_without_consent_nothing_runs(consent):
    probe = memory(16)
    verdict = checks.evaluate(MACHINE_2, typed=16, consent=consent, run=probe)
    assert verdict == {"passed": False, "checked": False, "note": checks.NOT_ASKED, "evidence": [], "measured": None}
    assert probe.calls == []


def test_tc21_a_probe_error_is_not_checked_and_named():
    probe = Probes(memory={"matched": [], "error": "sysctl is not on this computer"})
    verdict = checks.evaluate(MACHINE_2, typed=16, consent=ALLOWED, run=probe)
    assert verdict["checked"] is False and verdict["passed"] is False
    assert verdict["note"] == "I couldn't read the memory number on this computer (sysctl is not on this computer), so I've taken your word for it."
    assert verdict["evidence"] == [{"probe": "memory", "cmd": "cmd-for-memory", "matched": []}]


def test_tc22_all_owned_kinds_pass_and_are_listed():
    probe = Probes(connections={"matched": ["..."], "value": [dest("127.0.0.1", 8080, "loopback"), dest("192.168.1.9", 8080, "private"), dest("100.70.1.2", 11434, "tailnet")]})
    verdict = checks.evaluate(LOCALCHAT_3, consent=ALLOWED, run=probe, context=CONTEXT)
    assert verdict["passed"] is True and verdict["checked"] is True
    assert verdict["note"] == "Everything it talked to is yours: 127.0.0.1 (loopback), 192.168.1.9 (private), 100.70.1.2 (tailnet)."
    assert probe.calls == [("connections", {"process": "chatapp"})]


def test_tc23_one_public_address_fails_and_is_named():
    probe = Probes(connections={"matched": ["..."], "value": [dest("100.70.1.2", 11434, "tailnet"), dest("34.120.0.1", 443, "public")]})
    verdict = checks.evaluate(LOCALCHAT_3, consent=ALLOWED, run=probe, context=CONTEXT)
    assert verdict["passed"] is False and verdict["checked"] is True
    assert verdict["note"] == "It talked to 34.120.0.1, a public address: somewhere you don't own."


def test_tc24_prove_needs_tailnet_addresses_to_be_owned():
    mine = Probes(connections={"matched": ["..."], "value": [dest("100.70.1.2", 11434, "tailnet")]}, tailnet=TAILNET)
    verdict = checks.evaluate(PROVE_3, consent=ALLOWED, run=mine, context=CONTEXT)
    assert verdict["passed"] is True
    assert [c[0] for c in mine.calls] == ["connections", "tailnet"] and mine.calls[1][1] == {}
    theirs = Probes(connections={"matched": ["..."], "value": [dest("100.70.9.9", 11434, "tailnet")]}, tailnet=TAILNET)
    verdict = checks.evaluate(PROVE_3, consent=ALLOWED, run=theirs, context=CONTEXT)
    assert verdict["passed"] is False and verdict["note"] == "It talked to 100.70.9.9 on a private link, but not to one of your machines."
    assert len(verdict["evidence"]) == 2


def test_tc25_nothing_seen_asks_to_check_again():
    verdict = checks.evaluate(LOCALCHAT_3, consent=ALLOWED, run=Probes(connections={"matched": [], "value": []}), context=CONTEXT)
    assert verdict["passed"] is False and verdict["checked"] is True and verdict["note"] == checks.NOTHING_SEEN


def test_tc26_an_unfilled_placeholder_runs_nothing():
    probe = Probes(connections={"matched": [], "value": []})
    verdict = checks.evaluate(LOCALCHAT_3, consent=ALLOWED, run=probe, context={})
    assert verdict["checked"] is False and probe.calls == []


def test_a_step_without_a_real_check_is_a_programming_error():
    with pytest.raises(ValueError):
        checks.evaluate({"id": "x", "check": {"kind": "ask"}}, consent=ALLOWED, run=Probes())


def test_every_learner_facing_check_string_passes_the_voice_rules():
    import subprocess
    import sys
    import tempfile
    from pathlib import Path

    strings = [checks.NOT_ASKED, checks.NOTHING_SEEN, checks.PASSED_MEMORY, checks.PASSED_OWNED, checks.PUBLIC_FOUND, checks.NOT_OWNED, checks.COULD_NOT]
    stylecheck = Path(__file__).resolve().parents[3] / "panel" / "stylecheck.py"
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as tmp:
        tmp.write("\n\n".join(strings))
    out = subprocess.run([sys.executable, str(stylecheck), "--book", tmp.name], capture_output=True, text=True, check=True).stdout
    Path(tmp.name).unlink()
    assert "avoid-list hits: none" in out
    assert not any(ch in s for s in strings for ch in "–—")



# ------------------------------------------------------------------ choices (story 11, TC-03 to TC-08)
# A made-up step, so these test the marking rule, not the lesson's wording (content is checked by validate.py).

FITS_STEP = {
    "id": "x.1",
    "check": {"kind": "ask", "question": "?", "rubric": "r", "choices": {
        "items": [{"label": "Small", "gb": 2}, {"label": "Medium", "gb": 5}, {"label": "Large", "gb": 20}],
        "options": ["Yes", "No"], "grade": "fit"}},
}
RIGHT_16 = ["Yes", "Yes", "No"]


@pytest.mark.parametrize("room, answers, passed", [
    (16, RIGHT_16, True),
    (8, RIGHT_16, True),  # 5 is under three quarters of 8: a squeeze still fits
    (32, RIGHT_16, False),  # on 32 the 20 fits
    (32, ["Yes", "Yes", "Yes"], True),
    (4, ["Yes", "No", "No"], True),
])
def test_s11_tc03_to_tc05_marked_against_the_learners_number(room, answers, passed):
    verdict = checks.grade_choices(FITS_STEP, answers, room)
    assert verdict["passed"] is passed and verdict["checked"] is True and verdict["measured"] == room
    assert [r["label"] for r in verdict["results"]] == ["Small", "Medium", "Large"]


def test_s11_tc03_the_pass_note_lists_each_result_on_the_number():
    assert checks.grade_choices(FITS_STEP, RIGHT_16, 16)["note"] == "On your 16 GB: 2 GB fits, 5 GB fits, 20 GB doesn't fit."


def test_s11_tc05_a_wrong_answer_names_the_file_and_gives_the_rule():
    verdict = checks.grade_choices(FITS_STEP, RIGHT_16, 32)
    assert verdict["note"] == "Have another look at Large. " + checks.CHOICES_HINT
    assert [r["right"] for r in verdict["results"]] == [True, True, False]


def test_s11_tc06_a_file_the_size_of_the_room_fits_one_over_does_not():
    assert checks.grade_choices(FITS_STEP, ["Yes", "Yes", "Yes"], 20)["passed"] is True
    assert checks.grade_choices(FITS_STEP, ["Yes", "Yes", "No"], 19)["passed"] is True


@pytest.mark.parametrize("answers", [["Yes", "Yes"], ["Yes", "Yes", "Maybe"], []])
def test_s11_tc07_answers_that_dont_match_the_card_are_refused(answers):
    with pytest.raises(ValueError):
        checks.grade_choices(FITS_STEP, answers, 16)


def test_s11_tc08_room_prefers_the_measured_number():
    from langchain_core.messages import AIMessage, ToolMessage
    from src.coach import thread

    def call(name, args, answer, cid):
        return [AIMessage(content="", tool_calls=[{"id": cid, "name": name, "args": args, "type": "tool_call"}]), ToolMessage(content=answer, tool_call_id=cid)]

    typed = call("number_card", {"step_id": "machine.2"}, '{"value": 512}', "n1")
    measured = call("run_check", {"step_id": "machine.2"}, '{"passed": false, "checked": true, "measured": 16}', "r1")
    stub_card = call("check_result", {"step_id": "machine.2", "checked": True, "measured": 32}, "rendered", "c1")
    assert thread.room_for(typed) == 512
    assert thread.room_for([*typed, *measured]) == 16
    assert thread.room_for([*typed, *stub_card]) == 32
    assert thread.room_for([]) is None


# ------------------------------------------------------------------ three bands (flow proposal, decision 6)
# A made-up step again: the rule is under half the room fits, bigger than the room doesn't, else depends.

BAND_STEP = {
    "id": "x.2",
    "check": {"kind": "ask", "question": "?", "rubric": "r", "choices": {
        "items": [{"label": "A", "gb": 2}, {"label": "B", "gb": 5}, {"label": "C", "gb": 10}, {"label": "D", "gb": 20}],
        "options": ["Yes", "Maybe", "No"], "grade": "band"}},
}


@pytest.mark.parametrize("room, answers", [
    (16, ["Yes", "Yes", "Maybe", "No"]),
    (32, ["Yes", "Yes", "Yes", "Maybe"]),
    (8, ["Yes", "Maybe", "No", "No"]),
])
def test_band_marks_each_file_against_the_room(room, answers):
    verdict = checks.grade_choices(BAND_STEP, answers, room)
    assert verdict["passed"] is True and verdict["measured"] == room


def test_band_edges_half_is_depends_and_the_whole_room_is_depends():
    assert checks.band(8, 16) == checks.DEPENDS
    assert checks.band(7.9, 16) == checks.FITS
    assert checks.band(16, 16) == checks.DEPENDS
    assert checks.band(16.1, 16) == checks.DOESNT


def test_band_pass_note_uses_the_three_words():
    note = checks.grade_choices(BAND_STEP, ["Yes", "Yes", "Maybe", "No"], 16)["note"]
    assert note == "On your 16 GB: 2 GB fits, 5 GB fits, 10 GB depends, 20 GB doesn't fit."


def test_band_a_wrong_middle_answer_names_the_file():
    verdict = checks.grade_choices(BAND_STEP, ["Yes", "Yes", "Yes", "No"], 16)
    assert verdict["passed"] is False and verdict["note"].startswith("Have another look at C.")


def test_band_needs_three_options():
    two = {"id": "x.3", "check": {**BAND_STEP["check"], "choices": {**BAND_STEP["check"]["choices"], "options": ["Yes", "No"]}}}
    with pytest.raises(ValueError):
        checks.grade_choices(two, ["Yes", "Yes", "No", "No"], 16)
