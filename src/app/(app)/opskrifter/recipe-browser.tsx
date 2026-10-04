"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type R = { slug: string; title: string; tags: string[]; time?: number; image?: string };

export function RecipeBrowser({ recipes }: { recipes: R[] }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "da")), [recipes]);
  const shown = recipes.filter(
    (r) => (!tag || r.tags.includes(tag)) && (!q || r.title.toLowerCase().includes(q.toLowerCase())),
  );

  if (!recipes.length)
    return (
      <div className="card p-6 text-center text-muted">
        <p>Ingen opskrifter endnu.</p>
        <Link href="/opskrifter/ny" className="btn-primary mt-4">Tilføj den første</Link>
      </div>
    );

  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg i opskrifter" className="field mb-3" type="search" />
      {tags.length > 0 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${tag === t ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.slug}>
            <Link href={`/opskrifter/${r.slug}`} className="card flex items-center gap-3 p-2.5 pr-4">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/images/${r.image}`} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-xl text-accent">
                  {r.title[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="truncate text-sm text-muted">{[r.time && `${r.time} min`, ...r.tags].filter(Boolean).join(" · ")}</p>
              </div>
            </Link>
          </li>
        ))}
        {!shown.length && <p className="py-6 text-center text-muted">Intet matcher.</p>}
      </ul>
    </>
  );
}
