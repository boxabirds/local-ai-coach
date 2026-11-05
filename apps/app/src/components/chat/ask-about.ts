/**
 * Asking about something the coach said (Ceetrix story 8): which bubbles can be
 * quoted, the words a quote takes from each, and how a quote travels inside the
 * message text as Markdown ("> " lines, a blank line, then the question), so it
 * is saved with the chat and read by either coach without new message fields.
 */

/** Coach bubbles that can be quoted, innermost first. */
export const QUOTABLE = [".coach-bubble", ".coach-step__text", ".coach-figure", '[data-testid="copilot-assistant-message"]'].join(", ");
/** Marks a quotable element so keyboard handlers elsewhere can leave Enter to the quote. */
export const QUOTABLE_ATTR = "data-ask-quotable";
export const SELECTED_ATTR = "data-ask-selected";
const CONTROLS = "button, a, input, textarea, select, label, [role='button'], .coach-figure__choices, [data-ask-control]";
const USER_MESSAGE = '[data-testid="copilot-user-message"]';
const CARD = ".coach-card";
const QUOTE_LINE = /^> ?/;

function words(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** The words a quote of this bubble takes. A coach reply gives its text, never its cards. */
export function quoteText(el: Element): string {
  if (el.matches(".coach-figure")) {
    const title = words(el.querySelector(".coach-figure__title")?.textContent);
    const result = words(el.querySelector('[data-testid="coach-figure-result"]')?.textContent);
    return [title, result].filter(Boolean).join("\n");
  }
  if (el.matches('[data-testid="copilot-assistant-message"]')) {
    return Array.from(el.querySelectorAll(".answer-markdown")).map((part) => words(part.textContent)).filter(Boolean).join("\n");
  }
  return words(el.textContent);
}

/** The bubble a click or key on this element would quote, or null. */
export function quotable(target: Element, root: Element): Element | null {
  if (!root.contains(target) || target.closest(CONTROLS) || target.closest(USER_MESSAGE)) return null;
  const el = target.closest(QUOTABLE);
  if (!el || !root.contains(el)) return null;
  // Inside a card, only the step's text or a figure can be quoted, not the card's frame.
  const card = target.closest(CARD);
  if (card && !card.contains(el) && el.matches('[data-testid="copilot-assistant-message"]')) return null;
  return quoteText(el) ? el : null;
}

export function compose(quote: string, question: string): string {
  const quoted = quote.split("\n").map((line) => `> ${line}`).join("\n");
  return `${quoted}\n\n${question.trim()}`;
}

/** A message's leading quote and its question; null quote when it does not start with one. */
export function split(content: string): { quote: string | null; question: string } {
  const lines = content.split("\n");
  let n = 0;
  while (n < lines.length && QUOTE_LINE.test(lines[n]) && lines[n].startsWith(">")) n += 1;
  if (n === 0 || n === lines.length || lines[n].trim() !== "") return { quote: null, question: content };
  return { quote: lines.slice(0, n).map((line) => line.replace(QUOTE_LINE, "")).join("\n"), question: lines.slice(n + 1).join("\n").trim() };
}
