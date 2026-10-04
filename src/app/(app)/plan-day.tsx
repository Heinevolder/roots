"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { setPlanDay } from "./plan-actions";
import { dayLabel } from "@/lib/dates";
import { RecipePicker, type PickRecipe } from "./recipe-picker";

type Entry = { recipeSlug: string | null; servings: number; note: string | null; shopped: boolean } | null;

export function PlanDay({
  date,
  isToday,
  isPast,
  entry,
  recipes,
}: {
  date: string;
  isToday: boolean;
  isPast: boolean;
  entry: Entry;
  recipes: PickRecipe[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(entry);
  const [, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const { weekday, short } = dayLabel(date);
  const recipe = optimistic?.recipeSlug ? recipes.find((r) => r.slug === optimistic.recipeSlug) : undefined;
  const servings = optimistic?.servings ?? 4;

  function save(next: { recipeSlug: string | null; servings: number; note: string | null }) {
    start(async () => {
      setOptimistic({ ...next, shopped: false });
      await setPlanDay(date, next);
    });
  }

  return (
    <div className={`card p-4 ${isPast ? "opacity-60" : ""}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-semibold">
          {weekday} <span className="font-normal text-muted">{short}</span>
        </p>
        {isToday && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">I dag</span>}
        {!isToday && optimistic?.shopped && <span className="text-xs text-muted">Handlet ✓</span>}
      </div>

      {recipe ? (
        <div className="flex items-center gap-3">
          <Link href={`/opskrifter/${recipe.slug}`} className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-medium">{recipe.title}</p>
            {recipe.time && <p className="text-sm text-muted">{recipe.time} min</p>}
          </Link>
          <Stepper value={servings} onChange={(v) => save({ recipeSlug: recipe.slug, servings: v, note: optimistic?.note ?? null })} />
        </div>
      ) : optimistic?.note ? (
        <p className="font-display text-lg font-medium">{optimistic.note}</p>
      ) : (
        <p className="text-muted">Ikke planlagt</p>
      )}

      {editingNote ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "");
            save({ recipeSlug: optimistic?.recipeSlug ?? null, servings, note });
            setEditingNote(false);
          }}
        >
          <input name="note" defaultValue={optimistic?.note ?? ""} placeholder="Fx rester, ude, pizza" className="field py-2" autoFocus />
          <button className="btn-primary px-3 py-2">OK</button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button onClick={() => setPicking(true)} className="rounded-lg bg-accent-soft px-3 py-1.5 font-medium text-accent">
            {recipe ? "Skift ret" : "Vælg ret"}
          </button>
          {!recipe && !optimistic?.note && (
            <button onClick={() => save({ recipeSlug: null, servings: 4, note: "Rester" })} className="rounded-lg border border-line px-3 py-1.5 text-muted">
              Rester
            </button>
          )}
          <button onClick={() => setEditingNote(true)} className="rounded-lg border border-line px-3 py-1.5 text-muted">
            {optimistic?.note ? "Ret note" : "Note"}
          </button>
          {(recipe || optimistic?.note) && (
            <button onClick={() => save({ recipeSlug: null, servings: 4, note: null })} className="ml-auto px-2 py-1.5 text-muted">
              Ryd
            </button>
          )}
        </div>
      )}
      {recipe && optimistic?.note && <p className="mt-2 text-sm text-muted">{optimistic.note}</p>}

      {picking && (
        <RecipePicker
          recipes={recipes}
          onClose={() => setPicking(false)}
          onPick={(slug) => {
            setPicking(false);
            save({ recipeSlug: slug, servings, note: optimistic?.note === "Rester" ? null : (optimistic?.note ?? null) });
          }}
        />
      )}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex shrink-0 items-center rounded-xl border border-line" aria-label="Portioner">
      <button className="size-9 text-lg text-muted" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Færre portioner">−</button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <button className="size-9 text-lg text-muted" onClick={() => onChange(Math.min(20, value + 1))} aria-label="Flere portioner">+</button>
    </div>
  );
}
