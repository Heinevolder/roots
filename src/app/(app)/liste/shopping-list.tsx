"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ldb, newId, type Row, type StapleRow } from "@/lib/client/store";
import { finishShoppingRemote, mutate, mutateMany, startLiveSync } from "@/lib/client/sync";
import { canonical, categoryName, categoryOf, type CatalogueIndex } from "@/lib/catalogue-core";
import { formatAmount, parseIngredientLine } from "@/lib/ingredients";
import { rangeLabel } from "@/lib/dates";
import { placeItem } from "../mere/actions";
import { pull } from "@/lib/client/sync";

type Status = "live" | "offline" | "connecting";
type Tab = "handl" | "hjemme";

export function ShoppingList() {
  const [status, setStatus] = useState<Status>("connecting");
  const [tab, setTab] = useState<Tab>("handl");
  const rows = useLiveQuery(() => ldb.rows.filter((r) => !r.deleted).toArray(), []);
  const catalogue = useLiveQuery(async () => (await ldb.meta.get("catalogue"))?.value as CatalogueIndex | undefined, []);
  const staples = useLiveQuery(async () => ((await ldb.meta.get("staples"))?.value as StapleRow[] | undefined) ?? [], []);
  const titles = useLiveQuery(async () => ((await ldb.meta.get("recipes"))?.value as Record<string, string> | undefined) ?? {}, []);
  const pending = useLiveQuery(() => ldb.outbox.count(), []) ?? 0;
  const range = useLiveQuery(async () => (await ldb.meta.get("range"))?.value as { start: string; end: string } | undefined, []);

  const [moving, setMoving] = useState<Row | null>(null);

  useEffect(() => startLiveSync(setStatus), []);

  const idx: CatalogueIndex = catalogue ?? { categories: [], lookup: {}, pantry: [] };
  const live = rows ?? [];
  const toReview = live.filter((r) => r.source === "recipe" && !r.checked);
  const undecided = toReview.filter((r) => !r.dismissed).length;
  const visible = live.filter((r) => !r.dismissed);
  const open = visible.filter((r) => !r.checked);
  const inCart = visible.filter((r) => r.checked).sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0));
  const groups = groupByCategory(open, idx);

  return (
    <>
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Indkøbsliste</h1>
          {range && <p className="mt-0.5 text-sm font-medium">Til {rangeLabel(range.start, range.end)}</p>}
          <p className="mt-0.5 text-sm text-muted">
            {!rows ? "Henter…" : open.length ? `${open.length} tilbage` : inCart.length ? "Alt er i kurven" : "Tom liste"}
            {inCart.length > 0 && ` · ${inCart.length} i kurven`}
          </p>
        </div>
        <StatusPill status={status} pending={pending} />
      </header>

      <div className="mb-4 flex rounded-xl border border-line bg-surface p-0.5 text-sm">
        <TabButton active={tab === "handl"} onClick={() => setTab("handl")}>Handl</TabButton>
        <TabButton active={tab === "hjemme"} onClick={() => setTab("hjemme")}>
          Har vi allerede?{undecided > 0 && <span className="ml-1 text-xs opacity-70">{undecided}</span>}
        </TabButton>
      </div>

      {moving && <MovePanel row={moving} onClose={() => setMoving(null)} idx={idx} />}
      {tab === "hjemme" ? (
        <Review rows={toReview} idx={idx} />
      ) : (
        <>
          <AddBar idx={idx} rows={live} staples={staples ?? []} />
          {groups.map(([cat, items]) => (
            <section key={cat} className="mb-4">
              <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{categoryName(idx, cat)}</h2>
              <ul className="card no-select divide-y divide-line overflow-hidden">
                {items.map((r) => (
                  <ItemRow key={r.id} row={r} titles={titles ?? {}} onMove={() => setMoving(r)} />
                ))}
              </ul>
              {cat === idx.categories.length && <p className="mt-1.5 px-1 text-xs text-muted">Tryk på mærkaten for at placere en vare i en afdeling.</p>}
            </section>
          ))}
          {rows && !open.length && !inCart.length && (
            <div className="card p-6 text-center text-muted">
              Listen er tom. Planlæg nogle retter, eller tilføj varer ovenfor.
            </div>
          )}
          {inCart.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted uppercase">I kurven</h2>
              <ul className="card no-select divide-y divide-line overflow-hidden">
                {inCart.map((r) => (
                  <ItemRow key={r.id} row={r} titles={titles ?? {}} />
                ))}
              </ul>
              <FinishButton count={inCart.length} offline={status === "offline"} />
            </section>
          )}
          {visible.length > 0 && <EmptyButton rows={visible} />}
        </>
      )}
    </>
  );
}

