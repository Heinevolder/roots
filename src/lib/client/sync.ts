"use client";

import { ldb, getMeta, type Row, type StapleRow } from "./store";
import type { CatalogueIndex } from "../catalogue-core";

export type Status = "live" | "connecting" | "weak" | "offline";

/** A request that hasn't answered by now counts as failed: shop Wi-Fi and one bar of 4G hang rather than error. */
const TIMEOUT = 8_000;

// Did the last request get through? Drives the "weak connection" state.
let reachable = true;
const reachListeners = new Set<() => void>();
function setReachable(ok: boolean) {
  if (ok === reachable) return;
  reachable = ok;
  reachListeners.forEach((f) => f());
}

async function request(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
    setReachable(true);
    return res;
  } catch (e) {
    setReachable(false);
    throw e;
  }
}

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
        const res = await request("/api/list", {
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
        const sentAt = Date.now();
        const res = await request(`/api/list?since=${since}`, { cache: "no-store" });
        if (res.status === 401) return redirectToLogin();
        if (!res.ok) return;
        const data = (await res.json()) as { rows: Row[]; rev: number; catalogue: CatalogueIndex; staples: StapleRow[]; recipes: Record<string, string>; range: { start: string; end: string } };
        await ldb.transaction("rw", ldb.rows, ldb.outbox, ldb.meta, async () => {
          const pending = new Set((await ldb.outbox.toArray()).map((o) => o.id));
          for (const r of data.rows) {
            const local = await ldb.rows.get(r.id);
            // Keep local edits the server hasn't seen, and ones made while this (possibly slow) answer was underway.
            if (local && local.updatedAt > r.updatedAt && (pending.has(r.id) || local.updatedAt >= sentAt)) continue;
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
export function startLiveSync(onStatus: (s: Status) => void): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let streamUp = false;
  let lastHeard = 0;

  const report = () => {
    if (!navigator.onLine) onStatus("offline");
    else if (!reachable) onStatus("weak");
    else onStatus(streamUp ? "live" : "connecting");
  };
  const heard = () => {
    lastHeard = Date.now();
    setReachable(true);
  };

  const open = () => {
    if (stopped || es) return;
    streamUp = false;
    report();
    es = new EventSource("/api/list/stream");
    es.addEventListener("open", () => {
      streamUp = true;
      heard();
      report();
      void sync();
    });
    es.addEventListener("ping", heard);
    es.addEventListener("list", async (e) => {
      heard();
      const rev = Number((e as MessageEvent).data);
      if (rev > ((await getMeta<number>("rev")) ?? 0)) void pull();
    });
    es.addEventListener("meta", () => {
      heard();
      void pull();
    });
    es.addEventListener("error", () => {
      streamUp = false;
      report();
      if (!navigator.onLine) close();
    });
  };
  const close = () => {
    es?.close();
    es = null;
    streamUp = false;
  };

  // A stream can die silently (e.g. walking from home Wi-Fi onto 4G). The server pings every 15 s;
  // hearing nothing for longer means the connection is gone, so say so and reconnect.
  // While edits wait in the outbox, keep retrying instead of waiting for the next tap.
  const watchdog = setInterval(async () => {
    if (!navigator.onLine) return;
    if (es && streamUp && Date.now() - lastHeard > 35_000) {
      setReachable(false);
      close();
      open();
    }
    if ((await ldb.outbox.count()) > 0) void push();
  }, 5_000);

  const onOnline = () => {
    void sync();
    open();
    report();
  };
  const onOffline = () => {
    close();
    report();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void sync();
      open();
    }
  };

  reachListeners.add(report);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  if (navigator.onLine) open();
  else report();

  return () => {
    stopped = true;
    close();
    clearInterval(watchdog);
    reachListeners.delete(report);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export async function finishShoppingRemote(): Promise<boolean> {
  await push();
  if ((await ldb.outbox.count()) > 0) return false;
  try {
    const res = await request("/api/list/finish", { method: "POST" });
    if (!res.ok) return false;
    await pull();
    return true;
  } catch {
    return false;
  }
}
