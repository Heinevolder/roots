import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getRecipe } from "./recipes";
import { getCatalogueIndex } from "./catalogue";
import { canonical, isPantry } from "./catalogue-core";
import { niceAmount } from "./ingredients";
import { notifyList } from "./events";
import { queueAdded } from "./push";
import { today } from "./dates";
import { getPlanRange } from "./plan-range";
import type { ListItem } from "./db/schema";

const { listItems, mealPlan, staples, purchaseLog, cookedLog } = schema;

/** Row shape on the wire (and in the client's IndexedDB). */
export type WireItem = Omit<ListItem, "rev"> & { rev?: number };

function nextRev(): number {
  const r = db.select({ m: sql<number>`coalesce(max(${listItems.rev}), 0)` }).from(listItems).get();
  return (r?.m ?? 0) + 1;
}

export function currentRev(): number {
  return nextRev() - 1;
}

const key = (item: string, unit: string | null) => `${item}|${unit ?? ""}`;

/** Planned days in the chosen range that still need shopping (never days in the past). */
function daysToShop() {
  const { start, end } = getPlanRange();
  const from = start > today() ? start : today();
  return db
    .select()
    .from(mealPlan)
    .where(and(gte(mealPlan.date, from), lte(mealPlan.date, end), isNull(mealPlan.shoppedAt)))
    .all();
}

/**
 * Rebuild recipe lines from the planned, not-yet-shopped days in the plan range.
 * Staple/manual lines are never touched; ticks and "har vi" on recipe lines survive.
 */
export function regenerateList() {
  const idx = getCatalogueIndex();
  const days = daysToShop();

  const want = new Map<string, { item: string; unit: string | null; amount: number | null; slugs: Set<string> }>();
  for (const day of days) {
    if (!day.recipeSlug) continue;
    const r = getRecipe(day.recipeSlug);
    if (!r) continue;
    const factor = day.servings / (r.servings || 4);
    for (const ing of r.ingredients) {
      const item = canonical(idx, ing.item);
      if (isPantry(idx, item)) continue;
      const unit = ing.unit ?? null;
      const k = key(item, unit);
      const line = want.get(k) ?? { item, unit, amount: null, slugs: new Set<string>() };
      if (ing.amount != null) line.amount = (line.amount ?? 0) + ing.amount * factor;
      line.slugs.add(r.slug);
      want.set(k, line);
    }
  }

  const now = Date.now();
  let changed = false;
  db.transaction((tx) => {
    const rev = nextRev();
    const existing = tx
      .select()
      .from(listItems)
      .where(and(eq(listItems.source, "recipe"), eq(listItems.deleted, false)))
      .all();
    const seen = new Set<string>();
    for (const row of existing) {
      const k = key(row.item, row.unit);
      const w = want.get(k);
      if (!w || seen.has(k)) {
        tx.update(listItems).set({ deleted: true, updatedAt: now, rev }).where(eq(listItems.id, row.id)).run();
        changed = true;
        continue;
      }
      seen.add(k);
      const amount = w.amount == null ? null : niceAmount(w.amount, w.unit);
      const slugs = [...w.slugs].sort().join(",");
      if (amount !== row.amount || slugs !== row.recipeSlugs) {
        tx.update(listItems).set({ amount, recipeSlugs: slugs, updatedAt: now, rev }).where(eq(listItems.id, row.id)).run();
        changed = true;
      }
    }
    for (const [k, w] of want) {
      if (seen.has(k)) continue;
      tx.insert(listItems)
        .values({
          id: randomUUID(),
          item: w.item,
          unit: w.unit,
          amount: w.amount == null ? null : niceAmount(w.amount, w.unit),
          source: "recipe",
          recipeSlugs: [...w.slugs].sort().join(","),
          updatedAt: now,
          rev,
        })
        .run();
      changed = true;
    }
  });
  if (changed) notifyList(currentRev());
}

export function pullSince(since: number): { rows: ListItem[]; rev: number } {
  const rows = db.select().from(listItems).where(gt(listItems.rev, since)).all();
  return { rows, rev: currentRev() };
}

