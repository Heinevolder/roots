import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, AiError, FALLBACK, MODEL } from "./claude";
import type { Page } from "./fetch-page";
import { getCatalogue } from "../catalogue";
import { UNITS, type Ingredient } from "../ingredients";
import { normalizeName } from "../catalogue-core";

export type Draft = {
  title: string;
  servings: number;
  time?: number;
  tags: string[];
  source?: string;
  imageUrl?: string;
  ingredients: Ingredient[];
  body: string;
};

const TAGS = ["hverdag", "weekend", "hurtig", "børnevenlig", "vegetar", "fisk", "kylling", "okse", "svin", "lam", "pasta", "suppe", "salat", "ovnret", "gryderet", "bagværk", "dessert"];

export const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_recipe", "title", "servings", "time_minutes", "tags", "ingredients", "steps"],
  properties: {
    is_recipe: { type: "boolean", description: "false if the input does not contain a recipe" },
    title: { type: "string" },
    servings: { type: "integer", description: "Number of servings the amounts are for" },
    time_minutes: { type: ["integer", "null"] },
    tags: { type: "array", items: { type: "string", enum: TAGS } },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "amount", "unit"],
        properties: {
          item: { type: "string" },
          amount: { type: ["number", "null"] },
          unit: { anyOf: [{ type: "string", enum: UNITS }, { type: "null" }] },
        },
      },
    },
    steps: { type: "array", items: { type: "string" } },
  },
} as const;

export type Out = {
  is_recipe: boolean;
  title: string;
  servings: number;
  time_minutes: number | null;
  tags: string[];
  ingredients: { item: string; amount: number | null; unit: string | null }[];
  steps: string[];
};

export function systemPrompt(): string {
  const names = getCatalogue()
    .categories.flatMap((c) => c.items.map((i) => i.name))
    .join(", ");
  return `Du omdanner opskrifter til et struktureret format for en dansk families madplan-app.

Regler:
- ingredients er det, der står i kildens ingrediensliste, inklusive under-afsnit som "Til pynt", "For garnish" eller "Til servering". Ting, der kun nævnes i fremgangsmåden og ikke står i nogen ingrediensliste, tilføjes ikke. Kun hvis kilden slet ikke har en ingrediensliste, tager du ingredienserne fra teksten.
- Gengiv opskriften, der står i kilden. Find ikke på ingredienser, mængder eller trin, der ikke står der. Mangler noget, så lad det være null.
- Skriv på dansk. Oversæt hvis kilden er på et andet sprog.
- Ingrediensnavne skal være korte varenavne som i et supermarked, med små bogstaver og uden tilberedning: "hvidløg" (ikke "2 fed hvidløg, finthakket"), "løg" (ikke "gule løg, i tern"). Tilberedning hører til i trinene.
- Brug helst et navn fra varekataloget nedenfor, når det er den samme vare. Ingen parenteser eller "fx" i navnet: står der et valg, så tag det første.
- Bruges saft eller skal af frugt (citron, lime, appelsin), så angiv antal frugter der skal købes, fx 1 stk citron.
- title er rettens navn uden reklame eller undertitler som "- den klassiske opskrift" eller "| Arla".
- Enheder: brug kun ${UNITS.join(", ")}. Omregn cups, oz, lb osv. til metrisk. Stykvarer får enheden "stk". Salt, peber og lignende uden mængde får amount og unit = null.
- Almindelig olie hedder "olivenolie" eller "rapsolie". Særlige olier (sesamolie, chiliolie, trøffelolie, valnøddeolie, kokosolie osv.) beholder deres eget navn.
- Vand fra hanen er ikke en ingrediens (det står i trinene i stedet).
- Kombinerede linjer ("salt og peber") deles i to ingredienser.
- servings er det antal personer mængderne passer til. Er det ikke angivet, så skøn ud fra mængderne (typisk 4).
- steps: ét trin per element, i kildens rækkefølge og ordlyd (oversat hvis nødvendigt), uden nummerering.
- tags: 1-3 relevante fra listen.
- Er der ingen opskrift i input, så sæt is_recipe = false.

Varekatalog: ${names}`;
}

