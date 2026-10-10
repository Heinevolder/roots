"use server";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteRecipe, getRecipe, saveRecipe, uniqueSlug, type Recipe } from "@/lib/recipes";
import { parseIngredientLine } from "@/lib/ingredients";
import { addRecipeToList, regenerateList } from "@/lib/list";
import { IMAGES_DIR } from "@/lib/paths";
import { currentDevice } from "@/lib/push";
import { existingImage } from "@/lib/ai/images";

export type FormState = { error?: string } | undefined;

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

async function saveImage(file: File, slug: string): Promise<string | undefined> {
  if (!file || file.size === 0) return undefined;
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Billedet skal være JPG, PNG, WebP eller HEIC.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Billedet er for stort (maks 15 MB).");
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const name = `${slug}-${randomUUID().slice(0, 8)}.${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export async function saveRecipeAction(_: FormState, form: FormData): Promise<FormState> {
  const existingSlug = String(form.get("slug") ?? "");
  const existing = existingSlug ? getRecipe(existingSlug) : undefined;
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Opskriften skal have en titel." };

  const ingredients = String(form.get("ingredients") ?? "")
    .split("\n")
    .map(parseIngredientLine)
    .filter((i) => i !== null);
  if (!ingredients.length) return { error: "Tilføj mindst én ingrediens." };

  const slug = existing?.slug ?? uniqueSlug(title);
  // A draft from link/photo import arrives with its image already stored.
  let image = existing?.image ?? existingImage(form.get("draftImage"));
  try {
    image = (await saveImage(form.get("image") as File, slug)) ?? image;
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (form.get("removeImage") === "on") image = undefined;

  const recipe: Recipe = {
    slug,
    title,
    servings: Math.max(1, Number(form.get("servings")) || 4),
    time: Number(form.get("time")) || undefined,
    tags: String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    source: String(form.get("source") ?? "").trim() || undefined,
    image,
    ingredients,
    body: String(form.get("steps") ?? ""),
  };
  saveRecipe(recipe);
  regenerateList();
  revalidatePath("/", "layout");
  redirect(`/opskrifter/${slug}`);
}

export async function deleteRecipeAction(slug: string) {
  deleteRecipe(slug);
  regenerateList();
  revalidatePath("/", "layout");
  redirect("/opskrifter");
}

export async function addRecipeToListAction(slug: string, servings: number): Promise<number> {
  return addRecipeToList(slug, Math.min(20, Math.max(1, Math.round(servings) || 4)), await currentDevice());
}
