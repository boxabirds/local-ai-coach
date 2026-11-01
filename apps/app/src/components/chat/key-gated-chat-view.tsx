"use client";

import { CopilotChatView } from "@copilotkit/react-core/v2";
import type { ComponentProps } from "react";
import { useProviderKeys } from "./provider-keys";

/**
 * The stub coach (apps/agent/src/coach/stub.py) needs no keys. Set
 * NEXT_PUBLIC_COACH_STUB=1 at build or dev time, with the runtime pointed at
 * the stub (LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8123/stub).
 */
export const COACH_STUB = process.env.NEXT_PUBLIC_COACH_STUB === "1";
export const STUB_BANNER = "Stub coach, no model";
const STUB_BANNER_DETAIL = "Fixed wording, no keys, nothing leaves this machine.";

/** Shown in the page header while the stub coach is on. */
export function StubBadge() {
  if (!COACH_STUB) return null;
  return (
    <span className="coach-stub-badge" role="status" title={STUB_BANNER_DETAIL} data-testid="coach-stub-banner">
      {STUB_BANNER}
    </span>
  );
}

/** Gate submission before CopilotKit adds a message or starts a provider request. */
function KeyGatedChatViewComponent(props: ComponentProps<typeof CopilotChatView>) {
  const { hasKeys, draft, setDraft, setKeysOpen } = useProviderKeys();
  const open = COACH_STUB || hasKeys;
  return (
      <CopilotChatView
        {...props}
        inputValue={draft}
        onInputChange={setDraft}
        onSubmitMessage={(value) => {
          if (!open) {
            setDraft(value);
            setKeysOpen(true);
            return;
          }
          setDraft("");
          props.onSubmitMessage?.(value);
        }}
        onSelectSuggestion={(suggestion, index) => {
          if (!open) {
            setDraft(suggestion.message);
            setKeysOpen(true);
            return;
          }
          setDraft("");
          props.onSelectSuggestion?.(suggestion, index);
        }}
      />
  );
}

// Keep the compound-component slots expected by CopilotKit’s chatView contract.
export const KeyGatedChatView = Object.assign(KeyGatedChatViewComponent, CopilotChatView);
