import { deck, refillDeck } from "@/lib/inspiration";
import { friendlyError } from "@/lib/ai/claude";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wish?: string };
  const wish = String(body.wish ?? "").slice(0, 300);
  try {
    const added = await refillDeck(wish);
    return Response.json({ added, cards: deck() });
  } catch (e) {
    console.error("inspiration search", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
