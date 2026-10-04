import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, AiError, FALLBACK, MODEL } from "./claude";

export type Candidate = { title: string; url: string; pitch: string };

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
          required: ["title", "url", "pitch"],
          properties: {
            title: { type: "string" },
            url: { type: "string", description: "Den præcise URL til opskriftssiden, som du har set i søgeresultaterne" },
            pitch: { type: "string", description: "Én kort, appetitlig sætning på dansk om retten" },
          },
        },
      },
    },
  },
};

const SYSTEM = `Du hjælper en dansk familie på 4 (to voksne, to børn) med at finde inspiration til aftensmad.

Find rigtige opskrifter på danske opskriftssider med web search, fx valdemarsro.dk, arla.dk, madensverden.dk, dk-kogebogen.dk, mummum.dk, louiseogmadeleine.dk, spisbedre.dk, alt.dk/mad, dr.dk/mad, coop.dk/opskrifter, madbanditten.dk og lignende.

Regler:
- Foreslå kun opskrifter, du har set som et konkret søgeresultat, og brug den præcise URL fra resultatet. Opfind aldrig opskrifter eller URL'er, og skriv ikke selv opskrifter.
- URL'en skal pege på én enkelt opskrift, ikke en oversigt, kategori eller artikel med mange opskrifter.
- Variér: højst 2 opskrifter fra samme side, og ikke to af samme slags ret (fx to tacoretter). Bland protein, køkken og tilberedning.
- Undgå retter, familien allerede har.
- Aflever resultatet ved at kalde suggest_recipes én gang.`;

export async function searchRecipes(wish: string, opts: { count: number; avoidTitles: string[]; avoidUrls: string[] }): Promise<Candidate[]> {
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
    { type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "DK", timezone: "Europe/Copenhagen" } },
    SUGGEST_TOOL,
  ];

  for (let turn = 0; turn < 5; turn++) {
    const res = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "medium" },
      system: SYSTEM,
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
