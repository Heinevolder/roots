// Ingredient parsing/formatting, shared by server and client.

export type Ingredient = { item: string; amount?: number | null; unit?: string | null };

export const UNITS = ["g", "kg", "ml", "cl", "dl", "l", "stk", "spsk", "tsk", "knsp", "fed", "bundt", "dåse", "pk", "ds"];

const UNIT_RE = new RegExp(`^(${UNITS.join("|")})\\.?\\s+`, "i");

/** "600 g kyllingebryst", "1 løg", "salt" -> Ingredient */
export function parseIngredientLine(line: string): Ingredient | null {
  let s = line.trim().replace(/^[-*•]\s*/, "");
  if (!s) return null;
  let amount: number | null = null;
  const m = s.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼|¾)\s*/);
  if (m) {
    amount = parseAmount(m[1]);
    s = s.slice(m[0].length);
  }
  let unit: string | null = null;
  const u = s.match(UNIT_RE);
  if (u) {
    unit = u[1].toLowerCase();
    s = s.slice(u[0].length);
  }
  const item = s.trim().toLowerCase();
  if (!item) return null;
  // "2 løg" means pieces; keeps it mergeable with "1 stk løg".
  if (amount != null && !unit) unit = "stk";
  return { item, amount, unit };
}

function parseAmount(a: string): number {
  if (a === "½") return 0.5;
  if (a === "¼") return 0.25;
  if (a === "¾") return 0.75;
  if (a.includes("/")) {
    const [n, d] = a.split("/").map(Number);
    return n / d;
  }
  return Number(a.replace(",", "."));
}

export function formatAmount(n: number | null | undefined): string {
  if (n == null) return "";
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

export function formatIngredient(i: Ingredient): string {
  return [formatAmount(i.amount), i.unit ?? "", i.item].filter(Boolean).join(" ");
}

/** Round scaled amounts to something you can buy/measure. */
export function niceAmount(n: number, unit: string | null | undefined): number {
  if (unit === "g" || unit === "ml") return n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
  if (unit === "stk" || unit === "dåse" || unit === "pk" || unit === "ds" || unit === "fed" || unit === "bundt") return Math.ceil(n - 1e-9);
  if (!unit) return Math.ceil(n * 2 - 1e-9) / 2;
  return Math.round(n * 100) / 100;
}
