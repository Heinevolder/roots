import "server-only";
import { EventEmitter } from "node:events";

const g = globalThis as unknown as { __rootsEvents?: EventEmitter };
export const events: EventEmitter = (g.__rootsEvents ??= new EventEmitter().setMaxListeners(100));

/** Tell every open SSE stream that the list changed up to `rev`. */
export function notifyList(rev: number) {
  events.emit("list", rev);
}

/** Staples or catalogue changed: clients should pull. */
export function notifyMeta() {
  events.emit("meta");
}
