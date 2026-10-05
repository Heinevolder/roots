"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { setShareAction } from "../actions";

/** Public read-only link for people without a login (e.g. family). */
export function ShareButton({ slug, title, initialToken }: { slug: string; title: string; initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const origin = useSyncExternalStore(noop, () => location.origin, () => "");
  const url = token ? `${origin}/del/${token}` : "";

  async function send(link: string) {
    setCopied(false);
    if (navigator.share) {
      try {
        return await navigator.share({ title, url: link });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {}
  }

  const toggle = (on: boolean) =>
    start(async () => {
      setError(false);
      try {
        const t = await setShareAction(slug, on);
        setToken(t);
        // The tap may no longer count as a user gesture after the round trip; then the button below is there.
        if (t) await send(`${location.origin}/del/${t}`);
      } catch {
        setError(true);
      }
    });

  if (!token) {
    return (
      <div className="mt-8">
        <button className="btn-ghost w-full" disabled={pending} onClick={() => toggle(true)}>
          {pending ? "Laver link…" : "Del opskriften"}
        </button>
        {error && <p className="mt-2 text-center text-sm text-warm">Kunne ikke dele. Er der forbindelse?</p>}
      </div>
    );
  }

  return (
    <div className="card mt-8 p-4">
      <p className="text-sm font-medium">Opskriften er delt</p>
      <p className="mt-0.5 text-xs text-muted">Alle med linket kan se den, uden at logge ind.</p>
      <p className="mt-2 truncate rounded-lg bg-bg px-3 py-2 text-sm text-muted select-all">{url}</p>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary flex-1" onClick={() => send(url)}>
          {copied ? "Link kopieret" : "Send link"}
        </button>
        <button
          className="btn-ghost text-warm"
          disabled={pending}
          onClick={() => {
            if (confirm("Stop deling? Linket holder op med at virke.")) toggle(false);
          }}
        >
          Stop deling
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-warm">Kunne ikke gemme. Er der forbindelse?</p>}
    </div>
  );
}

const noop = () => () => {};
