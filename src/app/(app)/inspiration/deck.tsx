"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/inspiration";

type Saved = { id: number; title: string; status: string; recipeSlug: string | null };

const CHIPS = ["Hurtig hverdag", "Børnevenligt", "Vegetar", "Fisk", "Kylling", "Suppe", "Ovnret", "Weekendmad", "Pasta", "Asiatisk"];

export function Deck({ initialCards, initialSaved, aiReady }: { initialCards: Card[]; initialSaved: Saved[]; aiReady: boolean }) {
  const [cards, setCards] = useState(initialCards);
  const [saved, setSaved] = useState(initialSaved);
  const [wish, setWish] = useState("");
  const [searching, setSearching] = useState(false);
  const [foreground, setForeground] = useState<string | null>(null); // the wish being searched while the user waits
  const [error, setError] = useState<string | null>(null);
  const autoRefilled = useRef(false);
  const lastWish = useRef("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/inspiration", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { cards: Card[]; saved: Saved[] };
    setSaved(data.saved);
    return data;
  }, []);

  const search = useCallback(async (w: string, background = false) => {
    lastWish.current = w;
    if (!background) setForeground(w || "Gode hverdagsretter");
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/inspiration/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wish: w }),
      });
      const data = await res.json().catch(() => ({ error: `Uventet svar fra serveren (${res.status}).` }));
      if (!res.ok) throw new Error(data.error);
      setCards(data.cards);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen forbindelse til serveren.");
    } finally {
      setSearching(false);
      setForeground(null);
    }
  }, []);

  // While something is being saved, poll until it lands.
  const anySaving = saved.some((s) => s.status === "saving");
  useEffect(() => {
    if (!anySaving) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [anySaving, refresh]);

  async function decide(card: Card, action: "save" | "skip") {
    setCards((c) => c.filter((x) => x.id !== card.id));
    if (action === "save") setSaved((s) => [{ id: card.id, title: card.title, status: "saving", recipeSlug: null }, ...s].slice(0, 6));
    // Keep the deck topped up once per visit when it runs low.
    if (cards.length <= 3 && !searching && !autoRefilled.current && aiReady) {
      autoRefilled.current = true;
      void search(lastWish.current, true);
    }
    const res = await fetch(`/api/inspiration/${card.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (action === "save") await refresh();
    if (!res?.ok && action === "save") setError("Kunne ikke gemme opskriften. Prøv igen fra listen nedenfor.");
  }

  async function retry(id: number) {
    await fetch(`/api/inspiration/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) });
    const data = await refresh();
    if (data) setCards(data.cards);
  }

  const top = cards[0];

  return (
    <>
      <header className="mb-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Inspiration</h1>
        <p className="mt-0.5 text-sm text-muted">Rigtige opskrifter fra danske madsider. Højre gemmer, venstre springer over.</p>
      </header>

      {!aiReady && <p className="card mb-4 p-4 text-sm text-warm">ANTHROPIC_API_KEY mangler på serveren, så der kan ikke søges.</p>}

      <form
        className="mb-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(wish);
        }}
      >
        <input value={wish} onChange={(e) => setWish(e.target.value)} placeholder="Hvad har I lyst til?" className="field" enterKeyHint="search" />
        <button className="btn-primary px-4" disabled={!!foreground || !aiReady}>Find</button>
      </form>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHIPS.map((c) => (
          <button
            key={c}
            disabled={!!foreground || !aiReady}
            onClick={() => {
              setWish(c);
              void search(c);
            }}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${
              foreground === c ? "border-accent bg-accent text-accent-ink disabled:opacity-100" : "border-line bg-surface text-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-warm">{error}</p>}

      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm">
        {cards.slice(0, 3).reverse().map((c, i, arr) => {
          const depth = arr.length - 1 - i;
          return depth === 0 ? (
            <SwipeCard key={c.id} card={c} onDecide={(a) => decide(c, a)} />
          ) : (
            <div
              key={c.id}
              className="card absolute inset-0 overflow-hidden"
              style={{ transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`, opacity: 1 - depth * 0.25 }}
              aria-hidden
            >
              <CardFace card={c} />
            </div>
          );
        })}
        {foreground && <SearchingCard wish={foreground} />}
        {!top && !foreground && (
          <div className="card absolute inset-0 grid place-items-center p-8 text-center">
            {searching ? (
              <SearchingCard wish="Flere opskrifter" />
            ) : (
              <div>
                <p className="font-display text-xl font-semibold">Ingen kort lige nu</p>
                <p className="mt-1 mb-4 text-sm text-muted">Skriv et ønske eller vælg en kategori, eller lad Claude finde gode hverdagsretter.</p>
                <button className="btn-primary" disabled={!aiReady} onClick={() => search(wish)}>
                  Find opskrifter
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {top && !foreground && (
        <div className="mt-5 flex items-center justify-center gap-6">
          <RoundButton label="Spring over" onClick={() => decide(top, "skip")}>
            <path d="M6 6l12 12M18 6 6 18" />
          </RoundButton>
          <RoundButton label="Gem opskrift" onClick={() => decide(top, "save")} big>
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </RoundButton>
        </div>
      )}
      {top && searching && !foreground && <p className="mt-3 text-center text-xs text-muted">Henter flere i baggrunden…</p>}

      {saved.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Senest gemt</h2>
          <ul className="card divide-y divide-line">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.status === "saving" && (
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Gemmer
                  </span>
                )}
                {s.status === "saved" && s.recipeSlug && (
                  <Link href={`/opskrifter/${s.recipeSlug}`} className="text-sm font-medium text-accent">Åbn</Link>
                )}
                {s.status === "failed" && (
                  <button onClick={() => retry(s.id)} className="text-sm text-warm">Fejlede · prøv igen</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SwipeCard({ card, onDecide }: { card: Card; onDecide: (a: "save" | "skip") => void }) {
  const [dx, setDx] = useState(0);
  const [flyout, setFlyout] = useState<0 | 1 | -1>(0);
  const [flipped, setFlipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);

  const go = useCallback(
    (dir: 1 | -1) => {
      setFlyout(dir);
      setTimeout(() => onDecide(dir === 1 ? "save" : "skip"), 220);
    },
    [onDecide],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const x = flyout ? flyout * 700 : dx;
  const hint = Math.max(-1, Math.min(1, x / 120));

  return (
    <div
      className="card absolute inset-0 cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing"
      style={{
        transform: `translateX(${x}px) rotate(${x / 18}deg)`,
        transition: dragging ? "none" : "transform 220ms ease-out",
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        moved.current = false;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const d = e.clientX - start.current.x;
        if (Math.abs(d) > 6) moved.current = true;
        setDx(d);
      }}
      onPointerUp={() => {
        const d = dx;
        start.current = null;
        setDragging(false);
        if (d > 100) go(1);
        else if (d < -100) go(-1);
        else {
          setDx(0);
          if (!moved.current) setFlipped((f) => !f);
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
        setDx(0);
      }}
    >
      <CardFace card={card} flipped={flipped} />
      <span
        className="pointer-events-none absolute top-6 left-5 -rotate-12 rounded-lg border-4 border-accent bg-surface/80 px-3 py-1 font-display text-2xl font-bold text-accent"
        style={{ opacity: Math.max(0, hint) }}
      >
        GEM
      </span>
      <span
        className="pointer-events-none absolute top-6 right-5 rotate-12 rounded-lg border-4 border-warm bg-surface/80 px-3 py-1 font-display text-2xl font-bold text-warm"
        style={{ opacity: Math.max(0, -hint) }}
      >
        NÆSTE
      </span>
    </div>
  );
}

function CardFace({ card, flipped = false }: { card: Card; flipped?: boolean }) {
  if (flipped)
    return (
      <div className="flex h-full flex-col p-5">
        <p className="font-display text-xl font-semibold">{card.title}</p>
        <p className="mb-3 text-sm text-muted">{[card.site, card.time && `${card.time} min`].filter(Boolean).join(" · ")}</p>
        {card.ingredients.length ? (
          <ul className="flex-1 space-y-1 overflow-y-auto text-sm">
            {card.ingredients.map((i, n) => (
              <li key={n} className="border-b border-line pb-1">{i}</li>
            ))}
          </ul>
        ) : (
          <div className="flex-1 text-sm">
            {card.pitch && <p className="mb-2">{card.pitch}</p>}
            <p className="text-muted">Ingredienslisten vises, når opskriften er gemt, eller på siden.</p>
          </div>
        )}
        <a
          href={card.url}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          className="btn-ghost mt-3"
        >
          Se opskriften på {card.site} ↗
        </a>
      </div>
    );
  return (
    <div className="relative h-full">
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" referrerPolicy="no-referrer" draggable={false} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-accent-soft font-display text-7xl text-accent">{card.title[0]}</div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-5 pt-20 text-white">
        <p className="text-xs tracking-wide uppercase opacity-80">{[card.site, card.time && `${card.time} min`].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 font-display text-2xl leading-tight font-semibold">{card.title}</p>
        {card.pitch && <p className="mt-1.5 text-sm leading-snug opacity-90">{card.pitch}</p>}
        <p className="mt-3 text-xs opacity-70">Tryk for ingredienser</p>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, big = false, children }: { label: string; onClick: () => void; big?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`grid place-items-center rounded-full shadow-sm transition active:scale-95 ${
        big ? "size-16 bg-accent text-accent-ink" : "size-14 border border-line bg-surface text-warm"
      }`}
    >
      <svg width={big ? 28 : 24} height={big ? 28 : 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

const STEPS = ["Søger på danske madsider…", "Læser søgeresultaterne…", "Vælger varierede retter…", "Tjekker at opskrifterne findes…", "Henter billeder…"];

function SearchingCard({ wish }: { wish: string }) {
  const [step, setStep] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    // Rough pacing of a ~60 s search; stays on the last step until done.
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 11000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="card absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 overflow-hidden p-8 text-center">
      <div className="relative size-24">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
        <span className="absolute inset-3 animate-pulse rounded-full bg-accent/25" />
        <span className="absolute inset-0 grid place-items-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="animate-[spin_3s_linear_infinite] text-accent">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        </span>
      </div>
      <div>
        <p className="text-xs tracking-wide text-muted uppercase">Leder efter</p>
        <p className="font-display text-2xl font-semibold">{wish}</p>
      </div>
      <div className="w-full max-w-60">
        <p className="mb-2 min-h-5 text-sm" key={step}>{STEPS[step]}</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out" style={{ width: `${Math.min(95, (secs / 70) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">Tager typisk under et minut</p>
      </div>
    </div>
  );
}
