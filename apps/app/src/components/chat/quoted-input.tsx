import { useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";
import { CopilotChatInput } from "@copilotkit/react-core/v2";
import { compose } from "./ask-about";
import { QuoteBlock, useQuote } from "./quote-block";
import { BOX_SELECTOR, focusStartBox, glideFrom, takeStartBox, useChatStart } from "./chat-start";

/**
 * CopilotChat's input slot with the quote above the stock input (story 8). The
 * question is sent with its quote composed in; a quote with no question is
 * never sent, and the quote clears once it has gone.
 */
function QuotedInputComponent(props: ComponentProps<typeof CopilotChatInput>) {
  const { quote, clear } = useQuote();
  const { welcome } = useChatStart();
  const wrapper = useRef<HTMLDivElement>(null);
  // The message box that replaces the start box starts where that one was and glides down.
  useLayoutEffect(() => {
    if (welcome) return;
    const box = wrapper.current?.querySelector<HTMLElement>(BOX_SELECTOR);
    if (box) glideFrom(box, takeStartBox());
  }, [welcome]);
  // The start box has the focus whenever the start screen shows (a fresh page, New chat, Restart
  // coach), once the screen has settled: a closing dialog hands focus back to its own button.
  useEffect(() => {
    if (!welcome) return;
    const frame = requestAnimationFrame(() => focusStartBox(wrapper.current));
    return () => cancelAnimationFrame(frame);
  }, [welcome]);
  const submit = (value: string) => {
    if (!quote) return props.onSubmitMessage?.(value);
    if (!value.trim()) return;
    props.onSubmitMessage?.(compose(quote, value));
    clear();
  };
  return (
    <div className="coach-quoted-input" ref={wrapper}>
      {quote && <QuoteBlock text={quote} onRemove={clear} />}
      {/* The start box takes the focus. The line under the box stays as room below it, empty once
          the coach can answer (the page's labels), so the box never sits on the window's edge. */}
      <CopilotChatInput {...props} autoFocus={props.autoFocus || welcome} onSubmitMessage={submit} />
    </div>
  );
}

/** The slot value: the wrapper carrying CopilotChatInput's own parts (SendButton and the rest). */
export const QuotedInput: typeof CopilotChatInput = Object.assign(QuotedInputComponent, CopilotChatInput);
