import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { IMAGES_DIR } from "../paths";
import { downloadImage } from "./fetch-page";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export function storeImage(data: Buffer, type: string, prefix: string): string {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const name = `${prefix.slice(0, 60) || "billede"}-${randomUUID().slice(0, 8)}.${EXT[type] ?? "jpg"}`;
  fs.writeFileSync(path.join(IMAGES_DIR, name), data);
  return name;
}

export async function storeRemoteImage(url: string | undefined, prefix: string): Promise<string | undefined> {
  if (!url) return undefined;
  const img = await downloadImage(url);
  return img ? storeImage(img.data, img.type, prefix) : undefined;
}

/** A stored image name from a form field, if it really exists. */
export function existingImage(name: unknown): string | undefined {
  if (typeof name !== "string" || !name) return undefined;
  const safe = path.basename(name);
  return fs.existsSync(path.join(IMAGES_DIR, safe)) ? safe : undefined;
}
