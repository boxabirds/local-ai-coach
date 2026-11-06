import { CopilotChatView } from "@copilotkit/react-core/v2";
import { useMemo, type ComponentProps } from "react";
import { useDraft, useProviderKeys } from "./provider-keys";
import { ChatStartContext, glideToChat } from "./chat-start";

/**
 * The stub coach (apps/agent/src/coach/stub.py) needs no keys. Set
 * COACH_STUB=1 at build or dev time, with the runtime pointed at
 * the stub (LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8123/stub).
 */
export const COACH_STUB = process.env.COACH_STUB === "1";
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

const NO_STARTERS: NonNullable<ComponentProps<typeof CopilotChatView>["suggestions"]> = [];

/** Gate submission before CopilotKit adds a message or starts a provider request. */
function KeyGatedChatViewComponent(props: ComponentProps<typeof CopilotChatView>) {
  const { hasKeys, setKeysOpen } = useProviderKeys();
  const { draft, setDraft } = useDraft();
  const open = COACH_STUB || hasKeys;
  const welcome = (props.messages?.length ?? 0) === 0;
  // The first message glides the start box down into the message box.
  const send = (action: () => void) => (welcome ? glideToChat(action) : action());
  const start = useMemo(() => ({ welcome }), [welcome]);
  return (
    <ChatStartContext.Provider value={start}>
      <CopilotChatView
        {...props}
        // The starters belong to the start screen. Judged here, from the conversation on screen:
        // CopilotKit's own "before-first-message" counts a shared copy of the agent, not this
        // conversation, so it hid them after New chat and showed them in a restored chat.
        suggestions={welcome ? props.suggestions : NO_STARTERS}
        inputValue={draft}
        onInputChange={setDraft}
        onSubmitMessage={(value) => {
          if (!open) {
            setDraft(value);
            setKeysOpen(true);
            return;
          }
          send(() => {
            setDraft("");
            props.onSubmitMessage?.(value);
          });
        }}
        onSelectSuggestion={(suggestion, index) => {
          if (!open) {
            setDraft(suggestion.message);
            setKeysOpen(true);
            return;
          }
          send(() => {
            setDraft("");
            props.onSelectSuggestion?.(suggestion, index);
          });
        }}
      />
    </ChatStartContext.Provider>
  );
}

// Keep the compound-component slots expected by CopilotKit’s chatView contract.
export const KeyGatedChatView = Object.assign(KeyGatedChatViewComponent, CopilotChatView);
