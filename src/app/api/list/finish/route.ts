import { finishShopping } from "@/lib/list";

export async function POST() {
  const tripId = finishShopping();
  return Response.json({ ok: true, tripId });
}
