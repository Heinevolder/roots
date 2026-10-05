import { fetchPage } from "@/lib/ai/fetch-page";
import { extractFromPage, extractViaWebFetch, NoRecipeError, type Draft } from "@/lib/ai/extract";
import { storeRemoteImage } from "@/lib/ai/images";
import { AiError, friendlyError } from "@/lib/ai/claude";
import { slugify } from "@/lib/recipes";

export const maxDuration = 300;

/** Link -> draft recipe for review. Nothing is saved to the library here. */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return Response.json({ error: "Indsæt et link." }, { status: 400 });
  try {
    const draft = await readRecipe(url.trim());
    const image = await storeRemoteImage(draft.imageUrl, slugify(draft.title));
    return Response.json({ draft: { ...draft, image } });
  } catch (e) {
    console.error("import url", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}

/** Our own reader first (cheap, uses JSON-LD); Claude's web_fetch when it comes up empty or the site blocks us. */
async function readRecipe(url: string): Promise<Draft> {
  let image: string | undefined;
  try {
    const page = await fetchPage(url);
    image = page.recipe?.image ?? page.image;
    return await extractFromPage(page);
  } catch (e) {
    const blocked = e instanceof Error && !(e instanceof AiError) && /^Siden svarede (401|403|429|5\d\d)/.test(e.message);
    if (!(e instanceof NoRecipeError) && !blocked) throw e;
    console.warn("import url: falling back to web_fetch", url, e instanceof Error ? e.message : e);
    return extractViaWebFetch(url, image);
  }
}
