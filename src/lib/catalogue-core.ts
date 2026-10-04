// Pure catalogue helpers, shared by server and client.

export type Category = { name: string; items: { name: string; aliases: string[] }[] };
/** pantry: things always at home; in recipes but never on the shopping list. */
export type Catalogue = { categories: Category[]; pantry: string[] };
/** Compact form sent to the client: lowercase name/alias -> [canonical name, category index]. */
export type CatalogueIndex = { categories: string[]; lookup: Record<string, [string, number]>; pantry: string[] };

export const OTHER = "Andet";

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildIndex(cat: Catalogue): CatalogueIndex {
  const lookup: Record<string, [string, number]> = {};
  cat.categories.forEach((c, ci) => {
    for (const it of c.items) {
      const canonical = normalizeName(it.name);
      for (const n of [it.name, ...it.aliases]) lookup[normalizeName(n)] ??= [canonical, ci];
    }
  });
  const pantry = [...new Set(cat.pantry.map((p) => lookup[normalizeName(p)]?.[0] ?? normalizeName(p)))];
  return { categories: cat.categories.map((c) => c.name), lookup, pantry };
}

/** Canonical item name (resolves aliases like "gule løg" -> "løg"). */
export function canonical(idx: CatalogueIndex, name: string): string {
  const n = normalizeName(name);
  return idx.lookup[n]?.[0] ?? n;
}

/** Category index for an item; unknown items get categories.length ("Andet", last). */
export function categoryOf(idx: CatalogueIndex, name: string): number {
  return idx.lookup[normalizeName(name)]?.[1] ?? idx.categories.length;
}

export function categoryName(idx: CatalogueIndex, i: number): string {
  return idx.categories[i] ?? OTHER;
}

/** Always at home (salt, pepper, everyday oil): kept out of the shopping list. */
export function isPantry(idx: CatalogueIndex, name: string): boolean {
  return idx.pantry.includes(canonical(idx, name));
}
