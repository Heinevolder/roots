import { extractFromPhotos, type Photo } from "@/lib/ai/extract";
import { storeImage } from "@/lib/ai/images";
import { friendlyError } from "@/lib/ai/claude";
import { slugify } from "@/lib/recipes";

export const maxDuration = 300;

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Cookbook photo(s) -> draft recipe for review. The client downsizes photos before upload. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("photos") ?? []).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
  if (!files.length) return Response.json({ error: "Vælg et billede." }, { status: 400 });
  const photos: Photo[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type)) return Response.json({ error: "Billedet skal være JPG, PNG eller WebP." }, { status: 400 });
    if (f.size > 5 * 1024 * 1024) return Response.json({ error: "Billedet er for stort." }, { status: 400 });
    photos.push({ data: Buffer.from(await f.arrayBuffer()), type: f.type as Photo["type"] });
  }
  try {
    const draft = await extractFromPhotos(photos);
    const image = form?.get("keepPhoto") === "1" ? storeImage(photos[0].data, photos[0].type, slugify(draft.title)) : undefined;
    return Response.json({ draft: { ...draft, image } });
  } catch (e) {
    console.error("import photo", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
