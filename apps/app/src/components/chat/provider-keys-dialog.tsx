import { useEffect, useRef, useState } from "react";
import { useProviderKeys } from "./provider-keys";
import "./provider-keys.css";

/** Where keys go, in the coach's voice (Ceetrix story 16). */
export function KEPT_SENTENCE(saved: boolean, where: string | null): string {
  if (saved) return "Your keys are saved in this Mac's Keychain, so you won't need them again.";
  if (where === "keychain") return "I'll keep your keys in this Mac's Keychain, so you only paste them once.";
  return "This computer can't keep keys yet, so I hold them only until you refresh.";
}

/** Where each provider makes keys. */
export const KEY_PAGES = {
  openai: "https://platform.openai.com/api-keys",
  jev: "https://console.typesafe.ai/keys",
} as const;

function KeyPage({ href, children }: { href: string; children: string }) {
  return <a className="provider-keys-get" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function ProviderKeysDialog({ onClose, disabled = false }: { onClose: () => void; disabled?: boolean }) {
  const { hasKeys, saved, where, save, clear, server, setServer } = useProviderKeys();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [openai, setOpenai] = useState("");
  const [jev, setJev] = useState("");
  const [pending, setPending] = useState(false);
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState<string | null>(null);
  // Story 21: any OpenAI-compatible server instead of OpenAI. Its address and model aren't secret.
  const [other, setOther] = useState(server !== null);
  const [baseUrl, setBaseUrl] = useState(server?.base_url ?? "");
  const [model, setModel] = useState(server?.model ?? "");
  const serverReady = !other || (baseUrl.trim() !== "" && model.trim() !== "");

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      request.current?.abort();
      opener?.focus();
    };
  }, []);

  const edit = (setter: (value: string) => void, value: string) => {
    setter(value);
    setValidated(false);
    setError(null);
  };
  const testConnection = async () => {
    if (pending || disabled || !openai.trim() || !jev.trim() || !serverReady) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setValidated(false);
    setError(null);
    try {
      const response = other
        ? await fetch("/api/coach-provider/check", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ base_url: baseUrl.trim(), model: model.trim(), key: openai.trim(), jev: jev.trim() }),
            signal: controller.signal,
            cache: "no-store",
          })
        : await fetch("/api/provider-keys", {
            method: "POST",
            headers: { "x-openai-api-key": openai.trim(), "x-jev-api-key": jev.trim() },
            signal: controller.signal,
            cache: "no-store",
          });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || result.ok !== true) {
        // The same-origin proxy maps provider failures to fixed, sanitized messages.
        setError(typeof result.error === "string" ? result.error : "Could not validate both keys. Check your keys and provider access, then try again.");
      } else {
        setValidated(true);
      }
    } catch {
      if (!controller.signal.aborted) setError("Could not connect. Check your connection and try again.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return (
    <dialog ref={dialog} className="provider-keys-dialog" aria-labelledby="provider-keys-title" aria-describedby="provider-keys-privacy" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2 id="provider-keys-title">{hasKeys ? "API keys" : "Add API keys to start"}</h2>
      {!hasKeys && <p>Connect OpenAI for answers and Jev for choosing visualizations. Your message will stay ready to send.</p>}
      <p id="provider-keys-privacy">{KEPT_SENTENCE(saved, where)} They go from this computer straight to each provider, and the usage is charged to your own accounts.</p>
      <p>Saving or clearing keys starts a new chat.</p>
      <form onSubmit={(event) => { event.preventDefault(); void testConnection(); }}>
        <label htmlFor="provider-jev-key">Jev API key</label>
        <KeyPage href={KEY_PAGES.jev}>Get a Jev key</KeyPage>
        <input id="provider-jev-key" type="password" maxLength={4096} autoComplete="off" spellCheck={false} autoCapitalize="none" value={jev} onChange={(event) => edit(setJev, event.target.value)} disabled={pending || disabled} />
        <label htmlFor="provider-openai-key">{other ? "API key for that server" : "OpenAI API key"}</label>
        {!other && <KeyPage href={KEY_PAGES.openai}>Get an OpenAI key</KeyPage>}
        <input id="provider-openai-key" type="password" maxLength={4096} autoComplete="off" spellCheck={false} autoCapitalize="none" value={openai} onChange={(event) => edit(setOpenai, event.target.value)} disabled={pending || disabled} />
        <label className="provider-keys-other">
          <input
            type="checkbox"
            checked={other}
            onChange={(event) => {
              setOther(event.target.checked);
              setValidated(false);
              setError(null);
            }}
            disabled={pending || disabled}
          />{" "}
          Other OpenAI-compatible server
        </label>
        {other && (
          <>
            <label htmlFor="provider-base-url">Server address</label>
            <input id="provider-base-url" type="url" placeholder="https://api.together.ai/v1" maxLength={512} autoComplete="off" spellCheck={false} autoCapitalize="none" value={baseUrl} onChange={(event) => edit(setBaseUrl, event.target.value)} disabled={pending || disabled} />
            <label htmlFor="provider-model">Model name</label>
            <input id="provider-model" type="text" placeholder="zai-org/GLM-5.3-Flash" maxLength={512} autoComplete="off" spellCheck={false} autoCapitalize="none" value={model} onChange={(event) => edit(setModel, event.target.value)} disabled={pending || disabled} />
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {notSaved && <p role="alert">{notSaved}</p>}
        <p role="status" aria-live="polite">{pending ? "Checking both providers…" : validated ? "Both keys work. Save to start a new chat." : hasKeys ? "Your own keys are active for this session." : "Both keys are required to start chatting."}</p>
        <div className="provider-keys-actions">
          {hasKeys && <button type="button" disabled={pending || disabled} onClick={() => { void clear().then(onClose); }}>{saved ? "Forget my keys" : "Clear keys"}</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pending || disabled || !openai.trim() || !jev.trim() || !serverReady}>Test connection</button>
          <button
            type="button"
            className="provider-keys-save"
            disabled={!validated || pending || disabled}
            onClick={() => {
              setPending(true);
              // The server choice first: if it can't be kept, the keys aren't saved for the wrong server.
              const choice = other ? { base_url: baseUrl.trim(), model: model.trim() } : null;
              const changed = JSON.stringify(choice) !== JSON.stringify(server);
              void (changed ? setServer(choice) : Promise.resolve(null)).then((serverError) => {
                if (serverError) {
                  setPending(false);
                  setNotSaved(serverError);
                  return;
                }
                return save({ openai: openai.trim(), jev: jev.trim() }).then((result) => {
                setPending(false);
                // Wipe the typed keys from the form either way; nothing on this page keeps them.
                setOpenai("");
                setJev("");
                setValidated(false);
                if (result.error) setNotSaved(result.error);
                else onClose();
                });
              });
            }}
          >
            Save keys
          </button>
        </div>
      </form>
    </dialog>
  );
}
