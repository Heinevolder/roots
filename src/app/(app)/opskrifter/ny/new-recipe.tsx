"use client";

import { useState } from "react";
import { RecipeForm } from "../recipe-form";
import type { Ingredient } from "@/lib/ingredients";

type Mode = "link" | "foto" | "insta" | "manuel";

const SOCIAL = /(^|\.)(instagram\.com|instagr\.am|tiktok\.com|facebook\.com|fb\.watch)$/i;
const isSocial = (u: string) => {
  try {
    return SOCIAL.test(new URL(u).hostname);
  } catch {
    return false;
  }
};
type Draft = {
  title: string;
  servings: number;
  time?: number;
  tags: string[];
  source?: string;
  image?: string;
  ingredients: Ingredient[];
  body: string;
};

export function NewRecipe({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [socialUrl, setSocialUrl] = useState("");

  if (draft)
    return (
      <>
        <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Claude har læst opskriften. Tjek den igennem, og ret det der ikke passer, før du gemmer.
        </div>
        <RecipeForm initial={draft} />
        <button onClick={() => setDraft(null)} className="mt-3 w-full py-2 text-sm text-muted">Start forfra</button>
      </>
    );

  return (
    <>
      <div className="mb-5 flex rounded-xl border border-line bg-surface p-0.5 text-sm">
        {(["link", "foto", "insta", "manuel"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg px-2 py-1.5 ${mode === m ? "bg-accent text-accent-ink" : "text-muted"}`}>
            {m === "link" ? "Link" : m === "foto" ? "Foto" : m === "insta" ? "Instagram" : "Selv"}
          </button>
        ))}
      </div>
      {mode === "link" && (
        <FromLink
          onDraft={setDraft}
          onSocial={(u) => {
            setSocialUrl(u);
            setMode("insta");
          }}
        />
      )}
      {mode === "insta" && <FromSocial onDraft={setDraft} initialUrl={socialUrl} />}
      {mode === "foto" && <FromPhoto onDraft={setDraft} />}
      {mode === "manuel" && <RecipeForm />}
    </>
  );
}

function useImport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(req: () => Promise<Response>, onDraft: (d: Draft) => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await req();
      const data = await res.json().catch(() => ({ error: "Uventet svar fra serveren." }));
      if (!res.ok || !data.draft) throw new Error(data.error ?? "Noget gik galt.");
      onDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Ingen forbindelse til serveren.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function FromLink({ onDraft, onSocial }: { onDraft: (d: Draft) => void; onSocial: (url: string) => void }) {
  const { busy, error, run } = useImport();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const url = String(new FormData(e.currentTarget).get("url") ?? "").trim();
        if (isSocial(url)) return onSocial(url);
        void run(() => fetch("/api/recipes/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }), onDraft);
      }}
    >
      <label className="label" htmlFor="url">Link til opskriften</label>
      <input id="url" name="url" type="url" inputMode="url" required placeholder="https://www.valdemarsro.dk/…" className="field" />
      <p className="text-xs text-muted">Virker med de fleste opskriftssider. Claude læser siden og laver opskriften om til jeres format.</p>
      {error && <p className="text-sm text-warm">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Working text="Læser opskriften…" /> : "Hent opskrift"}
      </button>
    </form>
  );
}

function FromPhoto({ onDraft }: { onDraft: (d: Draft) => void }) {
  const { busy, error, run } = useImport();
  const [files, setFiles] = useState<File[]>([]);
  const [keep, setKeep] = useState(false);
  const previews = files.map((f) => URL.createObjectURL(f));

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-surface px-4 py-8 text-center">
        <span className="font-medium">{files.length ? "Vælg andre billeder" : "Tag et billede af opskriften"}</span>
        <span className="text-sm text-muted">Kogebog, blad eller håndskrevet seddel. Op til 4 billeder.</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 4))}
        />
      </label>
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Brug det første billede som opskriftens foto
      </label>
      {error && <p className="text-sm text-warm">{error}</p>}
      <button
        className="btn-primary w-full"
        disabled={busy || !files.length}
        onClick={() =>
          run(async () => {
            const form = new FormData();
            for (const f of files) form.append("photos", await downsize(f));
            if (keep) form.append("keepPhoto", "1");
            return fetch("/api/recipes/import-photo", { method: "POST", body: form });
          }, onDraft)
        }
      >
        {busy ? <Working text="Læser billedet…" /> : "Læs opskriften"}
      </button>
    </div>
  );
}

function FromSocial({ onDraft, initialUrl }: { onDraft: (d: Draft) => void; initialUrl: string }) {
  const { busy, error, run } = useImport();
  const [url, setUrl] = useState(initialUrl);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [keep, setKeep] = useState(false);
  const previews = files.map((f) => URL.createObjectURL(f));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        Instagram viser sjældent opslag til andre end indloggede, så giv gerne billedteksten eller skærmbilleder med. Står der kun &quot;opskrift i bio&quot;, finder Claude skaberens egen opskriftsside.
      </div>
      <div>
        <label className="label" htmlFor="insta-url">Link til reel eller opslag</label>
        <input id="insta-url" value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" placeholder="https://www.instagram.com/reel/…" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="caption">Billedtekst <span className="font-normal">(valgfri)</span></label>
        <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} placeholder="Kopiér teksten under reelet og sæt den ind her" className="field text-sm" />
      </div>
      <div>
        <span className="label">Skærmbilleder <span className="font-normal">(valgfri)</span></span>
        <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface px-4 py-4 text-sm text-muted">
          {files.length ? `${files.length} valgt · vælg andre` : "Vælg skærmbilleder af opskriften (op til 4)"}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 4))} />
        </label>
        {files.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="aspect-[9/16] w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
        {files.length > 0 && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Brug første skærmbillede som foto, hvis der ikke findes et bedre
          </label>
        )}
      </div>
      {error && <p className="text-sm text-warm">{error}</p>}
      <button
        className="btn-primary w-full"
        disabled={busy || (!url.trim() && !caption.trim() && !files.length)}
        onClick={() =>
          run(async () => {
            const form = new FormData();
            form.append("url", url.trim());
            form.append("caption", caption);
            for (const f of files) form.append("photos", await downsize(f));
            if (keep) form.append("keepPhoto", "1");
            return fetch("/api/recipes/import-social", { method: "POST", body: form });
          }, onDraft)
        }
      >
        {busy ? <Working text="Læser opslaget…" /> : "Lav opskrift"}
      </button>
    </div>
  );
}

/** Phone photos are huge; ~1600px JPEG is plenty for Claude to read and keeps uploads fast. */
async function downsize(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function Working({ text }: { text: string }) {
  return (
    <>
      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {text}
    </>
  );
}
