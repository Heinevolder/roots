import "server-only";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ITEMS_FILE } from "./paths";
import { buildIndex, type Catalogue, type CatalogueIndex } from "./catalogue-core";

type RawItem = string | Record<string, string[] | null>;
type Raw = { pantry?: string[]; categories?: { name: string; items?: RawItem[] }[] };

const g = globalThis as unknown as { __rootsCatalogue?: { mtime: number; cat: Catalogue; idx: CatalogueIndex } };

function parse(text: string): Catalogue {
  const raw = (YAML.parse(text) ?? {}) as Raw;
  return {
    pantry: (raw.pantry ?? []).map(String),
    categories: (raw.categories ?? []).map((c) => ({
      name: c.name,
      items: (c.items ?? []).map((it) => {
        if (typeof it === "string") return { name: it, aliases: [] };
        const [name, aliases] = Object.entries(it)[0];
        return { name, aliases: aliases ?? [] };
      }),
    })),
  };
}

function seedIfMissing() {
  if (fs.existsSync(ITEMS_FILE)) return;
  const seed = path.join(process.cwd(), "seed", "items.yaml");
  if (!fs.existsSync(seed)) return;
  fs.mkdirSync(path.dirname(ITEMS_FILE), { recursive: true });
  fs.copyFileSync(seed, ITEMS_FILE);
}

function load() {
  seedIfMissing();
  let mtime = 0;
  try {
    mtime = fs.statSync(ITEMS_FILE).mtimeMs;
  } catch {
    return { mtime: 0, cat: { categories: [], pantry: [] }, idx: buildIndex({ categories: [], pantry: [] }) };
  }
  if (g.__rootsCatalogue?.mtime === mtime) return g.__rootsCatalogue;
  const cat = parse(fs.readFileSync(ITEMS_FILE, "utf8"));
  g.__rootsCatalogue = { mtime, cat, idx: buildIndex(cat) };
  return g.__rootsCatalogue;
}

export function getCatalogue(): Catalogue {
  return load().cat;
}

export function getCatalogueIndex(): CatalogueIndex {
  return load().idx;
}

export function saveCatalogue(cat: Catalogue) {
  const doc = {
    pantry: cat.pantry,
    categories: cat.categories.map((c) => ({
      name: c.name,
      items: c.items.map((it) => (it.aliases.length ? { [it.name]: it.aliases } : it.name)),
    })),
  };
  const header =
    "# Varekatalog: kategorier i den rækkefølge du går gennem butikken.\n" +
    '# Et punkt er enten et navn eller "navn: [alias, alias]".\n' +
    "# pantry = har I altid derhjemme: står i opskrifterne, men kommer aldrig på indkøbslisten.\n";
  fs.writeFileSync(ITEMS_FILE, header + YAML.stringify(doc, { flowCollectionPadding: false }));
}
