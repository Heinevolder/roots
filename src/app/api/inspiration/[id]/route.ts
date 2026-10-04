import { revalidatePath } from "next/cache";
import { retry, save, skip } from "@/lib/inspiration";
import { friendlyError } from "@/lib/ai/claude";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/inspiration/[id]">) {
  const id = Number((await ctx.params).id);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (!Number.isInteger(id)) return Response.json({ error: "Ugyldigt id" }, { status: 400 });
  try {
    if (action === "skip") {
      skip(id);
      return Response.json({ ok: true });
    }
    if (action === "retry") {
      retry(id);
      return Response.json({ ok: true });
    }
    if (action === "save") {
      const slug = await save(id);
      revalidatePath("/", "layout");
      return Response.json({ slug });
    }
    return Response.json({ error: "Ukendt handling" }, { status: 400 });
  } catch (e) {
    console.error("inspiration save", e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
