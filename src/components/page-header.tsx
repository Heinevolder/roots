export function PageHeader({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  );
}