/** Last-write-wins upsert of client rows. `device` added them, for notifying the others. */
export function applyClientRows(rows: WireItem[], device: string | null = null): number {
  let applied = 0;
  const added: string[] = [];
  db.transaction((tx) => {
    const rev = nextRev();
    for (const r of rows) {
      if (!r?.id || typeof r.item !== "string") continue;
      const cur = tx.select().from(listItems).where(eq(listItems.id, r.id)).get();
      if (cur && cur.updatedAt > r.updatedAt) continue;
      const values = {
        id: r.id,
        item: r.item.trim().toLowerCase(),
        amount: r.amount ?? null,
        unit: r.unit ?? null,
        source: cur?.source ?? (r.source === "staple" ? "staple" : "manual"),
        recipeSlugs: cur ? cur.recipeSlugs : (r.recipeSlugs ?? null),
        checked: !!r.checked,
        checkedAt: r.checked ? (r.checkedAt ?? r.updatedAt) : null,
        dismissed: !!r.dismissed,
        deleted: !!r.deleted,
        updatedAt: Math.min(r.updatedAt, Date.now() + 60_000),
        rev,
      } as const;
      tx.insert(listItems).values(values).onConflictDoUpdate({ target: listItems.id, set: values }).run();
      applied++;
      // New line, a removed one back, or more of something already on the list.
      const live = !values.deleted && !values.checked && !values.dismissed;
      const wasLive = cur && !cur.deleted && !cur.checked && !cur.dismissed;
      if (live && (!wasLive || (values.amount ?? 0) > (cur.amount ?? 0))) added.push(r.id);
    }
  });
  if (applied) notifyList(currentRev());
  queueAdded(device, added);
  return applied;
}

/** "Færdig med at handle": log and clear ticked items, keep the rest. */
export function finishShopping() {
  const now = Date.now();
  const date = today();
  db.transaction((tx) => {
    const rev = nextRev();
    const live = tx.select().from(listItems).where(eq(listItems.deleted, false)).all();
    for (const row of live) {
      if (row.checked) {
        tx.insert(purchaseLog).values({ item: row.item, date }).run();
        tx.update(listItems).set({ deleted: true, updatedAt: now, rev }).where(eq(listItems.id, row.id)).run();
      } else if (row.dismissed) {
        tx.update(listItems).set({ deleted: true, updatedAt: now, rev }).where(eq(listItems.id, row.id)).run();
      } else if (row.source === "recipe") {
        // Not bought: keep it, but detach it from the plan so regeneration leaves it alone.
        tx.update(listItems).set({ source: "manual", updatedAt: now, rev }).where(eq(listItems.id, row.id)).run();
      }
    }
    for (const d of daysToShop()) {
      tx.update(mealPlan).set({ shoppedAt: now }).where(eq(mealPlan.date, d.date)).run();
      if (d.recipeSlug) tx.insert(cookedLog).values({ recipeSlug: d.recipeSlug, date: d.date }).run();
    }
  });
  notifyList(currentRev());
}

export function listStaples() {
  return db.select().from(staples).orderBy(staples.item).all();
}

/**
 * "Læg på indkøbslisten" from a recipe page: add its ingredients as manual lines (outside the plan),
 * scaled to `servings`, merged into matching unticked manual lines. Pantry items are skipped.
 */
export function addRecipeToList(slug: string, servings: number, device: string | null = null): number {
  const r = getRecipe(slug);
  if (!r) throw new Error("Opskriften findes ikke");
  const idx = getCatalogueIndex();
  const factor = servings / (r.servings || 4);
  const now = Date.now();
  const ids: string[] = [];
  db.transaction((tx) => {
    const rev = nextRev();
    const open = tx
      .select()
      .from(listItems)
      .where(and(eq(listItems.deleted, false), eq(listItems.checked, false), eq(listItems.dismissed, false)))
      .all()
      .filter((x) => x.source !== "recipe");
    for (const ing of r.ingredients) {
      const item = canonical(idx, ing.item);
      if (isPantry(idx, item)) continue;
      const unit = ing.unit ?? null;
      const amount = ing.amount == null ? null : niceAmount(ing.amount * factor, unit);
      const same = open.find((x) => x.item === item && (x.unit ?? null) === unit);
      if (same) {
        const slugs = [...new Set([...(same.recipeSlugs?.split(",").filter(Boolean) ?? []), slug])].sort().join(",");
        const sum = same.amount != null && amount != null ? niceAmount(same.amount + amount, unit) : (same.amount ?? amount);
        tx.update(listItems).set({ amount: sum, recipeSlugs: slugs, updatedAt: now, rev }).where(eq(listItems.id, same.id)).run();
        ids.push(same.id);
      } else {
        const row = { id: randomUUID(), item, unit, amount, source: "manual" as const, recipeSlugs: slug, updatedAt: now, rev };
        tx.insert(listItems).values(row).run();
        open.push({ ...row, checked: false, checkedAt: null, dismissed: false, deleted: false });
        ids.push(row.id);
      }
    }
  });
  if (ids.length) notifyList(currentRev());
  queueAdded(device, ids);
  return ids.length;
}
