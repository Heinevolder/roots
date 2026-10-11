import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTrip, receiptCategories } from "@/lib/receipts";
import { getCatalogue } from "@/lib/catalogue";
import { dayLabel } from "@/lib/dates";
import { kr, kr2 } from "@/lib/money";
import type { ReceiptLine } from "@/lib/db/schema";
import { ReceiptUpload } from "../upload";
import { confirmAll, saveLine } from "../actions";
import { DeleteReceiptButton } from "./delete-receipt";

export const metadata = { title: "Kvittering · Roots" };

export default async function TripPage({ params }: PageProps<"/udgifter/[id]">) {
  await connection();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? getTrip(id) : null;
  if (!data) notFound();
  const { trip, lines, notFound: missing } = data;
  const { weekday, short } = dayLabel(trip.date);
  const unsure = lines.filter((l) => !l.sure);
  const categories = receiptCategories();
  const names = [...new Set([...lines.map((l) => l.item), ...getCatalogue().categories.flatMap((c) => c.items.map((i) => i.name))])].sort();
  const fromList = lines.filter((l) => l.onList).reduce((s, l) => s + l.price, 0);

  return (
    <>
      <Link href="/udgifter" className="text-sm text-muted">← Udgifter</Link>
      <header className="mt-3 mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {weekday} {short}
          </h1>
          {trip.store && <p className="mt-0.5 text-sm text-muted">{trip.store}</p>}
        </div>
        {trip.total != null && <span className="font-display text-2xl font-semibold tabular-nums">{kr(trip.total)}</span>}
      </header>

      <datalist id="receipt-items">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {trip.total == null ? (
        <ReceiptUpload tripId={trip.id} />
      ) : (
        <p className="mb-5 text-sm text-muted">
          Fra listen <span className="tabular-nums">{kr(fromList)}</span> · Ekstra <span className="tabular-nums">{kr(trip.total - fromList)}</span>
        </p>
      )}

      {unsure.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Tjek {unsure.length === 1 ? "denne" : "disse"}</h2>
          <ul className="card divide-y divide-line">
            {unsure.map((l) => (
              <li key={l.id} className="px-4 py-3">
                <LineHead line={l} />
                <LineForm line={l} categories={categories} />
              </li>
            ))}
          </ul>
          <form action={confirmAll.bind(null, trip.id)}>
            <button className="btn-ghost mt-2 w-full">Det ser rigtigt ud</button>
          </form>
        </section>
      )}

      {lines.length > 0 && (
        <section>
          <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Kvitteringen</h2>
          <ul className="card divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id}>
                <details className="px-4 py-2.5">
                  <summary className="cursor-pointer list-none">
                    <LineHead line={l} />
                  </summary>
                  <LineForm line={l} categories={categories} />
                </details>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 px-1 text-xs text-muted">Tryk på en linje for at rette varen. Rettelser huskes til næste gang.</p>
        </section>
      )}

      {trip.total != null && missing.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Fra listen, men ikke fundet på kvitteringen</h2>
          <p className="px-1 text-sm text-muted">{missing.join(", ")}</p>
        </section>
      )}

      {trip.total == null && missing.length > 0 && (
        <section>
          <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Købt fra listen</h2>
          <p className="px-1 text-sm text-muted">{missing.join(", ")}</p>
        </section>
      )}

      {trip.total != null && <DeleteReceiptButton tripId={trip.id} />}
    </>
  );
}

function LineHead({ line }: { line: ReceiptLine }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div>
          {line.item}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${line.onList ? "bg-accent-soft text-accent" : "bg-warm-soft text-warm"}`}>
            {line.onList ? "liste" : "ekstra"}
          </span>
        </div>
        <div className="truncate text-xs text-muted">
          {line.text} · {line.category}
        </div>
      </div>
      <span className="shrink-0 tabular-nums">{kr2(line.price)}</span>
    </div>
  );
}

function LineForm({ line, categories }: { line: ReceiptLine; categories: string[] }) {
  if (line.item === "forskel")
    return <p className="mt-1 text-sm text-muted">Linjerne giver ikke kvitteringens total. Mangler der noget, så tag et nyt billede. Totalen tæller med i måneden uanset.</p>;
  return (
    <form action={saveLine.bind(null, line.id)} className="mt-2 flex flex-wrap gap-2">
      <input name="item" defaultValue={line.item} list="receipt-items" className="field min-w-0 flex-1 basis-40" aria-label="Vare" required />
      <select name="category" defaultValue={line.category} className="field w-auto" aria-label="Afdeling">
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <button className="btn-primary px-4">Gem</button>
    </form>
  );
}
