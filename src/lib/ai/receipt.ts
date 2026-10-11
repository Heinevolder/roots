import "server-only";
import { claude, AiError, FALLBACK, MODEL } from "./claude";
import type { Photo } from "./extract";

export type ReadLine = { text: string; price: number; item: string; category: string; sure: boolean };
export type ReadReceipt = { store: string | null; date: string | null; total: number | null; lines: ReadLine[] };

function schema(categories: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["is_receipt", "store", "date", "total", "lines"],
    properties: {
      is_receipt: { type: "boolean", description: "false if the photo is not a shopping receipt" },
      store: { type: ["string", "null"], description: 'Butikkens navn, fx "Føtex" eller "Bilka"' },
      date: { type: ["string", "null"], description: "Købsdato som YYYY-MM-DD" },
      total: { type: ["number", "null"], description: "Det betalte beløb i kr" },
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "price", "item", "category", "sure"],
          properties: {
            text: { type: "string", description: "Varelinjen præcis som den står på kvitteringen" },
            price: { type: "number", description: "Kr betalt for linjen, efter rabat og inkl. pant" },
            item: { type: "string" },
            category: { type: "string", enum: categories },
            sure: { type: "boolean", description: "false hvis du er i tvivl om, hvilken vare det er" },
          },
        },
      },
    },
  } as const;
}

type Out = ReadReceipt & { is_receipt: boolean };

/**
 * Receipt photo(s) -> lines. `bought` are the items ticked off on this trip: a line that is one of them
 * gets exactly that name, so it can be matched to the list.
 */
export async function readReceipt(photos: Photo[], bought: string[], categories: string[], catalogue: string[]): Promise<ReadReceipt> {
  const system = `Du læser kvitteringer fra supermarkeder for en dansk families madplan-app.

Regler:
- Én linje per vare. Rabat-, tilbuds- og pantlinjer lægges sammen med den vare, de hører til, så price er det, varen reelt kostede. Står der "2 x 12,95", er price 25,90.
- Rabat, der ikke hører til en bestemt vare (fx medlemsrabat på hele bonen), bliver sin egen linje med negativ price og category "Andet".
- Tag ikke subtotal, total, moms, betaling, byttepenge eller kortoplysninger med som linjer.
- item er et kort dansk varenavn med små bogstaver, som man ville skrive det på en indkøbsseddel: "gulerødder", "mælk", "toiletpapir". Ingen mærker, vægt eller "øko".
- Er varen en af de købte varer nedenfor, så brug præcis det navn. Ellers brug et navn fra varekataloget, hvis det passer, og ellers dit eget korte navn.
- category er afdelingen. Non-food får en non-food-kategori: rengøring, papir, poser og køkkenting "Husholdning"; hygiejne, kosmetik og medicin "Personlig pleje"; bleer og vådservietter "Baby"; dyrefoder "Kæledyr"; tøj, blomster, legetøj, elektronik, bøger og alt andet ikke-mad "Bolig & fritid". "Andet" bruges kun til rabat på hele bonen.
- sure = false, hvis linjen er svær at læse, eller du ikke er sikker på, hvilken vare det er.
- Er billedet ikke en kvittering, så sæt is_receipt = false.

Købte varer på denne tur: ${bought.length ? bought.join(", ") : "(ukendt)"}

Varekatalog: ${catalogue.join(", ")}`;

  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: { type: "json_schema", schema: schema(categories) } },
    system,
    messages: [
      {
        role: "user",
        content: [
          ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.type, data: p.data.toString("base64") } })),
          { type: "text", text: "Læs kvitteringen. Er den taget i flere billeder, så er det én kvittering i rækkefølge." },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new AiError("Claude ville ikke læse denne kvittering.");
  if (res.stop_reason === "max_tokens") throw new AiError("Kvitteringen var for lang til at blive læst.");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new AiError("Claude svarede ikke med en kvittering.");
  const out = JSON.parse(text.text) as Out;
  if (!out.is_receipt || !out.lines.length) throw new AiError("Der blev ikke fundet en kvittering på billedet.");
  const date = out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null;
  return { store: out.store?.trim() || null, date, total: out.total, lines: out.lines };
}
