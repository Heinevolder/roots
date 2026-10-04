"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type PickRecipe = { slug: string; title: string; tags: string[]; time?: number; servings: number };

export function RecipePicker({ recipes, onPick, onClose }: { recipes: PickRecipe[]; onPick: (slug: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const ql = q.toLowerCase();
  const shown = recipes.filter((r) => !q || r.title.toLowerCase().includes(ql) || r.tags.some((t) => t.includes(ql)));

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Vælg ret"
        className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Vælg ret</h2>
          <button onClick={onClose} className="text-muted">Luk</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg" type="search" className="field mb-3" autoFocus />
        <ul className="-mx-1 flex-1 overflow-y-auto px-1">
          {shown.map((r) => (
            <li key={r.slug}>
              <button onClick={() => onPick(r.slug)} className="w-full rounded-xl px-3 py-3 text-left hover:bg-surface active:bg-accent-soft">
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted">{[r.time && `${r.time} min`, ...r.tags].filter(Boolean).join(" · ")}</p>
              </button>
            </li>
          ))}
          {!shown.length && (
            <li className="py-6 text-center text-muted">
              Ingen opskrifter. <Link href="/opskrifter/ny" className="text-accent underline">Tilføj en</Link>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
