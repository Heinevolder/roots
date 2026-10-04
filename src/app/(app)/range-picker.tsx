"use client";

import { useState, useTransition } from "react";
import { setRange } from "./plan-actions";
import { addDays, range } from "@/lib/dates";

type R = { start: string; end: string };

export function RangePicker({ current, presets, today }: { current: R; presets: (R & { label: string })[]; today: string }) {
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const same = (p: R) => p.start === current.start && p.end === current.end;
  const isCustom = !presets.some(same);

  const apply = (r: R) =>
    start(async () => {
      await setRange(r.start, r.end);
      setPicking(false);
      setFrom(null);
    });

  return (
    <div className={`mb-5 ${pending ? "opacity-60" : ""}`}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {presets.map((p) => (
          <Chip key={p.label} active={same(p) && !picking} onClick={() => apply(p)}>
            {p.label}
          </Chip>
        ))}
        <Chip active={picking || isCustom} onClick={() => setPicking((v) => !v)}>
          Vælg dage…
        </Chip>
      </div>

      {picking && (
        <div className="card mt-3 p-3">
          <p className="mb-2 text-sm text-muted">{from ? "Tryk på den sidste dag" : "Tryk på den første dag"}</p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {range(today, 21).map((d) => {
              const dt = new Date(`${d}T12:00:00Z`);
              const inSel = from ? d === from : d >= current.start && d <= current.end;
              const tooFar = from ? d < from || d > addDays(from, 9) : false;
              return (
                <button
                  key={d}
                  disabled={tooFar}
                  onClick={() => (from ? apply({ start: from, end: d }) : setFrom(d))}
                  className={`rounded-lg py-1.5 text-sm disabled:opacity-25 ${inSel ? "bg-accent text-accent-ink" : "hover:bg-accent-soft"}`}
                >
                  <span className="block text-[10px] uppercase opacity-70">
                    {dt.toLocaleDateString("da-DK", { weekday: "short", timeZone: "UTC" }).slice(0, 3)}
                  </span>
                  {dt.getUTCDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted"}`}
    >
      {children}
    </button>
  );
}
