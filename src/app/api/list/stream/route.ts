import { connection } from "next/server";
import { events } from "@/lib/events";
import { currentRev } from "@/lib/list";

export async function GET(req: Request) {
  await connection();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      const onList = (rev: number) => send(`event: list\ndata: ${rev}\n\n`);
      const onMeta = () => send(`event: meta\ndata: 1\n\n`);
      events.on("list", onList);
      events.on("meta", onMeta);
      const ping = setInterval(() => send(`: ping\n\n`), 25_000);
      cleanup = () => {
        clearInterval(ping);
        events.off("list", onList);
        events.off("meta", onMeta);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send(`retry: 3000\nevent: list\ndata: ${currentRev()}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
