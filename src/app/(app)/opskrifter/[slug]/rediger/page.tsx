import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRecipe } from "@/lib/recipes";
import { PageHeader } from "@/components/page-header";
import { RecipeForm } from "../../recipe-form";

export default async function EditRecipePage({ params }: PageProps<"/opskrifter/[slug]/rediger">) {
  await connection();
  const { slug } = await params;
  const r = getRecipe(slug);
  if (!r) notFound();
  return (
    <>
      <PageHeader title="Ret opskrift" sub={r.title} />
      <RecipeForm initial={r} />
    </>
  );
}
