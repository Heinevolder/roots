"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downsize } from "@/lib/client/image";

/** Photo(s) of a receipt -> /api/receipts -> the trip's page. Long receipts can be taken in up to 3 photos. */
export function ReceiptUpload({ tripId, label = "Tilføj kvittering" }: { tripId?: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      // Receipts are long and the print is small, so keep more pixels than for recipes.
      for (const f of files.slice(0, 3)) form.append("photos", await downsize(f, 2400));
      if (tripId) form.append("tripId", String(tripId));
      const res = await fetch("/api/receipts", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: `Uventet svar fra serveren (${res.status}).` }));
      if (!res.ok || !data.tripId) throw new Error(data.error ?? "Noget gik galt.");
      router.push(`/udgifter/${data.tripId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen forbindelse til serveren.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <label className={`btn-primary w-full cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {busy ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Læser kvitteringen…
          </>
        ) : (
          label
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-1.5 text-center text-xs text-muted">Tag et billede af kvitteringen. Er den lang, så tag op til 3 billeder.</p>
      {error && <p className="mt-2 text-center text-sm text-warm">{error}</p>}
    </div>
  );
}
