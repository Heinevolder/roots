export function Steps({ body }: { body: string }) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <ol className="space-y-3">
      {lines.map((l, i) => {
        const m = l.match(/^(\d+)[.)]\s*(.*)$/);
        return (
          <li key={i} className="flex gap-3">
            {m ? (
              <>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{m[1]}</span>
                <p className="pt-0.5 leading-relaxed">{m[2]}</p>
              </>
            ) : (
              <p className="leading-relaxed">{l.replace(/^[-*]\s*/, "")}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
