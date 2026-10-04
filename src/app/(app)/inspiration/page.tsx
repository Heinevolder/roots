import { connection } from "next/server";
import { deck, recentSaved } from "@/lib/inspiration";
import { Deck } from "./deck";

export const metadata = { title: "Inspiration · Roots" };

export default async function InspirationPage() {
  await connection();
  return <Deck initialCards={deck()} initialSaved={recentSaved()} aiReady={!!process.env.ANTHROPIC_API_KEY} />;
}
