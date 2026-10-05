import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSharedRecipe } from "@/lib/recipes";
import { formatAmount } from "@/lib/ingredients";
import { Steps } from "@/components/recipe-steps";

export async function generateMetadata({ params }: PageProps<"/del/[token]">) {
  const r = getSharedRecipe((await params).token);
  return { title: r?.title ?? "Roots", robots: { index: false, follow: false } };
}

/** Public, read-only recipe for people without a login. Only reachable with the share token. */
export default async function SharedRecipePage({ params }: PageProps<"/del/[token]">) {
  await connection();
  const { token } = await params;
  const r = getSharedRecipe(token);
  if (!r) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16">
      <article>
        {r.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/del/${token}/billede`} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
        )}
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{r.title}</h1>
        <p className="mt-1 text-sm text-muted">{[`${r.servings} portioner`, r.time && `${r.time} min`].filter(Boolean).join(" · ")}</p>
        {r.source && (
          <a href={r.source} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-accent underline">
            {r.source.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        )}

        <h2 className="mt-6 mb-2 font-display text-xl font-semibold">Ingredienser</h2>
        <ul className="card divide-y divide-line">
          {r.ingredients.map((i, n) => (
            <li key={n} className="flex gap-3 px-4 py-2.5">
              <span className="w-20 shrink-0 text-right text-muted tabular-nums">{[formatAmount(i.amount), i.unit].filter(Boolean).join(" ")}</span>
              <span>{i.item}</span>
            </li>
          ))}
        </ul>

        {r.body && (
          <>
            <h2 className="mt-6 mb-2 font-display text-xl font-semibold">Sådan gør du</h2>
            <Steps body={r.body} />
          </>
        )}
      </article>
      <p className="mt-10 text-center text-xs text-muted">Delt fra Roots</p>
    </main>
  );
}
