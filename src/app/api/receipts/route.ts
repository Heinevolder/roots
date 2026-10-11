import { revalidatePath } from "next/cache";
import type { Photo } from "@/lib/ai/extract";
import { friendlyError } from "@/lib/ai/claude";
import { addReceipt } from "@/lib/receipts";

export const maxDuration = 300;

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Receipt photo(s) -> lines on a trip. The client downsizes photos before upload. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("photos") ?? []).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
  if (!files.length) return Response.json({ error: "Vælg et billede af kvitteringen." }, { status: 400 });
  const photos: Photo[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type)) return Response.json({ error: "Billedet skal være JPG, PNG eller WebP." }, { status: 400 });
    if (f.size > 5 * 1024 * 1024) return Response.json({ error: "Billedet er for stort." }, { status: 400 });
    photos.push({ data: Buffer.from(await f.arrayBuffer()), type: f.type as Photo["type"] });
  }
  const tripId = Number(form?.get("tripId")) || null;
  try {
    const id = await addReceipt(photos, tripId);
    revalidatePath("/udgifter", "layout");
    return Response.json({ tripId: id });
  } catch (e) {
    console.error("receipt", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
