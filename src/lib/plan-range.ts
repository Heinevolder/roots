import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { addDays, today } from "./dates";

/** The days currently being planned and shopped for, shared by both phones. */
export type PlanRange = { start: string; end: string };

const KEY = "plan_range";
export const MAX_DAYS = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultRange(): PlanRange {
  const t = today();
  return { start: t, end: addDays(t, 2) };
}

export function getPlanRange(): PlanRange {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  try {
    const r = row ? (JSON.parse(row.value) as PlanRange) : null;
    // A range that is over falls back to "today + 2".
    if (r && DATE.test(r.start) && DATE.test(r.end) && r.end >= today()) return r;
  } catch {}
  return defaultRange();
}

export function setPlanRange(start: string, end: string): PlanRange {
  if (!DATE.test(start) || !DATE.test(end)) throw new Error("Ugyldig dato");
  if (end < start) [start, end] = [end, start];
  if (end > addDays(start, MAX_DAYS - 1)) end = addDays(start, MAX_DAYS - 1);
  const value = JSON.stringify({ start, end });
  db.insert(schema.settings).values({ key: KEY, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run();
  return { start, end };
}
