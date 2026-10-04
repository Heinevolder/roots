import Link from "next/link";
import { connection } from "next/server";
import { listRecipes } from "@/lib/recipes";
import { PageHeader } from "@/components/page-header";
import { RecipeBrowser } from "./recipe-browser";

export const metadata = { title: "Opskrifter · Roots" };

export default async function RecipesPage() {
  await connection();
  const recipes = listRecipes().map(({ slug, title, tags, time, image }) => ({ slug, title, tags, time, image }));
  return (
    <>
      <PageHeader
        title="Opskrifter"
        sub={`${recipes.length} i alt`}
        action={
          <Link href="/opskrifter/ny" className="btn-primary px-3 py-2 text-sm">
            + Ny
          </Link>
        }
      />
      <RecipeBrowser recipes={recipes} />
    </>
  );
}
