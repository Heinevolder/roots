import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { listRecipes, saveRecipe, slugify, uniqueSlug } from "./recipes";
import { fetchPage, type Page } from "./ai/fetch-page";
import { extractFromPage } from "./ai/extract";
import { searchRecipes, type Scope } from "./ai/search";
import { storeRemoteImage } from "./ai/images";
import { AiError } from "./ai/claude";
import { regenerateList } from "./list";

const { inspiration } = schema;

export type Card = {
  id: number;
  title: string;
  imageUrl: string | null;
  site: string | null;
  time: number | null;
  ingredients: string[];
  url: string;
};

const toCard = (r: schema.Inspiration): Card => ({
  id: r.id,
  title: r.title,
  imageUrl: r.imageUrl,
  site: r.site,
  time: r.time,
  ingredients: r.ingredients ? (JSON.parse(r.ingredients) as string[]) : [],
  url: r.url,
});

export function deck(): Card[] {
  // Newest search first, so a fresh wish shows up on top.
  return db
    .select()
    .from(inspiration)
    .where(eq(inspiration.status, "new"))
    .orderBy(desc(inspiration.createdAt), asc(inspiration.id))
    .all()
    .map(toCard);
}

export function recentSaved(limit = 6) {
  return db
    .select()
    .from(inspiration)
    .where(inArray(inspiration.status, ["saving", "saved", "failed"]))
    .orderBy(desc(inspiration.id))
    .limit(limit)
    .all()
    .map((r) => ({ id: r.id, title: r.title, status: r.status, recipeSlug: r.recipeSlug }));
}

const canon = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`;
  } catch {
    return u;
  }
};

const INGREDIENTS = /ingrediens|ingredient|zutaten|ingrédients|ingredienti|ingredientes/i;
const METHOD = /fremgangsmåde|sådan gør du|tilberedning|instructions|directions|method|gör så här|instruktioner|fremgangsmåte|preparazione|procedimento|préparation|zubereitung|preparación/i;

/** Looks like a single recipe, not a list or article. */
function isRecipePage(p: Page): boolean {
  if (p.recipe?.ingredients.length) return true;
  return INGREDIENTS.test(p.text) && METHOD.test(p.text);
}

const g = globalThis as unknown as { __rootsRefill?: Promise<number> | null };

/** Ask Claude for real recipe pages and turn the ones that load into cards. One search at a time. */
export function refillDeck(wish: string): Promise<number> {
  g.__rootsRefill ??= doRefill(wish).finally(() => {
    g.__rootsRefill = null;
  });
  return g.__rootsRefill;
}

/** Danish, English and other European sites are searched side by side; each lands in the deck as soon as it is checked. */
const SCOPES: { scope: Scope; count: number }[] = [
  { scope: "dk", count: 10 },
  { scope: "en", count: 8 },
  { scope: "eu", count: 6 },
];

async function doRefill(wish: string): Promise<number> {
  const library = listRecipes();
  const known = db.select({ url: inspiration.url }).from(inspiration).all().map((r) => r.url);
  const seen = new Set([...known, ...library.flatMap((r) => (r.source ? [r.source] : []))].map(canon));
  const batchAt = Date.now(); // one timestamp per search, so cards keep their order as they arrive

  const counts = await Promise.allSettled(
    SCOPES.map(async ({ scope, count }) => {
      const candidates = await searchRecipes(wish, { scope, count, avoidTitles: library.map((r) => r.title), avoidUrls: known });
      const fresh = candidates.filter((c) => !seen.has(canon(c.url)));
      const pages = await Promise.allSettled(fresh.map((c) => fetchPage(c.url)));
      let added = 0;
      pages.forEach((p, i) => {
        if (p.status !== "fulfilled" || !isRecipePage(p.value)) return; // dead or made-up link, or not a recipe
        const page = p.value;
        const c = fresh[i];
        if (seen.has(canon(c.url)) || seen.has(canon(page.url))) return;
        seen.add(canon(c.url));
        seen.add(canon(page.url));
        const r = page.recipe;
        db.insert(inspiration)
          .values({
            url: page.url,
            // Foreign pages keep Claude's Danish name; Danish pages use their own.
            title: (scope === "dk" && r?.name) || c.title,
            imageUrl: r?.image ?? page.image ?? null,
            site: new URL(page.url).hostname.replace(/^www\./, ""),
            time: r?.time ?? null,
            ingredients: r?.ingredients.length ? JSON.stringify(r.ingredients.slice(0, 30)) : null,
            query: wish || null,
            createdAt: batchAt,
          })
          .onConflictDoNothing()
          .run();
        added++;
      });
      return added;
    }),
  );
  const added = counts.reduce((n, c) => n + (c.status === "fulfilled" ? c.value : 0), 0);
  if (!added) {
    const failed = counts.find((c) => c.status === "rejected");
    if (failed?.status === "rejected" && counts.every((c) => c.status === "rejected")) throw failed.reason;
    throw new AiError("Fandt ingen nye opskrifter, der kunne åbnes. Prøv igen eller med et andet ønske.");
  }
  return added;
}

export function skip(id: number) {
  db.update(inspiration).set({ status: "skipped" }).where(eq(inspiration.id, id)).run();
}

/** Swipe right: read the real page with Claude and add it to the library. */
export async function save(id: number): Promise<string> {
  const row = db.select().from(inspiration).where(eq(inspiration.id, id)).get();
  if (!row) throw new AiError("Kortet findes ikke.");
  if (row.status === "saved" && row.recipeSlug) return row.recipeSlug;
  db.update(inspiration).set({ status: "saving" }).where(eq(inspiration.id, id)).run();
  try {
    const page = await fetchPage(row.url);
    const draft = await extractFromPage(page);
    const slug = uniqueSlug(draft.title);
    const image = await storeRemoteImage(draft.imageUrl ?? row.imageUrl ?? undefined, slugify(draft.title));
    saveRecipe({ slug, title: draft.title, servings: draft.servings, time: draft.time, tags: draft.tags, source: draft.source, image, ingredients: draft.ingredients, body: draft.body });
    db.update(inspiration).set({ status: "saved", recipeSlug: slug }).where(eq(inspiration.id, id)).run();
    regenerateList();
    return slug;
  } catch (e) {
    db.update(inspiration).set({ status: "failed" }).where(eq(inspiration.id, id)).run();
    throw e;
  }
}

/** Put a failed card back in the deck. */
export function retry(id: number) {
  db.update(inspiration).set({ status: "new" }).where(eq(inspiration.id, id)).run();
}
