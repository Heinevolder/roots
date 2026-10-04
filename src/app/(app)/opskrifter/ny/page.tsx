import { PageHeader } from "@/components/page-header";
import { NewRecipe } from "./new-recipe";

export const metadata = { title: "Ny opskrift · Roots" };

export default async function NewRecipePage({ searchParams }: PageProps<"/opskrifter/ny">) {
  const sp = await searchParams;
  const mode = sp.fra === "foto" ? "foto" : sp.fra === "manuel" ? "manuel" : sp.fra === "instagram" ? "insta" : "link";
  return (
    <>
      <PageHeader title="Ny opskrift" />
      <NewRecipe initialMode={mode} />
    </>
  );
}
