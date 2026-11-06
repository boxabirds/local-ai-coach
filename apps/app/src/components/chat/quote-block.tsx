import { createContext, useContext } from "react";

/** The quote waiting in the message box, shared by the page and the input slot (story 8). */
export const QuoteContext = createContext<{ quote: string | null; clear: () => void }>({ quote: null, clear: () => {} });

export function useQuote() {
  return useContext(QuoteContext);
}

const SHOWN_LINES = 3;

/** A quote as the learner sees it: plain text, never editable; the first lines, then an ellipsis. */
export function QuoteBlock({ text, onRemove }: { text: string; onRemove?: () => void }) {
  const lines = text.split("\n");
  const shown = lines.length > SHOWN_LINES ? [...lines.slice(0, SHOWN_LINES - 1), `${lines[SHOWN_LINES - 1]}…`] : lines;
  return (
    <div className="coach-quote" data-testid="coach-quote" title={text}>
      <blockquote className="coach-quote__text">
        {shown.map((line, i) => (
          <span key={i} className="coach-quote__line">
            {line}
          </span>
        ))}
      </blockquote>
      {onRemove && (
        <button type="button" className="coach-quote__remove" aria-label="Remove the quote" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}
