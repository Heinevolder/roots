import fs from "node:fs";
import path from "node:path";
import { IMAGES_DIR } from "@/lib/paths";
import { getSharedRecipe } from "@/lib/recipes";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** The shared recipe's own image, and nothing else from the image folder. */
export async function GET(_: Request, ctx: RouteContext<"/del/[token]/billede">) {
  const r = getSharedRecipe((await ctx.params).token);
  if (!r?.image) return new Response("Ikke fundet", { status: 404 });
  const file = path.join(IMAGES_DIR, path.basename(r.image));
  if (!fs.existsSync(file)) return new Response("Ikke fundet", { status: 404 });
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=300" },
  });
}
