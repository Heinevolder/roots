"use client";

import Dexie, { type EntityTable } from "dexie";
import type { CatalogueIndex } from "../catalogue-core";
import type { WireItem } from "../list";

export type Row = WireItem;
export type Outbox = { seq?: number; id: string; row: Row };
export type Meta = { key: string; value: unknown };
export type StapleRow = { id: number; item: string; amount: number | null; unit: string | null };

export const ldb = new Dexie("roots") as Dexie & {
  rows: EntityTable<Row, "id">;
  outbox: EntityTable<Outbox, "seq">;
  meta: EntityTable<Meta, "key">;
};

ldb.version(1).stores({
  rows: "id, updatedAt",
  outbox: "++seq, id",
  meta: "key",
});

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await ldb.meta.get(key))?.value as T | undefined;
}
export const setMeta = (key: string, value: unknown) => ldb.meta.put({ key, value });

export type { CatalogueIndex };

/** crypto.randomUUID only exists on https/localhost; the app is also used over plain http on the home Wi-Fi. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
