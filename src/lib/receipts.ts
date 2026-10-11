import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getCatalogue, getCatalogueIndex } from "./catalogue";
import { canonical, normalizeName, OTHER } from "./catalogue-core";
import { readReceipt } from "./ai/receipt";
import type { Photo } from "./ai/extract";
import { addDays, today } from "./dates";

const { trips, receiptLines, receiptAliases, purchaseLog } = schema;

/** Non-food departments. "Husholdning" is also an aisle in the catalogue; the others only exist on receipts. */
export const NON_FOOD = ["Husholdning", "Personlig pleje", "Baby", "Kæledyr", "Bolig & fritid"];

/** Departments a receipt line can land in: the store's aisles, the non-food ones, then "Andet". */
export function receiptCategories(): string[] {
  return [...new Set([...getCatalogue().categories.map((c) => c.name), ...NON_FOOD, OTHER])];
}

const aliasKey = (text: string) => normalizeName(text).replace(/[^\p{L}\p{N} ]/gu, "");

function boughtOn(tripId: number): string[] {
  return db.select({ item: purchaseLog.item }).from(purchaseLog).where(eq(purchaseLog.tripId, tripId)).all().map((r) => r.item);
}

/**
 * The trip a receipt belongs to: the one asked for, else the latest trip from the last 3 days
 * that has no receipt yet. Returns null when a new trip should be made.
 */
function pickTrip(tripId: number | null) {
  if (tripId != null) return db.select().from(trips).where(eq(trips.id, tripId)).get() ?? null;
  return (
    db
      .select()
      .from(trips)
      .where(and(isNull(trips.total), gte(trips.date, addDays(today(), -3))))
      .orderBy(desc(trips.id))
      .get() ?? null
  );
}

/** Purchases from the last 3 days that belong to no trip (e.g. shopping finished before trips existed). */
function loosePurchases() {
  return db
    .select()
    .from(purchaseLog)
    .where(and(isNull(purchaseLog.tripId), gte(purchaseLog.date, addDays(today(), -3))))
    .all();
}

/** Read a receipt photo and store its lines on a trip (replacing any earlier receipt). Returns the trip id. */
export async function addReceipt(photos: Photo[], tripId: number | null): Promise<number> {
  const trip = pickTrip(tripId);
  // No trip to join: a new one adopts recent purchases that have no trip, so they still count as "fra listen".
  const loose = trip ? [] : loosePurchases();
  const bought = trip ? boughtOn(trip.id) : loose.map((p) => p.item);
  const categories = receiptCategories();
  const catalogue = getCatalogue().categories.flatMap((c) => c.items.map((i) => i.name));
  const read = await readReceipt(photos, bought, categories, catalogue);

  const idx = getCatalogueIndex();
  const onList = new Set(bought);
  const aliases = new Map(db.select().from(receiptAliases).all().map((a) => [a.text, a]));
  const lines = read.lines.map((l) => {
    const known = aliases.get(aliasKey(l.text));
    const item = known?.item ?? canonical(idx, l.item);
    const category = known?.category ?? (categories.includes(l.category) ? l.category : OTHER);
    return { text: l.text.trim(), price: Math.round(l.price * 100) / 100, item, category, onList: onList.has(item), sure: !!known || l.sure };
  });
  const sum = lines.reduce((s, l) => s + l.price, 0);
  const total = read.total ?? sum;
  // Keep the month's total honest when a line was missed or misread.
  if (Math.abs(total - sum) >= 1) {
    lines.push({ text: "Forskel til kvitteringens total", price: Math.round((total - sum) * 100) / 100, item: "forskel", category: OTHER, onList: false, sure: false });
  }

  return db.transaction((tx) => {
    const id =
      trip?.id ??
      tx
        .insert(trips)
        .values({ date: read.date ?? loose[0]?.date ?? today(), createdAt: Date.now() })
        .returning({ id: trips.id })
        .get().id;
    if (loose.length) tx.update(purchaseLog).set({ tripId: id }).where(inArray(purchaseLog.id, loose.map((p) => p.id))).run();
    tx.update(trips).set({ total, store: read.store }).where(eq(trips.id, id)).run();
    tx.delete(receiptLines).where(eq(receiptLines.tripId, id)).run();
    for (const l of lines) tx.insert(receiptLines).values({ ...l, tripId: id }).run();
    return id;
  });
}

/** Correct a line's item/department; remembered for the same receipt text next time. */
export function updateLine(id: number, item: string, category: string) {
  const line = db.select().from(receiptLines).where(eq(receiptLines.id, id)).get();
  if (!line) return;
  const name = canonical(getCatalogueIndex(), item) || line.item;
  const cat = receiptCategories().includes(category) ? category : OTHER;
  const onList = boughtOn(line.tripId).includes(name);
  db.update(receiptLines).set({ item: name, category: cat, onList, sure: true }).where(eq(receiptLines.id, id)).run();
  if (line.item !== "forskel") {
    const values = { text: aliasKey(line.text), item: name, category: cat };
    db.insert(receiptAliases).values(values).onConflictDoUpdate({ target: receiptAliases.text, set: values }).run();
  }
}