function groupByCategory(rows: Row[], idx: CatalogueIndex): [number, Row[]][] {
  const m = new Map<number, Row[]>();
  for (const r of rows) {
    const c = categoryOf(idx, r.item);
    m.set(c, [...(m.get(c) ?? []), r]);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, items]) => [c, items.sort((a, b) => a.item.localeCompare(b.item, "da") || (a.unit ?? "").localeCompare(b.unit ?? ""))]);
}

function qty(r: Row) {
  return [formatAmount(r.amount), r.unit].filter(Boolean).join("\u00a0"); // never split "500 g"
}

function ItemRow({ row, titles, onMove }: { row: Row; titles: Record<string, string>; onMove?: () => void }) {
  const toggle = () => mutate({ ...row, checked: !row.checked, checkedAt: row.checked ? null : Date.now() });
  const remove = () => mutate(row.source === "recipe" ? { ...row, dismissed: true } : { ...row, deleted: true });
  return (
    <li className="flex items-stretch">
      <button onClick={toggle} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 pl-4 text-left active:bg-accent-soft">
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${row.checked ? "border-accent bg-accent text-accent-ink" : "border-line"}`}
          aria-hidden
        >
          {row.checked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5L20 7" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-base leading-snug ${row.checked ? "text-muted line-through" : ""}`}>
            {row.item}
            {qty(row) && <> <span className="whitespace-nowrap text-muted tabular-nums">{qty(row)}</span></>}
          </span>
          {row.recipeSlugs && !row.checked && (
            <span className="block truncate text-xs text-muted">{row.recipeSlugs.split(",").map((s) => titles[s] ?? s).join(", ")}</span>
          )}
        </span>
      </button>
      {!row.checked && onMove && (
        <button onClick={onMove} className="shrink-0 pr-1 pl-3 text-muted/60 active:text-accent" aria-label={`Flyt ${row.item} til en anden afdeling`}>
          {/* tag: "which aisle" */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
            <circle cx="7.5" cy="7.5" r="1.3" />
          </svg>
        </button>
      )}
      {!row.checked && (
        <button onClick={remove} className="shrink-0 pr-4 pl-2 text-xl text-muted/60" aria-label={`Fjern ${row.item}`}>
          ×
        </button>
      )}
    </li>
  );
}