async function run(content: Anthropic.Beta.BetaContentBlockParam[]): Promise<Out> {
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low", format: { type: "json_schema", schema: RECIPE_SCHEMA } },
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new AiError("Claude ville ikke behandle denne opskrift.");
  if (res.stop_reason === "max_tokens") throw new AiError("Opskriften var for lang til at blive læst.");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new AiError("Claude svarede ikke med en opskrift.");
  const out = JSON.parse(text.text) as Out;
  if (!out.is_recipe || !out.ingredients.length) throw new NoRecipeError();
  return out;
}

/** The input was read fine but held no recipe. */
export class NoRecipeError extends AiError {
  constructor(message = "Der blev ikke fundet en opskrift.") {
    super(message);
  }
}

export function toDraft(out: Out, extra: Partial<Draft>): Draft {
  return {
    title: out.title.trim(),
    servings: Math.max(1, out.servings || 4),
    time: out.time_minutes ?? undefined,
    tags: out.tags,
    ingredients: out.ingredients
      .map((i) => ({ item: normalizeName(i.item), amount: i.amount, unit: i.unit ?? (i.amount != null ? "stk" : null) }))
      .filter((i) => i.item),
    body: out.steps.map((s, n) => `${n + 1}. ${s.trim()}`).join("\n"),
    ...extra,
  };
}

/** Page -> draft. Structured JSON-LD is the most reliable input when the site has it. */
export async function extractFromPage(page: Page): Promise<Draft> {
  const r = page.recipe;
  const input = r?.ingredients.length
    ? [
        `Titel: ${r.name ?? page.title ?? ""}`,
        r.yield ? `Portioner: ${r.yield}` : "",
        r.time ? `Tid: ${r.time} min` : "",
        r.description ? `Beskrivelse: ${r.description}` : "",
        `Ingredienser:\n${r.ingredients.join("\n")}`,
        `Fremgangsmåde:\n${r.instructions.join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : `Titel: ${page.title ?? ""}\n\nSidens tekst:\n${page.text}`;
  const out = await run([{ type: "text", text: `Kilde: ${page.url}\n\n${input}` }]);
  return toDraft(out, { source: page.url, imageUrl: r?.image ?? page.image, time: out.time_minutes ?? r?.time });
}

export type Photo = { data: Buffer; type: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

/** Cookbook photo(s) -> draft. */
export async function extractFromPhotos(photos: Photo[]): Promise<Draft> {
  const out = await run([
    ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.type, data: p.data.toString("base64") } })),
    { type: "text", text: "Læs opskriften på billedet/billederne (det kan være en kogebogsside, et opslag over to sider, eller en håndskrevet seddel)." },
  ]);
  return toDraft(out, {});
}

const FETCH_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
  {
    name: "recipe",
    description: "Opskriften fra siden.",
    strict: true,
    input_schema: RECIPE_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
  },
  {
    name: "no_recipe",
    description: "Brug når siden ikke indeholder en opskrift eller ikke kunne hentes.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["reason"],
      properties: { reason: { type: "string", description: "Kort forklaring på dansk til brugeren" } },
    },
  },
];

/**
 * Fallback when our own reader finds no recipe (e.g. Wix and other script-heavy sites, or bot walls):
 * let Claude fetch the page with its own web_fetch tool.
 */
export async function extractViaWebFetch(url: string, imageUrl?: string): Promise<Draft> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Hent ${url} med web_fetch og kald recipe med opskriften fra siden. Er der ingen opskrift, så kald no_recipe.` },
  ];
  for (let turn = 0; turn < 4; turn++) {
    const res = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "low" },
      system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
      tools: FETCH_TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") throw new AiError("Claude ville ikke behandle denne opskrift.");
    const call = res.content.find((b) => b.type === "tool_use");
    if (call && call.type === "tool_use") {
      if (call.name === "no_recipe") throw new NoRecipeError(String((call.input as { reason?: string }).reason || "Der blev ikke fundet en opskrift."));
      const out = call.input as Out;
      if (!out.is_recipe || !out.ingredients?.length) throw new NoRecipeError();
      return toDraft(out, { source: url, imageUrl });
    }
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Afslut ved at kalde recipe eller no_recipe." });
  }
  throw new NoRecipeError();
}
