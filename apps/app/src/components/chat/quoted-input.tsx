"use client";

import type { ComponentProps } from "react";
import { CopilotChatInput } from "@copilotkit/react-core/v2";
import { compose } from "./ask-about";
import { QuoteBlock, useQuote } from "./quote-block";

/**
 * CopilotChat's input slot with the quote above the stock input (story 8). The
 * question is sent with its quote composed in; a quote with no question is
 * never sent, and the quote clears once it has gone.
 */
function QuotedInputComponent(props: ComponentProps<typeof CopilotChatInput>) {
  const { quote, clear } = useQuote();
  const submit = (value: string) => {
    if (!quote) return props.onSubmitMessage?.(value);
    if (!value.trim()) return;
    props.onSubmitMessage?.(compose(quote, value));
    clear();
  };
  return (
    <div className="coach-quoted-input">
      {quote && <QuoteBlock text={quote} onRemove={clear} />}
      <CopilotChatInput {...props} onSubmitMessage={submit} />
    </div>
  );
}

/** The slot value: the wrapper carrying CopilotChatInput's own parts (SendButton and the rest). */
export const QuotedInput: typeof CopilotChatInput = Object.assign(QuotedInputComponent, CopilotChatInput);