function AddBar({ idx, rows, staples }: { idx: CatalogueIndex; rows: Row[]; staples: StapleRow[] }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function add(item: string, amount: number | null, unit: string | null, source: "manual" | "staple") {
    const name = canonical(idx, item);
    const same = rows.find((r) => !r.checked && !r.dismissed && r.source !== "recipe" && r.item === name && (r.unit ?? null) === unit);
    if (same) {
      const sum = same.amount != null && amount != null ? same.amount + amount : (same.amount ?? amount);
      return mutate({ ...same, amount: sum });
    }
    return mutate({
      id: newId(),
      item: name,
      amount,
      unit,
      source,
      recipeSlugs: null,
      checked: false,
      checkedAt: null,
      dismissed: false,
      deleted: false,
      updatedAt: Date.now(),
    });
  }

  const onList = new Set(rows.filter((r) => !r.checked && !r.dismissed).map((r) => r.item));
  const missingStaples = staples.filter((s) => !onList.has(canonical(idx, s.item)));

  return (
    <div className="mb-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = parseIngredientLine(text);
          if (p) void add(p.item, p.amount ?? null, p.unit ?? null, "manual");
          setText("");
          input.current?.focus(); // ready for the next item, keyboard stays up
        }}
      >
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tilføj vare, fx 2 l mælk"
          className="field"
          enterKeyHint="enter"
          autoComplete="off"
          autoCapitalize="none"
        />
        {/* preventDefault on mousedown keeps focus (and the iOS keyboard) in the field */}
        <button className="btn-primary px-4" disabled={!text.trim()} aria-label="Tilføj" onMouseDown={(e) => e.preventDefault()}>
          +
        </button>
      </form>
      {missingStaples.length > 0 && (
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {missingStaples.map((s) => (
            <button
              key={s.id}
              onClick={() => add(s.item, s.amount, s.unit, "staple")}
              className="shrink-0 rounded-full border border-dashed border-line bg-surface px-3 py-1 text-sm text-muted"
            >
              + {s.item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Review({ rows, idx }: { rows: Row[]; idx: CatalogueIndex }) {
  const sorted = [...rows].sort((a, b) => categoryOf(idx, a.item) - categoryOf(idx, b.item) || a.item.localeCompare(b.item, "da"));
  if (!sorted.length) return <div className="card p-6 text-center text-muted">Ingen varer fra madplanen at tjekke.</div>;
  return (
    <>
      <p className="mb-3 text-sm text-muted">Tryk på det, I allerede har derhjemme, så det ryger af listen.</p>
      <ul className="card no-select divide-y divide-line overflow-hidden">
        {sorted.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => mutate({ ...r, dismissed: !r.dismissed })}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-1.5 text-left active:bg-accent-soft"
            >
              <span className={`flex-1 text-base ${r.dismissed ? "text-muted line-through" : ""}`}>
                {r.item}
                {qty(r) && <> <span className="whitespace-nowrap text-muted tabular-nums">{qty(r)}</span></>}
              </span>
              <span className={`rounded-full px-3 py-1 text-sm ${r.dismissed ? "bg-accent-soft text-accent" : "border border-line text-muted"}`}>
                {r.dismissed ? "Har vi" : "Skal købes"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function FinishButton({ count, offline }: { count: number; offline: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button
        className="btn-primary w-full"
        disabled={busy || offline}
        onClick={async () => {
          if (!confirm(`Færdig med at handle? ${count} varer i kurven ryddes af listen.`)) return;
          setBusy(true);
          setError(null);
          const ok = await finishShoppingRemote();
          setBusy(false);
          if (!ok) setError("Kunne ikke nå serveren. Prøv igen, når der er forbindelse.");
        }}
      >
        {busy ? "Rydder…" : "Færdig med at handle"}
      </button>
      {offline && <p className="mt-2 text-center text-xs text-muted">Kræver forbindelse. Dine flueben er gemt.</p>}
      {error && <p className="mt-2 text-center text-sm text-warm">{error}</p>}
    </div>
  );
}

/** Clear the whole list. Plan lines are marked "har vi" so regeneration doesn't bring them back. */
function EmptyButton({ rows }: { rows: Row[] }) {
  return (
    <button
      className="mt-6 w-full py-2 text-sm text-muted active:text-warm"
      onClick={() => {
        if (!confirm(`Tøm listen? Alle ${rows.length} varer fjernes.`)) return;
        void mutateMany(rows.map((r) => (r.source === "recipe" ? { ...r, dismissed: true, checked: false, checkedAt: null } : { ...r, deleted: true })));
      }}
    >
      Tøm listen
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-lg px-3 py-1.5 ${active ? "bg-accent text-accent-ink" : "text-muted"}`}>
      {children}
    </button>
  );
}

function StatusPill({ status, pending }: { status: Status; pending: number }) {
  const label = status === "live" ? (pending ? "Synker…" : "Live") : status === "offline" ? "Offline" : "Forbinder…";
  const dot = status === "live" ? "bg-accent" : status === "offline" ? "bg-warm" : "bg-muted";
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
      {status === "offline" && pending > 0 && ` · ${pending} i kø`}
    </span>
  );
}

/** Pick the aisle an item belongs in; remembered in the catalogue. */
function MovePanel({ row, onClose, idx }: { row: Row; onClose: () => void; idx: CatalogueIndex }) {
  const current = categoryOf(idx, row.item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function place(ci: number) {
    onClose();
    if (ci === current) return;
    // Optimistic: regroup right away; the server confirms over sync.
    const name = canonical(idx, row.item);
    await ldb.meta.put({ key: "catalogue", value: { ...idx, lookup: { ...idx.lookup, [name]: [name, ci] } } });
    try {
      await placeItem(row.item, ci);
    } catch {
      alert("Kunne ikke gemme placeringen. Er der forbindelse?");
      void pull();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Flyt ${row.item}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.15)]"
      >
        <div className="mx-auto max-w-xl">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm">
              Flyt <b>{row.item}</b> til
            </p>
            <button onClick={onClose} className="text-sm text-muted">
              Annuller
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {idx.categories.map((name, ci) => (
              <button
                key={name}
                onClick={() => place(ci)}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm active:bg-accent active:text-accent-ink ${
                  ci === current ? "border-accent font-medium text-accent" : "border-line bg-surface"
                }`}
              >
                {name}
                {ci === current && " ✓"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Huskes til næste gang, på begge telefoner.</p>
        </div>
      </div>
    </div>
  );
}
