"""Tests pinning the prompt contract to the canonical generateSandboxedUi tool."""

from src.prompt import SYSTEM_PROMPT


def test_prompt_uses_generate_sandboxed_ui_not_widget_renderer():
    assert "generateSandboxedUi" in SYSTEM_PROMPT
    assert "widgetRenderer" not in SYSTEM_PROMPT


def test_prompt_documents_ordered_params():
    # Anchored numbered-list needles pin the full documented stream order —
    # any reordering of the six params breaks the monotone index chain.
    anchored = [
        "1. initialHeight",
        "2. placeholderMessages",
        "3. css",
        "4. html",
        "5. jsFunctions",
        "6. jsExpressions",
    ]
    indices = []
    for needle in anchored:
        idx = SYSTEM_PROMPT.find(needle)
        assert idx >= 0, f"missing ordered param doc: {needle}"
        indices.append(idx)
    assert indices == sorted(indices), "param docs out of order"
    assert "parameter order" in SYSTEM_PROMPT.lower()
    # The order requirement itself must be flagged as exact/critical.
    assert "EXACT order" in SYSTEM_PROMPT


def test_prompt_documents_sandbox_bridge_and_restrictions():
    assert "Websandbox.connection.remote" in SYSTEM_PROMPT
    assert "localStorage" in SYSTEM_PROMPT
    assert "cookies" in SYSTEM_PROMPT.lower()
    assert "same-origin fetch" in SYSTEM_PROMPT.lower()


def test_prompt_documents_library_imports_for_sandbox():
    assert "await import('three')" in SYSTEM_PROMPT
    assert '<script type="module">' in SYSTEM_PROMPT
    assert "bare" in SYSTEM_PROMPT.lower()
    assert "importmap" in SYSTEM_PROMPT.lower().replace(" ", "")


def test_prompt_forbids_top_level_await_in_js_channels():
    # jsFunctions/jsExpressions are executed via websandbox runCode as classic
    # scripts, where top-level await is a SyntaxError that fails silently. The
    # prompt must direct dynamic imports inside async functions.
    normalized = " ".join(SYSTEM_PROMPT.lower().split())
    assert "top-level `await`" in normalized or "top-level await" in normalized
    assert "classic script" in normalized
    assert "inside an async function" in normalized
