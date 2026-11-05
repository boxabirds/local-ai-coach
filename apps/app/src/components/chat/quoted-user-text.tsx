"use client";

import type { ComponentProps } from "react";
import { CopilotChatUserMessage } from "@copilotkit/react-core/v2";
import { split } from "./ask-about";
import { QuoteBlock } from "./quote-block";

/** A sent question: its quote above it when it starts with one, else the stock text (story 8). */
export function QuotedUserText(props: ComponentProps<typeof CopilotChatUserMessage.MessageRenderer>) {
  const { quote, question } = split(props.content);
  if (quote === null) return <CopilotChatUserMessage.MessageRenderer {...props} />;
  return (
    <div className="coach-quoted-question">
      <QuoteBlock text={quote} />
      <CopilotChatUserMessage.MessageRenderer {...props} content={question} />
    </div>
  );
}
