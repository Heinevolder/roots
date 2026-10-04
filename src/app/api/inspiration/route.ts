import { connection } from "next/server";
import { deck, recentSaved } from "@/lib/inspiration";

export async function GET() {
  await connection();
  return Response.json({ cards: deck(), saved: recentSaved() }, { headers: { "Cache-Control": "no-store" } });
}
