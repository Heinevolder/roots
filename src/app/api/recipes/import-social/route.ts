import { readPostPreview, extractFromPost, type Post } from "@/lib/ai/social";
import type { Photo } from "@/lib/ai/extract";
import { storeImage, storeRemoteImage } from "@/lib/ai/images";
import { friendlyError } from "@/lib/ai/claude";
import { slugify } from "@/lib/recipes";

export const maxDuration = 300;

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Instagram reel / social post (link, caption, screenshots) -> draft recipe for review. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  const url = String(form.get("url") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim().slice(0, 10_000);
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
  if (!url && !caption && !files.length) return Response.json({ error: "Indsæt et link, en billedtekst eller skærmbilleder." }, { status: 400 });

  const photos: Photo[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type) || f.size > 5 * 1024 * 1024) return Response.json({ error: "Skærmbilleder skal være JPG, PNG eller WebP." }, { status: 400 });
    photos.push({ data: Buffer.from(await f.arrayBuffer()), type: f.type as Photo["type"] });
  }

  try {
    const post: Post = url ? await readPostPreview(url) : {};
    if (caption) post.caption = caption; // what the user pasted beats the preview
    const draft = await extractFromPost(post, photos);
    const name = slugify(draft.title);
    // Prefer a proper dish photo: the recipe page's / post preview's; else the first screenshot if asked.
    const image =
      (await storeRemoteImage(draft.imageUrl, name)) ??
      (form.get("keepPhoto") === "1" && photos[0] ? storeImage(photos[0].data, photos[0].type, name) : undefined);
    return Response.json({ draft: { ...draft, source: draft.source ?? (url || undefined), image } });
  } catch (e) {
    console.error("import social", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
