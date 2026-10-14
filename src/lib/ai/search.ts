import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, AiError } from "./claude";

/** Finding links is simple work: the cheap, fast model does it, and every link is checked afterwards anyway. */
const SEARCH_MODEL = "claude-haiku-5-5";

export type Candidate = { title: string; url: string };

/** Each scope is searched by its own call, all at the same time. */
export type Scope = "dk" | "en" | "eu";

const SITES: Record<Scope, string> = {
  dk: "danske opskriftssider, fx valdemarsro.dk, arla.dk, madensverden.dk, dk-kogebogen.dk, mummum.dk, louiseogmadeleine.dk, spisbedre.dk, alt.dk/mad, dr.dk/mad, coop.dk/opskrifter, madbanditten.dk og lignende",
  en: "engelsksprogede opskriftssider, fx bbcgoodfood.com, recipetineats.com, seriouseats.com, bonappetit.com, jamieoliver.com, allrecipes.com, simplyrecipes.com, budgetbytes.com og lignende (undgå sider bag betalingsmur som NYT Cooking)",
  eu: "europæiske opskriftssider på andre sprog end dansk og engelsk, fx ica.se, koket.se, matprat.no, tine.no, giallozafferano.it, marmiton.org, chefkoch.de, lecker.de og lignende",
};

const SUGGEST_TOOL: Anthropic.Beta.BetaTool = {
  name: "suggest_recipes",
  description: "Aflever de fundne opskrifter. Kaldes én gang til sidst.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["recipes"],
    properties: {
      recipes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url"],
          properties: {
            title: { type: "string", description: "Rettens navn på dansk" },
            url: { type: "string", description: "Den præcise URL til opskriftssiden, som du har set i søgeresultaterne" },
          },
        },
      },
    },
  },
};

const system = (scope: Scope) => `Du hjælper en dansk familie på 4 (to voksne, to børn) med at finde inspiration til aftensmad.

Find rigtige opskrifter med web search på ${SITES[scope]}.

Regler:
- Foreslå kun opskrifter, du har set som et konkret søgeresultat, og brug den præcise URL fra resultatet. Opfind aldrig opskrifter eller URL'er.
- URL'en skal pege på én enkelt opskrift, ikke en oversigt, kategori eller artikel med mange opskrifter.
- Variér: højst 2 opskrifter fra samme side, og ikke to af samme slags ret. Bland protein, køkken og tilberedning.
- Undgå retter, familien allerede har.
- Aflever resultatet ved at kalde suggest_recipes én gang.`;

export async function searchRecipes(wish: string, opts: { scope: Scope; count: number; avoidTitles: string[]; avoidUrls: string[] }): Promise<Candidate[]> {
  const month = new Date().toLocaleDateString("da-DK", { month: "long", timeZone: "Europe/Copenhagen" });
  const user = [
    `Find ${opts.count} opskrifter.`,
    wish.trim() ? `Ønske: ${wish.trim()}` : `Ingen særlige ønsker. Gode hverdagsretter til aftensmad, gerne noget der passer til årstiden (det er ${month}).`,
    opts.avoidTitles.length ? `Familien har allerede: ${opts.avoidTitles.slice(0, 80).join("; ")}.` : "",
    opts.avoidUrls.length ? `Foreslå ikke disse URL'er igen:\n${opts.avoidUrls.slice(-150).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 4, ...(opts.scope === "dk" && { user_location: { type: "approximate" as const, country: "DK", timezone: "Europe/Copenhagen" } }) },
    SUGGEST_TOOL,
  ];

  for (let turn = 0; turn < 4; turn++) {
    const res = await claude().beta.messages.create({
      model: SEARCH_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system: system(opts.scope),
      tools,
      messages,
    });
    if (res.stop_reason === "refusal") throw new AiError("Claude ville ikke søge efter det. Prøv et andet ønske.");
    const call = res.content.find((b) => b.type === "tool_use" && b.name === "suggest_recipes");
    if (call && call.type === "tool_use") {
      const input = call.input as { recipes?: Candidate[] };
      return (input.recipes ?? []).filter((r) => r && typeof r.url === "string" && /^https?:\/\//.test(r.url));
    }
    if (res.stop_reason === "pause_turn") {
      // Server-side search loop paused; resend so it resumes.
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    // Ended without delivering: ask once for the hand-off.
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "Kald suggest_recipes med de opskrifter, du fandt." });
  }
  throw new AiError("Claude fandt ingen opskrifter. Prøv igen.");
}
