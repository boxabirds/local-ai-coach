import { useEffect, useRef, useState } from "react";
import { keepNote, saveFeedbackFile, type Coach } from "./feedback";
import "./provider-keys.css";

/**
 * Send feedback (Ceetrix story 34): an optional note, then one file of every new rating, note and
 * error, saved through the browser. The tester sends it to the author themselves; nothing is sent.
 */
export function feedbackLabel(unsent: number | null): string {
  return unsent ? `Send feedback (${unsent})` : "Send feedback";
}

type Props = {
  unsent: number | null;
  threadId: string;
  messages: readonly unknown[];
  coach: Coach;
  onClose: () => void;
  onSaved: () => void;
};

export function FeedbackDialog({ unsent, threadId, messages, coach, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  // The note already kept, so trying again after a failed file doesn't keep it twice.
  const [kept, setKept] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => opener?.focus();
  }, []);

  const text = note.trim();
  const nothing = !text && !unsent;

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      if (text && kept !== text) {
        const result = await keepNote(threadId, text, coach, messages);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setKept(text);
      }
      const file = await saveFeedbackFile();
      if (!file.ok) {
        setError(file.error);
        return;
      }
      setSaved(file.filename);
      onSaved();
    } finally {
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="provider-keys-dialog"
      aria-labelledby="feedback-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id="feedback-title">Send feedback</h2>
      {saved ? (
        <p role="status">
          I&apos;ve saved <strong>{saved}</strong> on this computer, usually in your Downloads folder. Nothing has been sent.
          Send the file to the person who asked you to try the coach, by email or however you like.
        </p>
      ) : (
        <>
          <p>Tell me what worked and what didn&apos;t. To rate one of my replies, point at it and choose Good or Not good.</p>
          <label htmlFor="feedback-note">Your note</label>
          <textarea id="feedback-note" rows={5} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} />
          <p>
            I put your ratings and notes, the conversations they&apos;re about and any errors in one file, and save it on
            this computer. You send it yourself. Your API keys are never in it.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="provider-keys-actions">
        <button type="button" onClick={onClose} disabled={pending}>Close</button>
        {!saved && (
          <button type="button" className="provider-keys-save" onClick={() => void save()} disabled={pending || nothing}>
            Save feedback file
          </button>
        )}
      </div>
    </dialog>
  );
}
