"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addRecipeToListAction } from "../actions";
import { formatAmount, type Ingredient } from "@/lib/ingredients";

type Ing = Ingredient & { pantry: boolean };

/** Servings stepper that scales the ingredient list and decides what goes on the shopping list. */
export function RecipeIngredients({ slug, baseServings, ingredients }: { slug: string; baseServings: number; ingredients: Ing[] }) {
  const [servings, setServings] = useState(4);
  const [done, setDone] = useState<{ count: number; servings: number } | null>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const factor = servings / (baseServings || 4);

  return (
    <>
      <div className="mt-4 flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(false);
              try {
                setDone({ count: await addRecipeToListAction(slug, servings), servings });
              } catch {
                setError(true);
              }
            })
          }
        >
          {pending ? "Lægger på listen…" : "Læg på indkøbslisten"}
        </button>
        <div className="flex shrink-0 items-center rounded-xl border border-line bg-surface" aria-label="Portioner">
          <button className="size-10 text-lg text-muted" onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Færre portioner">−</button>
          <span className="w-12 text-center text-sm tabular-nums">{servings} pers</span>
          <button className="size-10 text-lg text-muted" onClick={() => setServings((s) => Math.min(20, s + 1))} aria-label="Flere portioner">+</button>
        </div>
      </div>
      {done && !pending && (
        <p className="mt-2 text-sm text-accent">
          {done.count} varer lagt på listen til {done.servings} personer. <Link href="/liste" className="font-medium underline">Se listen</Link>
        </p>
      )}
      {error && <p className="mt-2 text-sm text-warm">Kunne ikke nå serveren. Prøv igen.</p>}

      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">Ingredienser</h2>
        <span className="text-sm text-muted">
          til {servings} pers{baseServings !== servings && ` · opskriften er til ${baseServings}`}
        </span>
      </div>
      <ul className="card divide-y divide-line">
        {ingredients.map((i, n) => (
          <li key={n} className="flex gap-3 px-4 py-2.5">
            <span className="w-20 shrink-0 text-right text-muted tabular-nums">
              {[formatAmount(i.amount == null ? null : scaled(i.amount, factor, i.unit)), i.unit].filter(Boolean).join(" ")}
            </span>
            <span>
              {i.item}
              {i.pantry && <span className="ml-2 text-xs text-muted">har I altid</span>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** For reading a recipe (not for buying): keep amounts as written, round scaled ones gently. */
function scaled(amount: number, factor: number, unit: string | null | undefined): number {
  if (factor === 1) return amount;
  const x = amount * factor;
  if (unit === "g" || unit === "ml") return x >= 100 ? Math.round(x / 10) * 10 : Math.max(5, Math.round(x / 5) * 5);
  return Math.round(x * 4) / 4;
}
