import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { COOKIE_NAME, sessionOptions, type SessionData } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const data = await unsealData<SessionData>(cookie, { password: sessionOptions().password, ttl: sessionOptions().ttl });
      if (data.loggedIn) return NextResponse.next();
    } catch {}
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|del/|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|offline).*)",
  ],
};
