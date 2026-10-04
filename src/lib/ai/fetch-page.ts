import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 4 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; RootsRecipeBot/1.0; family recipe app)";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

/** Only public http(s) hosts: the URLs come from users and from the model. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Ugyldigt link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Linket skal starte med http(s).");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Linket peger ikke på en offentlig side.");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("Kunne ikke finde siden.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("Linket peger ikke på en offentlig side.");
  return url;
}

export async function safeFetch(raw: string, accept = "text/html,application/xhtml+xml"): Promise<{ url: string; res: Response }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "da,en;q=0.5" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    return { url: url.toString(), res };
  }
  throw new Error("For mange omdirigeringer.");
}

async function readLimited(res: Response): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export type JsonLdRecipe = {
  name?: string;
  image?: string;
  yield?: number;
  time?: number;
  ingredients: string[];
  instructions: string[];
  description?: string;
};

export type Page = { url: string; title?: string; image?: string; description?: string; recipe?: JsonLdRecipe; text: string };

export async function fetchPage(raw: string): Promise<Page> {
  const { url, res } = await safeFetch(raw);
  if (!res.ok) throw new Error(`Siden svarede ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new Error("Linket er ikke en webside.");
  const html = (await readLimited(res)).toString("utf8");
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1];
  const abs = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(decodeEntities(u), url).toString();
    } catch {
      return undefined;
    }
  };
  const recipe = findJsonLdRecipe(html);
  if (recipe?.image) recipe.image = abs(recipe.image);
  return {
    url,
    title: decodeEntities(meta("og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() || undefined,
    image: abs(meta("og:image")),
    description: meta("og:description") ? decodeEntities(meta("og:description")!) : undefined,
    recipe,
    text: htmlToText(html).slice(0, 60_000),
  };
}

export async function downloadImage(raw: string): Promise<{ data: Buffer; type: string } | null> {
  try {
    const { res } = await safeFetch(raw, "image/*");
    let type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type === "image/jpg" || type === "image/pjpeg") type = "image/jpeg"; // some CDNs (e.g. Arla) send image/jpg
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const data = await readLimited(res);
    return data.length ? { data, type } : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&aelig;/g, "æ").replace(/&AElig;/g, "Æ")
    .replace(/&oslash;/g, "ø").replace(/&Oslash;/g, "Ø")
    .replace(/&aring;/g, "å").replace(/&Aring;/g, "Å")
    .replace(/&amp;/g, "&");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function findJsonLdRecipe(html: string): JsonLdRecipe | undefined {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, body] of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue;
    }
    const r = findRecipeNode(data);
    if (r) return normalizeRecipe(r);
  }
  return undefined;
}

type Node = Record<string, unknown>;

function findRecipeNode(d: unknown): Node | undefined {
  if (Array.isArray(d)) {
    for (const x of d) {
      const r = findRecipeNode(x);
      if (r) return r;
    }
    return undefined;
  }
  if (!d || typeof d !== "object") return undefined;
  const n = d as Node;
  const t = n["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return n;
  if (n["@graph"]) return findRecipeNode(n["@graph"]);
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return decodeEntities(v).trim();
  if (typeof v === "number") return String(v);
  return undefined;
}

function isoMinutes(v: unknown): number | undefined {
  const m = str(v)?.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const min = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return min || undefined;
}

function normalizeRecipe(n: Node): JsonLdRecipe {
  const img = n.image;
  const image = str(img) ?? (Array.isArray(img) ? str(img[0]) ?? str((img[0] as Node)?.url) : str((img as Node)?.url));
  const y = Array.isArray(n.recipeYield) ? n.recipeYield[0] : n.recipeYield;
  const instructions: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") instructions.push(...decodeEntities(v).replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Node;
      if (o.itemListElement) walk(o.itemListElement);
      else walk(o.text ?? o.name);
    }
  };
  walk(n.recipeInstructions);
  return {
    name: str(n.name),
    image,
    yield: Number(str(y)?.match(/\d+/)?.[0]) || undefined,
    time: isoMinutes(n.totalTime) ?? isoMinutes(n.cookTime),
    ingredients: (Array.isArray(n.recipeIngredient) ? n.recipeIngredient : []).map(str).filter((s): s is string => !!s),
    instructions,
    description: str(n.description),
  };
}
