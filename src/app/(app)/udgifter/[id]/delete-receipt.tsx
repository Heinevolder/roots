"use client";

import { useTransition } from "react";
import { removeReceipt } from "../actions";

export function DeleteReceiptButton({ tripId }: { tripId: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="mt-6 w-full py-2 text-sm text-muted active:text-warm"
      disabled={pending}
      onClick={() => {
        if (confirm("Slet kvitteringen?")) start(() => removeReceipt(tripId));
      }}
    >
      Slet kvittering
    </button>
  );
}
