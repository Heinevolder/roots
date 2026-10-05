import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRecipe } from "@/lib/recipes";
import { getCatalogueIndex } from "@/lib/catalogue";
import { isPantry } from "@/lib/catalogue-core";
import { DeleteRecipeButton } from "./delete-button";
import { RecipeIngredients } from "./add-to-list";
import { ShareButton } from "./share-button";
import { Steps } from "@/components/recipe-steps";

export async function generateMetadata({ params }: PageProps<"/opskrifter/[slug]">) {
  const r = getRecipe((await params).slug);
  return { title: r ? `${r.title} · Roots` : "Roots" };
}

export default async function RecipePage({ params }: PageProps<"/opskrifter/[slug]">) {
  await connection();
  const { slug } = await params;
  const r = getRecipe(slug);
  if (!r) notFound();
  const idx = getCatalogueIndex();

  return (
    <article>
      <Link href="/opskrifter" className="text-sm text-muted">← Opskrifter</Link>
      {r.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/images/${r.image}`} alt="" className="mt-3 aspect-[4/3] w-full rounded-2xl object-cover" />
      )}
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{r.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {[`${r.servings} portioner`, r.time && `${r.time} min`, ...r.tags].filter(Boolean).join(" · ")}
      </p>
      {r.source && (
        <a href={r.source} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-accent underline">
          {r.source.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      )}

      <RecipeIngredients
        slug={r.slug}
        baseServings={r.servings}
        ingredients={r.ingredients.map((i) => ({ ...i, pantry: isPantry(idx, i.item) }))}
      />

      {r.body && (
        <>
          <h2 className="mt-6 mb-2 font-display text-xl font-semibold">Sådan gør du</h2>
          <Steps body={r.body} />
        </>
      )}

      <ShareButton slug={r.slug} title={r.title} initialToken={r.share ?? null} />

      <div className="mt-3 flex gap-2">
        <Link href={`/opskrifter/${r.slug}/rediger`} className="btn-ghost flex-1">Ret</Link>
        <DeleteRecipeButton slug={r.slug} />
      </div>
    </article>
  );
}
