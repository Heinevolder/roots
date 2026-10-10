"use client";

import { useEffect, useState } from "react";
import { subscribePush, testPush, unsubscribePush, type SubscriptionJSON } from "./push-actions";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const toJSON = (sub: PushSubscription) => sub.toJSON() as SubscriptionJSON;

export function Notifications({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone Safari only offers push once Roots is opened from the Home Screen.
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        return setState(ios ? "install" : "unsupported");
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      if (!reg) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      if (existing) {
        setSub(existing);
        setState("on");
        // Re-register quietly: keeps the server in step if it ever dropped this device.
        setName((await subscribePush(toJSON(existing)).catch(() => null)) ?? "");
      } else setState("off");
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      setName((await subscribePush(toJSON(s), name)) ?? "");
      setSub(s);
      setState("on");
    } catch {
      setNote("Det lykkedes ikke. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!sub) return;
    setBusy(true);
    await unsubscribePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
    setSub(null);
    setState("off");
    setBusy(false);
  }

  async function test() {
    if (!sub) return;
    setNote((await testPush(sub.endpoint).catch(() => false)) ? "Sendt. Den burde dukke op om et øjeblik." : "Kunne ikke sende.");
  }

  return (
    <section className="mb-8">
      <h2 className="font-display text-xl font-semibold">Notifikationer</h2>
      <p className="mb-3 text-sm text-muted">
        Få besked, når andre lægger noget på indkøbslisten. Flere ting samles i én besked et par minutter efter.
      </p>

      {state === "unsupported" && <p className="text-sm text-muted">Denne browser kan ikke vise notifikationer fra Roots.</p>}
      {state === "install" && (
        <p className="text-sm text-muted">På iPhone skal Roots ligge på hjemmeskærmen: tryk Del → Føj til hjemmeskærm, og åbn Roots derfra.</p>
      )}
      {state === "denied" && (
        <p className="text-sm text-muted">Notifikationer er blokeret for Roots. Slå dem til i telefonens indstillinger for appen eller siden.</p>
      )}
      {state === "off" && (
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dit navn (vises til de andre)" className="field" maxLength={40} />
          <button onClick={turnOn} disabled={busy} className="btn-primary w-full">
            Slå notifikationer til
          </button>
        </div>
      )}
      {state === "on" && (
        <div className="space-y-2">
          <p className="text-sm">Slået til på denne enhed{name ? ` som ${name}` : ""}. Du får ikke besked om dine egne tilføjelser.</p>
          <div className="flex gap-2">
            <button onClick={test} className="btn-ghost flex-1">Send en prøve</button>
            <button onClick={turnOff} disabled={busy} className="btn-ghost flex-1">Slå fra</button>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
    </section>
  );
}
