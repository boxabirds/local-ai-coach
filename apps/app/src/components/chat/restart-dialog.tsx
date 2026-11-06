import { useEffect, useRef, useState } from "react";
import "./provider-keys.css";

/**
 * Restart coach (Ceetrix story 23): asks first, then the agent puts the learner's progress and
 * permission aside (kept in a backup) and the chat starts again from the beginning.
 */
export const RESTART_URL = "/api/coach-restart";
const NOT_DONE = "I couldn't restart, so nothing changed.";

export function RestartDialog({ onClose, onRestarted }: { onClose: () => void; onRestarted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Restart has the focus, so Enter restarts (Julian); Escape and Cancel keep everything.
  const confirm = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    confirm.current?.focus();
    return () => opener?.focus();
  }, []);

  const restart = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(RESTART_URL, { method: "POST", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(`${NOT_DONE}${typeof data?.error === "string" ? ` ${data.error}` : ""}`);
        return;
      }
      onRestarted();
      onClose();
    } catch {
      setError(`${NOT_DONE} I can't reach my agent.`);
    } finally {
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="provider-keys-dialog"
      aria-labelledby="restart-title"
      aria-describedby="restart-what"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id="restart-title">Start the coach again?</h2>
      <p id="restart-what">
        This clears your progress, your permission for me to look at this computer, and this conversation. You start again
        with Priya&apos;s story.
      </p>
      <p>Your keys and server stay. I keep a copy of your progress in the coach&apos;s old folder, in case you change your mind.</p>
      {error && <p role="alert">{error}</p>}
      <div className="provider-keys-actions">
        <button type="button" onClick={onClose} disabled={pending}>Cancel</button>
        <button ref={confirm} type="button" className="provider-keys-save" onClick={() => void restart()} disabled={pending}>
          {pending ? "Restarting…" : "Restart"}
        </button>
      </div>
    </dialog>
  );
}
