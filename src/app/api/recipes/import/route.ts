import { fetchPage } from "@/lib/ai/fetch-page";
import { extractFromPage } from "@/lib/ai/extract";
import { storeRemoteImage } from "@/lib/ai/images";
import { friendlyError } from "@/lib/ai/claude";
import { slugify } from "@/lib/recipes";

export const maxDuration = 300;

/** Link -> draft recipe for review. Nothing is saved to the library here. */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return Response.json({ error: "Indsæt et link." }, { status: 400 });
  try {
    const page = await fetchPage(url.trim());
    const draft = await extractFromPage(page);
    const image = await storeRemoteImage(draft.imageUrl, slugify(draft.title));
    return Response.json({ draft: { ...draft, image } });
  } catch (e) {
    console.error("import url", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
