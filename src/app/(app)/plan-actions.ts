"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getRecipe } from "@/lib/recipes";
import { regenerateList } from "@/lib/list";
import { setPlanRange } from "@/lib/plan-range";
import { notifyMeta } from "@/lib/events";

export async function setPlanDay(date: string, data: { recipeSlug: string | null; servings: number; note: string | null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ugyldig dato");
  const recipeSlug = data.recipeSlug && getRecipe(data.recipeSlug) ? data.recipeSlug : null;
  const note = data.note?.trim() || null;
  const servings = Math.min(20, Math.max(1, Math.round(data.servings) || 4));
  if (!recipeSlug && !note) {
    db.delete(schema.mealPlan).where(eq(schema.mealPlan.date, date)).run();
  } else {
    // A changed day needs shopping again.
    const values = { date, recipeSlug, servings, note, shoppedAt: null };
    db.insert(schema.mealPlan).values(values).onConflictDoUpdate({ target: schema.mealPlan.date, set: values }).run();
  }
  regenerateList();
  revalidatePath("/");
}

export async function setRange(start: string, end: string) {
  setPlanRange(start, end);
  regenerateList();
  notifyMeta(); // list header shows the range
  revalidatePath("/");
}