/** Mark every line on a trip as checked, as-is. */
export function confirmTrip(tripId: number) {
  db.update(receiptLines).set({ sure: true }).where(eq(receiptLines.tripId, tripId)).run();
}

/** Remove a trip's receipt. A trip that only existed for the receipt goes too. */
export function deleteReceipt(tripId: number) {
  db.transaction((tx) => {
    tx.delete(receiptLines).where(eq(receiptLines.tripId, tripId)).run();
    const hasPurchases = tx.select({ id: purchaseLog.id }).from(purchaseLog).where(eq(purchaseLog.tripId, tripId)).get();
    if (hasPurchases) tx.update(trips).set({ total: null, store: null }).where(eq(trips.id, tripId)).run();
    else tx.delete(trips).where(eq(trips.id, tripId)).run();
  });
}

export function getTrip(id: number) {
  const trip = db.select().from(trips).where(eq(trips.id, id)).get();
  if (!trip) return null;
  const lines = db.select().from(receiptLines).where(eq(receiptLines.tripId, id)).orderBy(receiptLines.id).all();
  const onList = new Set(lines.filter((l) => l.onList).map((l) => l.item));
  const notFound = [...new Set(boughtOn(id))].filter((i) => !onList.has(i));
  return { trip, lines, notFound };
}

export type Month = {
  month: string; // YYYY-MM
  total: number;
  fromList: number;
  extra: number;
  food: number;
  nonFood: number;
  trips: number;
  missing: number; // trips without a receipt
  categories: { name: string; amount: number }[];
};

/** Spending per month, newest first. */
export function monthlySpend(months = 12): Month[] {
  const from = `${addDays(today(), -31 * months).slice(0, 7)}-01`;
  const ts = db.select().from(trips).where(gte(trips.date, from)).all();
  const ids = ts.filter((t) => t.total != null).map((t) => t.id);
  const lines = ids.length ? db.select().from(receiptLines).where(inArray(receiptLines.tripId, ids)).all() : [];
  const monthOf = new Map(ts.map((t) => [t.id, t.date.slice(0, 7)]));

  const byMonth = new Map<string, Month & { cats: Map<string, number> }>();
  const get = (m: string) => {
    let v = byMonth.get(m);
    if (!v) byMonth.set(m, (v = { month: m, total: 0, fromList: 0, extra: 0, food: 0, nonFood: 0, trips: 0, missing: 0, categories: [], cats: new Map() }));
    return v;
  };
  for (const t of ts) {
    const m = get(t.date.slice(0, 7));
    m.trips++;
    if (t.total == null) m.missing++;
    else m.total += t.total;
  }
  for (const l of lines) {
    const m = get(monthOf.get(l.tripId)!);
    if (l.onList) m.fromList += l.price;
    else m.extra += l.price;
    // "Andet" (whole-receipt discounts, the difference line) counts as neither.
    if (NON_FOOD.includes(l.category)) m.nonFood += l.price;
    else if (l.category !== OTHER) m.food += l.price;
    m.cats.set(l.category, (m.cats.get(l.category) ?? 0) + l.price);
  }
  return [...byMonth.values()]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map(({ cats, ...m }) => ({
      ...m,
      categories: [...cats].map(([name, amount]) => ({ name, amount })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount),
    }));
}

/** Latest trips, with how many receipt lines still need a look. */
export function recentTrips(limit = 20) {
  const unsure = new Map(
    db
      .select({ tripId: receiptLines.tripId, n: sql<number>`count(*)` })
      .from(receiptLines)
      .where(eq(receiptLines.sure, false))
      .groupBy(receiptLines.tripId)
      .all()
      .map((r) => [r.tripId, r.n]),
  );
  return db
    .select()
    .from(trips)
    .orderBy(desc(trips.date), desc(trips.id))
    .limit(limit)
    .all()
    .map((t) => ({ ...t, unsure: unsure.get(t.id) ?? 0 }));
}

/** Rough price per item: median of the last 5 times it was on a receipt. */
export function itemPrices(): Record<string, number> {
  const rows = db
    .select({ item: receiptLines.item, price: receiptLines.price })
    .from(receiptLines)
    .innerJoin(trips, eq(trips.id, receiptLines.tripId))
    .orderBy(desc(trips.date))
    .all();
  const seen = new Map<string, number[]>();
  for (const r of rows) {
    if (r.price <= 0 || r.item === "forskel") continue;
    const ps = seen.get(r.item) ?? [];
    if (ps.length < 5) ps.push(r.price);
    seen.set(r.item, ps);
  }
  return Object.fromEntries(
    [...seen].map(([item, ps]) => {
      const s = [...ps].sort((a, b) => a - b);
      return [item, s[Math.floor(s.length / 2)]];
    }),
  );
}
