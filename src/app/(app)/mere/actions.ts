"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getCatalogue, getCatalogueIndex, saveCatalogue } from "@/lib/catalogue";
import { canonical, normalizeName } from "@/lib/catalogue-core";
import { parseIngredientLine } from "@/lib/ingredients";
import { notifyMeta } from "@/lib/events";
import { regenerateList } from "@/lib/list";

// Staples and catalogue ride along on every list pull, so nudge clients to pull.
const changed = () => {
  revalidatePath("/mere");
  notifyMeta();
};

export async function addStaple(form: FormData) {
  const p = parseIngredientLine(String(form.get("staple") ?? ""));
  if (!p) return;
  db.insert(schema.staples)
    .values({ item: canonical(getCatalogueIndex(), p.item), amount: p.amount ?? null, unit: p.unit ?? null })
    .run();
  changed();
}

export async function removeStaple(id: number) {
  db.delete(schema.staples).where(eq(schema.staples.id, id)).run();
  changed();
}

export async function moveCategory(index: number, dir: -1 | 1) {
  const cat = getCatalogue();
  const j = index + dir;
  if (j < 0 || j >= cat.categories.length) return;
  [cat.categories[index], cat.categories[j]] = [cat.categories[j], cat.categories[index]];
  saveCatalogue(cat);
  changed();
}

export async function addCatalogueItem(form: FormData) {
  const name = normalizeName(String(form.get("item") ?? ""));
  const ci = Number(form.get("category"));
  const cat = getCatalogue();
  if (!name || !cat.categories[ci]) return;
  for (const c of cat.categories) c.items = c.items.filter((i) => normalizeName(i.name) !== name);
  cat.categories[ci].items.push({ name, aliases: [] });
  saveCatalogue(cat);
  regenerateList();
  changed();
}

export async function addPantry(form: FormData) {
  const name = canonical(getCatalogueIndex(), String(form.get("pantry") ?? ""));
  const cat = getCatalogue();
  if (!name || cat.pantry.map(normalizeName).includes(name)) return;
  cat.pantry.push(name);
  saveCatalogue(cat);
  regenerateList();
  changed();
}

export async function removePantry(name: string) {
  const cat = getCatalogue();
  cat.pantry = cat.pantry.filter((p) => normalizeName(p) !== normalizeName(name));
  saveCatalogue(cat);
  regenerateList();
  changed();
}

/** Put an item in an aisle (moving it, aliases and all, if the catalogue already has it elsewhere). */
export async function placeItem(name: string, categoryIndex: number) {
  const cat = getCatalogue();
  const target = cat.categories[categoryIndex];
  const n = normalizeName(name);
  if (!n || !target) throw new Error("Ukendt afdeling");
  let item: { name: string; aliases: string[] } | undefined;
  for (const c of cat.categories) {
    const i = c.items.findIndex((x) => normalizeName(x.name) === n || x.aliases.some((a) => normalizeName(a) === n));
    if (i >= 0) {
      item = c.items.splice(i, 1)[0];
      break;
    }
  }
  target.items.push(item ?? { name: n, aliases: [] });
  saveCatalogue(cat);
  regenerateList();
  changed();
}
