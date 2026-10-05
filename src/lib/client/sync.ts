"use client";

import { ldb, getMeta, type Row, type StapleRow } from "./store";
import type { CatalogueIndex } from "../catalogue-core";

let pushing: Promise<void> | null = null;
let pulling: Promise<void> | null = null;
let pullAgain = false;

/** Local-first write: IndexedDB now, server when we can. */
export function mutate(row: Row) {
  return mutateMany([row]);
}

/** Several local-first writes in one transaction. */
export async function mutateMany(rows: Row[]) {
  const now = Date.now();
  const next = rows.map((row) => ({ ...row, updatedAt: Math.max(now, (row.updatedAt ?? 0) + 1) }));
  await ldb.transaction("rw", ldb.rows, ldb.outbox, async () => {
    await ldb.rows.bulkPut(next);
    await ldb.outbox.bulkAdd(next.map((row) => ({ id: row.id, row })));
  });
  void push();
}

export function push(): Promise<void> {
  pushing ??= (async () => {
    try {
      for (;;) {
        const batch = await ldb.outbox.orderBy("seq").limit(100).toArray();
        if (!batch.length) return;
        const res = await fetch("/api/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch.map((b) => b.row) }),
        });
        if (res.status === 401) return redirectToLogin();
        if (!res.ok) return;
        await ldb.outbox.bulkDelete(batch.map((b) => b.seq!));
      }
    } catch {
      // offline: the outbox replays later
    } finally {
      pushing = null;
    }
  })();
  return pushing;
}

/** Pull rows changed since the last known server rev; last write wins per item. */
export function pull(): Promise<void> {
  if (pulling) {
    pullAgain = true;
    return pulling;
  }
  pulling = (async () => {
    try {
      do {
        pullAgain = false;
        const since = (await getMeta<number>("rev")) ?? 0;
        const res = await fetch(`/api/list?since=${since}`, { cache: "no-store" });
        if (res.status === 401) return redirectToLogin();
        if (!res.ok) return;
        const data = (await res.json()) as { rows: Row[]; rev: number; catalogue: CatalogueIndex; staples: StapleRow[]; recipes: Record<string, string>; range: { start: string; end: string } };
        await ldb.transaction("rw", ldb.rows, ldb.outbox, ldb.meta, async () => {
          const pending = new Set((await ldb.outbox.toArray()).map((o) => o.id));
          for (const r of data.rows) {
            const local = await ldb.rows.get(r.id);
            if (local && pending.has(r.id) && local.updatedAt > r.updatedAt) continue;
            await ldb.rows.put(r);
          }
          // Drop old tombstones locally.
          const old = await ldb.rows.filter((r) => r.deleted && Date.now() - r.updatedAt > 7 * 864e5).primaryKeys();
          await ldb.rows.bulkDelete(old);
          await ldb.meta.put({ key: "rev", value: data.rev });
          await ldb.meta.put({ key: "catalogue", value: data.catalogue });
          await ldb.meta.put({ key: "staples", value: data.staples });
          await ldb.meta.put({ key: "recipes", value: data.recipes });
          await ldb.meta.put({ key: "range", value: data.range });
          await ldb.meta.put({ key: "syncedAt", value: Date.now() });
        });
      } while (pullAgain);
    } catch {
      // offline
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

export async function sync() {
  await push();
  await pull();
}

function redirectToLogin() {
  // Full reload on purpose: the session cookie is gone.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (location.pathname !== "/login") location.href = "/login";
}

/** Live updates: SSE when online, resync on reconnect/focus. Returns a stop function. */
export function startLiveSync(onStatus: (s: "live" | "offline" | "connecting") => void): () => void {
  let es: EventSource | null = null;
  let stopped = false;

  const open = () => {
    if (stopped || es) return;
    onStatus("connecting");
    es = new EventSource("/api/list/stream");
    es.addEventListener("open", () => {
      onStatus("live");
      void sync();
    });
    es.addEventListener("list", async (e) => {
      const rev = Number((e as MessageEvent).data);
      if (rev > ((await getMeta<number>("rev")) ?? 0)) void pull();
    });
    es.addEventListener("meta", () => void pull());
    es.addEventListener("error", () => {
      onStatus(navigator.onLine ? "connecting" : "offline");
      if (!navigator.onLine) close();
    });
  };
  const close = () => {
    es?.close();
    es = null;
  };
  const onOnline = () => {
    void sync();
    open();
  };
  const onOffline = () => {
    onStatus("offline");
    close();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void sync();
      open();
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  if (navigator.onLine) open();
  else onStatus("offline");

  return () => {
    stopped = true;
    close();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export async function finishShoppingRemote(): Promise<boolean> {
  await push();
  if ((await ldb.outbox.count()) > 0) return false;
  try {
    const res = await fetch("/api/list/finish", { method: "POST" });
    if (!res.ok) return false;
    await pull();
    return true;
  } catch {
    return false;
  }
}
