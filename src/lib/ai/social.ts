import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, AiError, FALLBACK, MODEL } from "./claude";
import { safeFetch, fetchPage } from "./fetch-page";
import { RECIPE_SCHEMA, systemPrompt, toDraft, extractFromPage, type Draft, type Out, type Photo } from "./extract";

export type Post = { url?: string; caption?: string; image?: string; author?: string };

/**
 * Best effort: read the public preview of a social post (caption in og:description).
 * Instagram often answers with a login wall instead; then we just get nothing.
 */
export async function readPostPreview(raw: string): Promise<Post> {
  const post: Post = { url: raw };
  try {
    const { res } = await safeFetch(raw);
    if (!res.ok) return post;
    const html = (await res.text()).slice(0, 2_000_000);
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1];
    const desc = decode(meta("og:description") ?? meta("description") ?? "");
    const title = decode(meta("og:title") ?? "");
    // Skip Instagram's generic login-wall blurbs.
    if (desc.length > 80 && !/log (in|ind)|sign up|create an account|opret en konto/i.test(desc.slice(0, 120))) post.caption = desc;
    if (title && title !== "Instagram") post.author = title.split(/ on Instagram| på Instagram|:/)[0].trim();
    post.image = meta("og:image") ? decode(meta("og:image")!) : undefined;
  } catch {}
  return post;
}

function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "DK", timezone: "Europe/Copenhagen" } },
  {
    name: "recipe_from_post",
    description: "Brug når opslaget selv (tekst eller billeder) indeholder ingredienser med mængder. Udfyld opskriften derfra.",
    strict: true,
    input_schema: RECIPE_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
  },
  {
    name: "recipe_page",
    description: "Brug når opskriften ikke står i opslaget, men du har fundet skaberens egen opskriftsside (fx deres blog) med web search.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["url"],
      properties: { url: { type: "string", description: "Præcis URL fra søgeresultaterne til netop denne opskrift" } },
    },
  },
  {
    name: "no_recipe",
    description: "Brug når der hverken er en opskrift i opslaget eller en side, du kan finde.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["reason"],
      properties: { reason: { type: "string", description: "Kort forklaring på dansk til brugeren" } },
    },
  },
];

const SOCIAL_RULES = `

Du får et opslag fra sociale medier (typisk et Instagram-reel): link, billedtekst og/eller skærmbilleder.
- Står ingredienserne i teksten eller på skærmbillederne, så kald recipe_from_post. Følg reglerne ovenfor. Du må gerne samle oplysninger fra både tekst og billeder.
- Står der kun "link i bio", "opskrift på bloggen", "kommentér X" eller lignende, så brug web_search til at finde skaberens egen opskriftsside for netop denne ret, og kald recipe_page med den præcise URL.
- Opfind aldrig en opskrift ud fra billeder af maden alene. Findes opskriften ikke, så kald no_recipe.
- Kald præcis ét af de tre værktøjer til sidst.`;

/** Reel/post -> draft. Falls back to the creator's real recipe page when the post only links to it. */
export async function extractFromPost(post: Post, photos: Photo[]): Promise<Draft> {
  if (!post.caption && !photos.length) {
    throw new AiError("Instagram viste ikke opslaget. Indsæt billedteksten eller tag skærmbilleder af opskriften i reelet.");
  }
  const text = [
    post.url ? `Link: ${post.url}` : "",
    post.author ? `Skaber: ${post.author}` : "",
    post.caption ? `Billedtekst:\n${post.caption}` : "Ingen billedtekst.",
    photos.length ? `${photos.length} skærmbillede(r) vedlagt.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.type, data: p.data.toString("base64") } })),
        { type: "text", text },
      ],
    },
  ];

  for (let turn = 0; turn < 5; turn++) {
    const res = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: systemPrompt() + SOCIAL_RULES, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") throw new AiError("Claude ville ikke behandle dette opslag.");
    const call = res.content.find((b) => b.type === "tool_use");
    if (call && call.type === "tool_use") {
      if (call.name === "recipe_from_post") {
        const out = call.input as Out;
        if (!out.ingredients?.length) throw new AiError("Der stod ingen ingredienser i opslaget.");
        return toDraft(out, { source: post.url, imageUrl: post.image });
      }
      if (call.name === "recipe_page") {
        const url = String((call.input as { url?: string }).url ?? "");
        // Always read the real page ourselves; the model only points at it.
        const draft = await extractFromPage(await fetchPage(url));
        return draft;
      }
      if (call.name === "no_recipe") throw new AiError(String((call.input as { reason?: string }).reason ?? "Der blev ikke fundet en opskrift."));
    }
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Afslut ved at kalde recipe_from_post, recipe_page eller no_recipe." });
  }
  throw new AiError("Kunne ikke læse opslaget. Prøv med skærmbilleder.");
}
