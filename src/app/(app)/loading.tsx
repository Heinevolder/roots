// Shown instantly on tab switches while the server renders the page.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Indlæser" className="animate-pulse">
      <div className="mb-5">
        <div className="h-8 w-40 rounded-lg bg-line/70" />
        <div className="mt-2 h-4 w-28 rounded bg-line/50" />
      </div>
      <div className="mb-5 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-line/50" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
    </div>
  );
}
