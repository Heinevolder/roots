import { connection } from "next/server";
import { applyClientRows, listStaples, pullSince, type WireItem } from "@/lib/list";
import { getCatalogueIndex } from "@/lib/catalogue";
import { listRecipes } from "@/lib/recipes";
import { getPlanRange } from "@/lib/plan-range";

export async function GET(req: Request) {
  await connection();
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;
  const { rows, rev } = pullSince(since);
  return Response.json(
    {
      rows,
      rev,
      catalogue: getCatalogueIndex(),
      staples: listStaples(),
      range: getPlanRange(),
      recipes: Object.fromEntries(listRecipes().map((r) => [r.slug, r.title])),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { rows?: WireItem[] } | null;
  if (!body || !Array.isArray(body.rows)) return Response.json({ error: "Ugyldig forespørgsel" }, { status: 400 });
  const applied = applyClientRows(body.rows.slice(0, 500));
  return Response.json({ applied });
}
