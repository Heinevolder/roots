import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

const g = globalThis as unknown as { __rootsAnthropic?: Anthropic };

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError("ANTHROPIC_API_KEY mangler på serveren.");
  return (g.__rootsAnthropic ??= new Anthropic());
}

/** Errors with a message that is fine to show in the UI. */
export class AiError extends Error {}

/** Server-side fallback on refusals (routes by category; no model list to maintain). */
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export function friendlyError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "Claude afviste API-nøglen. Tjek ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "Claude har travlt lige nu. Prøv igen om lidt.";
  if (e instanceof Anthropic.APIError) return `Claude-fejl (${e.status ?? "ukendt"}). Prøv igen.`;
  if (e instanceof Error && /fetch failed|timeout|aborted/i.test(e.message)) return "Kunne ikke hente siden. Prøv igen.";
  if (e instanceof Error) return e.message;
  return "Noget gik galt.";
}
