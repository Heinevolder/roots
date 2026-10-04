"use client";

import { useTransition } from "react";
import { deleteRecipeAction } from "../actions";

export function DeleteRecipeButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost text-warm"
      disabled={pending}
      onClick={() => {
        if (confirm("Slet opskriften?")) start(() => deleteRecipeAction(slug));
      }}
    >
      Slet
    </button>
  );
}
