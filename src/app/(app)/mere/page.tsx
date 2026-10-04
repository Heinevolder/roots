import { connection } from "next/server";
import { listStaples } from "@/lib/list";
import { getCatalogue } from "@/lib/catalogue";
import { formatAmount } from "@/lib/ingredients";
import { PageHeader } from "@/components/page-header";
import { logout } from "@/app/login/actions";
import { addCatalogueItem, addPantry, addStaple, moveCategory, removePantry, removeStaple } from "./actions";

export const metadata = { title: "Mere · Roots" };

export default async function MorePage() {
  await connection();
  const staples = listStaples();
  const { categories: cats, pantry } = getCatalogue();

  return (
    <>
      <PageHeader title="Mere" />

      <section className="mb-8">
        <h2 className="font-display text-xl font-semibold">Basisvarer</h2>
        <p className="mb-3 text-sm text-muted">Ting I køber de fleste uger. De vises som genveje på indkøbslisten.</p>
        <form action={addStaple} className="mb-3 flex gap-2">
          <input name="staple" placeholder="Fx 2 l mælk" className="field" required />
          <button className="btn-primary px-4">Tilføj</button>
        </form>
        {staples.length > 0 && (
          <ul className="card divide-y divide-line">
            {staples.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <span>
                  {s.item} <span className="text-muted">{[formatAmount(s.amount), s.unit].filter(Boolean).join(" ")}</span>
                </span>
                <form action={removeStaple.bind(null, s.id)}>
                  <button className="text-sm text-muted" aria-label={`Fjern ${s.item}`}>Fjern</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl font-semibold">Har I altid</h2>
        <p className="mb-3 text-sm text-muted">Står i opskrifterne, men kommer aldrig på indkøbslisten. Særlige olier som sesamolie kommer stadig med.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {pantry.map((p) => (
            <form key={p} action={removePantry.bind(null, p)}>
              <button className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-2.5 pl-3 text-sm" aria-label={`Fjern ${p}`}>
                {p} <span className="text-muted">×</span>
              </button>
            </form>
          ))}
        </div>
        <form action={addPantry} className="flex gap-2">
          <input name="pantry" placeholder="Fx sukker, eddike" className="field" required />
          <button className="btn-ghost px-4">Tilføj</button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl font-semibold">Butikkens rækkefølge</h2>
        <p className="mb-3 text-sm text-muted">Sorter afdelingerne, så listen følger jeres vej gennem Føtex/Bilka.</p>
        <ol className="card divide-y divide-line">
          {cats.map((c, i) => (
            <li key={c.name} className="flex items-center gap-2 px-4 py-2">
              <span className="w-5 text-sm text-muted tabular-nums">{i + 1}</span>
              <span className="flex-1">
                {c.name} <span className="text-xs text-muted">{c.items.length}</span>
              </span>
              <form action={moveCategory.bind(null, i, -1)}>
                <button disabled={i === 0} className="size-9 rounded-lg text-muted disabled:opacity-30" aria-label={`Flyt ${c.name} op`}>↑</button>
              </form>
              <form action={moveCategory.bind(null, i, 1)}>
                <button disabled={i === cats.length - 1} className="size-9 rounded-lg text-muted disabled:opacity-30" aria-label={`Flyt ${c.name} ned`}>↓</button>
              </form>
            </li>
          ))}
        </ol>
        <form action={addCatalogueItem} className="mt-3 space-y-2">
          <p className="text-sm text-muted">Står en vare under &quot;Andet&quot;? Placer den i en afdeling:</p>
          <div className="flex gap-2">
            <input name="item" placeholder="Vare" className="field" required />
            <select name="category" className="field w-auto">
              {cats.map((c, i) => (
                <option key={c.name} value={i}>{c.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-ghost w-full">Gem placering</button>
        </form>
      </section>

      <form action={logout}>
        <button className="btn-ghost w-full">Log ud</button>
      </form>
    </>
  );
}
