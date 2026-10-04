"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { verify } from "@node-rs/argon2";
import { isHttps, sessionOptions, type SessionData } from "@/lib/session";

const g = globalThis as unknown as { __rootsLoginHits?: Map<string, number[]> };
const hits = (g.__rootsLoginHits ??= new Map<string, number[]>());

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

function passwordHash(): string {
  const raw = process.env.APP_PASSWORD_HASH ?? "";
  // Allow base64 to dodge "$" escaping in compose files.
  return raw.startsWith("$argon2") ? raw : Buffer.from(raw, "base64").toString("utf8");
}

export async function login(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  if (rateLimited(ip)) return { error: "For mange forsøg. Vent et minut." };

  const password = String(form.get("password") ?? "");
  const hash = passwordHash();
  if (!hash.startsWith("$argon2")) return { error: "APP_PASSWORD_HASH mangler på serveren." };

  let ok = false;
  try {
    ok = await verify(hash, password);
  } catch {}
  if (!ok) return { error: "Forkert adgangskode." };

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions(isHttps(h)));
  session.loggedIn = true;
  await session.save();
  redirect("/");
}

export async function logout() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions(isHttps(await headers())));
  session.destroy();
  redirect("/login");
}
