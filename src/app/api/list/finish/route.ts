import { finishShopping } from "@/lib/list";

export async function POST() {
  finishShopping();
  return Response.json({ ok: true });
}
