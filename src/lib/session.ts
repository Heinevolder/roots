// Shared by proxy and server code; no Node-only imports.
import type { SessionOptions } from "iron-session";

export type SessionData = { loggedIn?: boolean };

export const COOKIE_NAME = "roots_session";
export const MAX_AGE = 60 * 60 * 24 * 365; // ~1 year

/** Secure cookies whenever the request came over https (Caddy sets X-Forwarded-Proto). */
export function isHttps(h: Headers): boolean {
  return h.get("x-forwarded-proto") === "https" || (h.get("origin") ?? "").startsWith("https:");
}

export function sessionOptions(secure = process.env.NODE_ENV === "production"): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error("SESSION_SECRET skal være mindst 32 tegn");
  return {
    password,
    cookieName: COOKIE_NAME,
    ttl: MAX_AGE,
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: MAX_AGE,
      path: "/",
    },
  };
}
