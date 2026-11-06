"use client";

import { useEffect, type RefObject } from "react";
import { answers, followAfterScroll, learnerActed } from "./follow-end";

/**
 * The only thing that scrolls the chat (Ceetrix story 28). It follows the end of the conversation
 * while the learner is at the end, so new words and cards come into view as they arrive; leaves
 * the learner alone once they scroll up to reread; and follows again when they act (press a
 * button in the chat, Space or Enter to go on, send a message, answer a card) or scroll back to
 * the end. A restored conversation opens at its end, because it starts out following.
 *
 * Whether it is following lives in a plain variable, not React state, so scrolling never redraws
 * anything; listeners are passive. CopilotKit's own autoScroll stays off (upstream 0424b17): it
 * belongs to the scroll view ReaderScrollView replaces.
 */

const SCROLLER = ".reader-scroll-view";

/** What FollowEnd needs of the agent: its messages, and to hear when they change. */
export type FollowAgent = {
  messages: readonly { role?: string }[];
  subscribe: (subscriber: { onMessagesChanged?: () => void }) => { unsubscribe: () => void };
};

export function FollowEnd({ root, agent }: { root: RefObject<HTMLElement | null>; agent: FollowAgent }): null {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let following = true;
    let scroller: HTMLElement | null = null;
    let resize: ResizeObserver | null = null;
    let children: MutationObserver | null = null;
    let seen = answers(agent.messages);
    let lastTop = 0;

    const toEnd = () => {
      if (!scroller) return;
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      lastTop = scroller.scrollTop;
    };
    const follow = () => {
      following = true;
      toEnd();
    };
    const onScroll = () => {
      if (!scroller) return;
      following = followAfterScroll(following, lastTop, scroller);
      lastTop = scroller.scrollTop;
    };
    const detach = () => {
      children?.disconnect();
      resize?.disconnect();
      scroller?.removeEventListener("scroll", onScroll);
      children = null;
      resize = null;
      scroller = null;
    };
    const attach = (found: HTMLElement) => {
      scroller = found;
      following = true; // a new scroller is a new or restored conversation: start at its end
      lastTop = found.scrollTop;
      scroller.addEventListener("scroll", onScroll, { passive: true });
      if (typeof ResizeObserver !== "undefined") {
        resize = new ResizeObserver(() => {
          if (following) toEnd();
        });
        // The scroller itself too: a shorter window must keep the end in view.
        resize.observe(found);
        Array.from(found.children).forEach((child) => resize!.observe(child));
        children = new MutationObserver((records) =>
          records.forEach((record) => record.addedNodes.forEach((node) => node instanceof Element && resize?.observe(node))),
        );
        children.observe(found, { childList: true });
      }
      toEnd();
    };

    // The scroller exists only once the conversation has started, and the chat replaces it with a
    // new one on a restore or New chat: always follow whichever one is on the page now.
    const sync = () => {
      const found = host.querySelector<HTMLElement>(SCROLLER);
      if (found === scroller) return;
      detach();
      if (found) attach(found);
    };
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(host, { childList: true, subtree: true });

    const onAct = (event: Event) => {
      if (learnerActed(event, host)) follow();
    };
    host.addEventListener("click", onAct, { passive: true });
    document.addEventListener("keydown", onAct, { passive: true });
    const subscription = agent.subscribe({
      onMessagesChanged: () => {
        const now = answers(agent.messages);
        if (now > seen) follow();
        seen = now;
      },
    });

    return () => {
      watch.disconnect();
      detach();
      host.removeEventListener("click", onAct);
      document.removeEventListener("keydown", onAct);
      subscription.unsubscribe();
    };
  }, [root, agent]);
  return null;
}
