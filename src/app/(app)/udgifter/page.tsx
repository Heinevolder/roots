import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { monthlySpend, recentTrips, type Month } from "@/lib/receipts";
import { dayLabel } from "@/lib/dates";
import { kr } from "@/lib/money";
import { ReceiptUpload } from "./upload";

export const metadata = { title: "Udgifter · Roots" };

export default async function SpendPage() {
  await connection();
  const months = monthlySpend();
  const trips = recentTrips();

  return (
    <>
      <PageHeader title="Udgifter" sub="Hvad I bruger på indkøb, fra kvitteringerne" />
      <ReceiptUpload />

      {!months.length && (
        <div className="card p-6 text-center text-muted">
          Ingen kvitteringer endnu. Tag et billede af kvitteringen, når I har handlet, så kan I se, hvad I bruger om måneden.
        </div>
      )}

      {months.map((m) => (
        <MonthCard key={m.month} m={m} />
      ))}

      {trips.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Seneste ture</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {trips.map((t) => {
              const { weekday, short } = dayLabel(t.date);
              return (
                <li key={t.id}>
                  <Link href={`/udgifter/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span>
                      {weekday} {short}
                      {t.store && <span className="text-muted"> · {t.store}</span>}
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {t.total == null ? (
                        <span className="text-muted">Ingen kvittering</span>
                      ) : (
                        <>
                          {kr(t.total)}
                          {t.unsure > 0 && <span className="ml-2 rounded-full bg-warm-soft px-2 py-0.5 text-xs text-warm">tjek {t.unsure}</span>}
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function monthName(m: string) {
  const s = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" });
  return s[0].toUpperCase() + s.slice(1);
}

function MonthCard({ m }: { m: Month }) {
  const counted = m.fromList + m.extra;
  const listShare = counted > 0 ? Math.max(0, Math.min(1, m.fromList / counted)) : 0;
  return (
    <section className="card mb-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{monthName(m.month)}</h2>
        <span className="font-display text-2xl font-semibold tabular-nums">{kr(m.total)}</span>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {m.trips} {m.trips === 1 ? "tur" : "ture"}
        {m.missing > 0 && ` · ${m.missing} uden kvittering`}
      </p>
      {counted > 0 && (
        <>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-warm-soft" aria-hidden>
            <div className="bg-accent" style={{ width: `${listShare * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-sm">
            <span>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-accent" />
              Fra listen <span className="tabular-nums">{kr(m.fromList)}</span>
            </span>
            <span>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-warm" />
              Ekstra <span className="tabular-nums">{kr(m.extra)}</span>
            </span>
          </div>
        </>
      )}
      {m.categories.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">Per afdeling</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {m.categories.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span>{c.name}</span>
                <span className="tabular-nums">{kr(c.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
