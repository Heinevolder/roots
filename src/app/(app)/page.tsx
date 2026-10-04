import Link from "next/link";
import { connection } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listRecipes } from "@/lib/recipes";
import { addDays, range, rangeLabel, today, weekStart } from "@/lib/dates";
import { getPlanRange } from "@/lib/plan-range";
import { PageHeader } from "@/components/page-header";
import { PlanDay } from "./plan-day";
import { RangePicker } from "./range-picker";

export default async function PlanPage() {
  await connection();
  const t = today();
  const r = getPlanRange();
  const days = range(r.start, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 864e5) + 1);

  const rows = db
    .select()
    .from(schema.mealPlan)
    .where(and(gte(schema.mealPlan.date, r.start), lte(schema.mealPlan.date, r.end)))
    .all();
  const byDate = new Map(rows.map((x) => [x.date, x]));
  const recipes = listRecipes().map(({ slug, title, tags, time, servings }) => ({ slug, title, tags, time, servings }));
  const allShopped = days.every((d) => d < t || byDate.get(d)?.shoppedAt);

  // Presets: shopping today or tomorrow for three dinners, the rest of this week, or next week.
  const sunday = addDays(weekStart(t), 6);
  const presets = [
    { label: "I dag + 2 dage", start: t, end: addDays(t, 2) },
    { label: "I morgen + 2 dage", start: addDays(t, 1), end: addDays(t, 3) },
    ...(sunday > addDays(t, 1) ? [{ label: "Resten af ugen", start: t, end: sunday }] : []),
    { label: "Næste uge", start: addDays(sunday, 1), end: addDays(sunday, 7) },
  ];

  return (
    <>
      <PageHeader title="Madplan" sub={`${rangeLabel(r.start, r.end)} · ${days.length} ${days.length === 1 ? "dag" : "dage"}`} />
      <RangePicker current={r} presets={presets} today={t} />

      {allShopped && rows.length > 0 && (
        <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Der er handlet ind til alle dagene. Vælg de næste dage ovenfor for at planlægge næste indkøb.
        </div>
      )}

      <ul className="space-y-3">
        {days.map((d) => {
          const row = byDate.get(d);
          return (
            <li key={d}>
              <PlanDay
                date={d}
                isToday={d === t}
                isPast={d < t}
                entry={row ? { recipeSlug: row.recipeSlug, servings: row.servings, note: row.note, shopped: !!row.shoppedAt } : null}
                recipes={recipes}
              />
            </li>
          );
        })}
      </ul>
      <Link href="/liste" className="btn-primary mt-6 w-full">Til indkøbslisten →</Link>
    </>
  );
}
