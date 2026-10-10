"use server";

import { headers } from "next/headers";
import { isHttps } from "@/lib/session";
import { deleteSubscription, ensureDevice, rememberOrigin, saveSubscription, sendTest } from "@/lib/push";

export type SubscriptionJSON = { endpoint: string; keys: { p256dh: string; auth: string } };

/** `name` undefined keeps the stored name (used to re-register silently on page load). */
export async function subscribePush(sub: SubscriptionJSON, name?: string): Promise<string | null> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Ugyldigt abonnement");
  const h = await headers();
  const secure = isHttps(h);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (secure && host) rememberOrigin(`https://${host}`);
  const device = await ensureDevice(secure);
  return saveSubscription({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device, name?.trim().slice(0, 40));
}

export async function unsubscribePush(endpoint: string) {
  deleteSubscription(endpoint);
}

export async function testPush(endpoint: string): Promise<boolean> {
  return sendTest(endpoint);
}
