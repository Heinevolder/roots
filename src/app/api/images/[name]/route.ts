import fs from "node:fs";
import path from "node:path";
import { IMAGES_DIR } from "@/lib/paths";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

export async function GET(_: Request, ctx: RouteContext<"/api/images/[name]">) {
  const { name } = await ctx.params;
  const safe = path.basename(name);
  const file = path.join(IMAGES_DIR, safe);
  if (!fs.existsSync(file)) return new Response("Ikke fundet", { status: 404 });
  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
