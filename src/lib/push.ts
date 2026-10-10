import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, inArray, ne } from "drizzle-orm";
import webpush, { WebPushError } from "web-push";
import { db, schema } from "./db";

const { pushSubscriptions, settings, listItems } = schema;

export const DEVICE_COOKIE = "roots_device";

/** Additions are pooled per device: sent 2 min after the last one, at most 10 min after the first. */
const QUIET_MS = 2 * 60_000;
const MAX_WAIT_MS = 10 * 60_000;

/** The roots_device cookie, if this browser ever turned notifications on. */
export async function currentDevice(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}

export async function ensureDevice(secure: boolean): Promise<string> {
  const jar = await cookies();
  const id = jar.get(DEVICE_COOKIE)?.value ?? randomUUID();
  jar.set(DEVICE_COOKIE, id, { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 * 5, path: "/" });
  return id;
}

function getSetting(key: string) {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}
function setSetting(key: string, value: string) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

/** VAPID keys are made once and kept in the database, so there is nothing to configure. */
function vapidKeys(): { publicKey: string; privateKey: string } {
  const stored = getSetting("vapid");
  if (stored) return JSON.parse(stored);
  const keys = webpush.generateVAPIDKeys();
  setSetting("vapid", JSON.stringify(keys));
  return keys;
}

export function vapidPublicKey(): string {
  return vapidKeys().publicKey;
}

/** Push services want a contact URL; the app's own https address is enough. */
export function rememberOrigin(origin: string) {
  if (origin.startsWith("https://") && getSetting("push_origin") !== origin) setSetting("push_origin", origin);
}

export function saveSubscription(sub: { endpoint: string; p256dh: string; auth: string }, device: string, name: string | null | undefined): string | null {
  const existing = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).get();
  const row = { ...sub, device, name: name === undefined ? (existing?.name ?? null) : name || null, createdAt: existing?.createdAt ?? Date.now() };
  db.insert(pushSubscriptions).values(row).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row }).run();
  return row.name;
}

export function deleteSubscription(endpoint: string) {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export function getSubscription(endpoint: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
}

type Sub = typeof pushSubscriptions.$inferSelect;

async function send(subs: Sub[], payload: object) {
  const { publicKey, privateKey } = vapidKeys();
  const vapidDetails = { subject: getSetting("push_origin") ?? "mailto:roots@example.com", publicKey, privateKey };
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails,
          TTL: 12 * 60 * 60,
        });
      } catch (e) {
        // 404/410: the browser dropped the subscription (app removed, permission revoked).
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) deleteSubscription(s.endpoint);
        else console.error("Roots: push fejlede", e instanceof WebPushError ? `${e.statusCode} ${e.body}` : e);
      }
    }),
  );
}

export async function sendTest(endpoint: string): Promise<boolean> {
  const sub = getSubscription(endpoint);
  if (!sub) return false;
  await send([sub], { title: "Roots", body: "Notifikationer virker 🎉", url: "/liste" });
  return true;
}

type Pool = { ids: Set<string>; first: number; timer: NodeJS.Timeout };
const g = globalThis as unknown as { __rootsPushPools?: Map<string, Pool> };
const pools = (g.__rootsPushPools ??= new Map());

/** Someone (on `device`, null if unknown) added these list rows; tell the other devices in a moment. */
export function queueAdded(device: string | null, ids: string[]) {
  if (!ids.length) return;
  const key = device ?? "";
  const now = Date.now();
  const pool = pools.get(key) ?? { ids: new Set<string>(), first: now, timer: undefined as unknown as NodeJS.Timeout };
  clearTimeout(pool.timer);
  for (const id of ids) pool.ids.add(id);
  pool.timer = setTimeout(() => void flush(key), Math.max(0, Math.min(QUIET_MS, pool.first + MAX_WAIT_MS - now)));
  pools.set(key, pool);
}

async function flush(key: string) {
  const pool = pools.get(key);
  pools.delete(key);
  if (!pool) return;
  try {
    // Only what is still on the list: an item added and ticked off within the window is no news.
    const rows = db
      .select({ id: listItems.id, item: listItems.item })
      .from(listItems)
      .where(and(inArray(listItems.id, [...pool.ids]), eq(listItems.deleted, false), eq(listItems.checked, false), eq(listItems.dismissed, false)))
      .all();
    if (!rows.length) return;
    const order = [...pool.ids];
    const items = [...new Set(rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((r) => r.item))];
    const from = key ? (db.select({ name: pushSubscriptions.name }).from(pushSubscriptions).where(eq(pushSubscriptions.device, key)).all().find((s) => s.name)?.name ?? null) : null;
    const subs = key
      ? db.select().from(pushSubscriptions).where(ne(pushSubscriptions.device, key)).all()
      : db.select().from(pushSubscriptions).all();
    if (subs.length) await send(subs, { kind: "list", items, from, url: "/liste" });
  } catch (e) {
    console.error("Roots: kunne ikke sende notifikationer", e);
  }
}
