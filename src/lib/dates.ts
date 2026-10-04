// Dates are local "YYYY-MM-DD" strings (Europe/Copenhagen on server and phones).

export const TZ = "Europe/Copenhagen";

export function today(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

export function range(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

export function dayLabel(date: string): { weekday: string; short: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.toLocaleDateString("da-DK", { weekday: "long", timeZone: "UTC" });
  const short = d.toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
  return { weekday: weekday[0].toUpperCase() + weekday.slice(1), short };
}

/** "søn 4. – tir 6. okt", or "4. okt" for a single day. */
export function rangeLabel(start: string, end: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("da-DK", { timeZone: "UTC", ...opts });
  const wd = (d: string) => fmt(d, { weekday: "short" }).replace(".", "");
  if (start === end) return `${wd(start)} ${fmt(start, { day: "numeric", month: "short" })}`;
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${wd(start)} ${fmt(start, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${wd(end)} ${fmt(end, { day: "numeric", month: "short" })}`;
}
