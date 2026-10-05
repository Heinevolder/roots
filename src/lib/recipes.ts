import "server-only";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import matter from "gray-matter";
import { RECIPES_DIR } from "./paths";
import type { Ingredient } from "./ingredients";

export type Recipe = {
  slug: string;
  title: string;
  servings: number;
  time?: number;
  tags: string[];
  source?: string;
  image?: string;
  share?: string; // token for the public /del/<token> link; unset = not shared
  ingredients: Ingredient[];
  body: string; // markdown steps
};

const g = globalThis as unknown as {
  __rootsRecipes?: Map<string, Recipe>;
  __rootsRecipesWatcher?: fs.FSWatcher;
};

function parseFile(file: string): Recipe | null {
  try {
    const { data, content } = matter(fs.readFileSync(path.join(RECIPES_DIR, file), "utf8"));
    const slug = file.replace(/\.md$/, "");
    return {
      slug,
      title: String(data.title ?? slug),
      servings: Number(data.servings) || 4,
      time: data.time != null ? Number(data.time) : undefined,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      source: data.source ? String(data.source) : undefined,
      image: data.image ? String(data.image) : undefined,
      share: data.share ? String(data.share) : undefined,
      ingredients: (Array.isArray(data.ingredients) ? data.ingredients : [])
        .filter((i: unknown) => i && typeof i === "object" && "item" in i)
        .map((i: Ingredient) => ({
          item: String(i.item).trim().toLowerCase(),
          amount: i.amount != null && i.amount !== ("" as unknown) ? Number(i.amount) : null,
          unit: i.unit ? String(i.unit) : i.amount != null ? "stk" : null,
        })),
      body: content.trim(),
    };
  } catch (e) {
    console.error(`Kunne ikke læse opskrift ${file}`, e);
    return null;
  }
}

function loadAll(): Map<string, Recipe> {
  fs.mkdirSync(RECIPES_DIR, { recursive: true });
  const map = new Map<string, Recipe>();
  for (const f of fs.readdirSync(RECIPES_DIR)) {
    if (!f.endsWith(".md")) continue;
    const r = parseFile(f);
    if (r) map.set(r.slug, r);
  }
  return map;
}

function cache(): Map<string, Recipe> {
  if (!g.__rootsRecipes) {
    g.__rootsRecipes = loadAll();
    if (!g.__rootsRecipesWatcher) {
      try {
        // Hand edits on disk refresh the cache.
        g.__rootsRecipesWatcher = fs.watch(RECIPES_DIR, () => {
          g.__rootsRecipes = undefined;
        });
      } catch {}
    }
  }
  return g.__rootsRecipes;
}

export function listRecipes(): Recipe[] {
  return [...cache().values()].sort((a, b) => a.title.localeCompare(b.title, "da"));
}

export function getRecipe(slug: string): Recipe | undefined {
  return cache().get(slug);
}

export function getSharedRecipe(token: string): Recipe | undefined {
  if (!token) return undefined;
  for (const r of cache().values()) if (r.share === token) return r;
  return undefined;
}

/** Turn the public link on (new token) or off. Returns the token, or null when off. */
export function setRecipeShare(slug: string, on: boolean): string | null {
  const r = getRecipe(slug);
  if (!r) throw new Error("Opskriften findes ikke");
  const share = on ? (r.share ?? randomBytes(16).toString("base64url")) : undefined;
  if (share !== r.share) saveRecipe({ ...r, share });
  return share ?? null;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "opskrift"
  );
}

export function uniqueSlug(title: string): string {
  const base = slugify(title);
  let slug = base;
  for (let n = 2; fs.existsSync(path.join(RECIPES_DIR, `${slug}.md`)); n++) slug = `${base}-${n}`;
  return slug;
}

export function saveRecipe(r: Recipe) {
  fs.mkdirSync(RECIPES_DIR, { recursive: true });
  const fm: Record<string, unknown> = { title: r.title, servings: r.servings };
  if (r.time) fm.time = r.time;
  if (r.tags.length) fm.tags = r.tags;
  if (r.source) fm.source = r.source;
  if (r.image) fm.image = r.image;
  if (r.share) fm.share = r.share;
  fm.ingredients = r.ingredients.map((i) => {
    const o: Record<string, unknown> = { item: i.item };
    if (i.amount != null) o.amount = i.amount;
    if (i.unit) o.unit = i.unit;
    return o;
  });
  fs.writeFileSync(path.join(RECIPES_DIR, `${r.slug}.md`), matter.stringify(`\n${r.body.trim()}\n`, fm));
  g.__rootsRecipes = undefined;
}

export function deleteRecipe(slug: string) {
  fs.rmSync(path.join(RECIPES_DIR, `${slug}.md`), { force: true });
  g.__rootsRecipes = undefined;
}
