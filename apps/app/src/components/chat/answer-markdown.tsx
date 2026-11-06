import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { CopilotChatAssistantMessage } from "@copilotkit/react-core/v2";
import { observeAnswerBlocks } from "./reveal-blocks";
import { useThrottledText } from "./use-throttled-text";
import { fadeNewText, textLength } from "./fade-new-text";

/**
 * The coach's written answer. It grows in half-second steps and each step's new words fade in
 * (Ceetrix story 24); new blocks still slide in (reveal-blocks). The Markdown is the first child,
 * the fade's covers a layer after it that this component owns.
 */
export function AnswerMarkdown(
  props: ComponentProps<typeof CopilotChatAssistantMessage.MarkdownRenderer>,
) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  // Characters already on screen; null until the first draw, which never fades (a restored answer).
  const drawn = useRef<number | null>(null);
  const content = useThrottledText(typeof props.content === "string" ? props.content : "");

  useLayoutEffect(() => {
    const markdown = host.current?.firstElementChild;
    if (markdown instanceof HTMLElement) return observeAnswerBlocks(markdown);
  }, []);

  useLayoutEffect(() => {
    const markdown = host.current?.firstElementChild;
    if (!(markdown instanceof HTMLElement) || !layer.current) return;
    drawn.current = drawn.current === null ? textLength(markdown) : fadeNewText(markdown, layer.current, drawn.current);
  }, [content]);

  return (
    // A written reply sits in a bubble, like the story's sentences; a message that is only cards
    // has no words and no bubble (Julian, 2026-11-06).
    <div ref={host} className={content.trim() ? "answer-markdown coach-reply" : "answer-markdown"}>
      <CopilotChatAssistantMessage.MarkdownRenderer {...props} content={content} />
      <div ref={layer} className="answer-chunk-layer" aria-hidden="true" />
    </div>
  );
}
