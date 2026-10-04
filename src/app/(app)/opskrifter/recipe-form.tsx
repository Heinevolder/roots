"use client";

import { useActionState } from "react";
import { saveRecipeAction } from "./actions";
import { formatIngredient, type Ingredient } from "@/lib/ingredients";

type Initial = {
  slug?: string;
  title?: string;
  servings?: number;
  time?: number;
  tags?: string[];
  source?: string;
  image?: string;
  ingredients?: Ingredient[];
  body?: string;
};

export function RecipeForm({ initial = {} }: { initial?: Initial }) {
  const [state, action, pending] = useActionState(saveRecipeAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {initial.slug && <input type="hidden" name="slug" value={initial.slug} />}
      {!initial.slug && initial.image && <input type="hidden" name="draftImage" value={initial.image} />}
      <div>
        <label className="label" htmlFor="title">Titel</label>
        <input id="title" name="title" required defaultValue={initial.title} className="field" placeholder="Kylling i karry med ris" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="servings">Portioner</label>
          <input id="servings" name="servings" type="number" min={1} inputMode="numeric" defaultValue={initial.servings ?? 4} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="time">Tid (min)</label>
          <input id="time" name="time" type="number" min={0} inputMode="numeric" defaultValue={initial.time} className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ingredients">Ingredienser</label>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={8}
          required
          className="field font-mono text-sm leading-relaxed"
          placeholder={"600 g kyllingebryst\n1 stk løg\n400 ml kokosmælk\nsalt"}
          defaultValue={initial.ingredients?.map(formatIngredient).join("\n")}
        />
        <p className="mt-1 text-xs text-muted">Én per linje: mængde, enhed (g, kg, dl, l, stk, spsk, tsk…) og vare.</p>
      </div>
      <div>
        <label className="label" htmlFor="steps">Fremgangsmåde</label>
        <textarea
          id="steps"
          name="steps"
          rows={8}
          className="field text-sm leading-relaxed"
          placeholder={"1. Skær kyllingen i mundrette stykker…\n2. Svits løg, ingefær og karry…"}
          defaultValue={initial.body}
        />
      </div>
      <div>
        <label className="label" htmlFor="tags">Tags</label>
        <input id="tags" name="tags" defaultValue={initial.tags?.join(", ")} className="field" placeholder="hverdag, kylling" />
      </div>
      <div>
        <label className="label" htmlFor="source">Kilde</label>
        <input id="source" name="source" type="url" defaultValue={initial.source} className="field" placeholder="https://…" />
      </div>
      <div>
        <label className="label" htmlFor="image">Billede</label>
        {initial.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/images/${initial.image}`} alt="" className="mb-2 aspect-[4/3] w-full rounded-xl object-cover" />
        )}
        <input id="image" name="image" type="file" accept="image/*" className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent" />
        {initial.image && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="removeImage" /> Fjern nuværende billede
          </label>
        )}
      </div>
      {state?.error && <p className="text-sm text-warm">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Gemmer…" : "Gem opskrift"}
      </button>
    </form>
  );
}
