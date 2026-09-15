"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "./copy-button";
import { QrDownload } from "./qr-download";

type V = { id: string; slug: string; source: string; clicks: number };

export function VariantManager({ releaseId, baseUrl, variants, qrEnabled, readOnly = false }: { releaseId: string; baseUrl: string; variants: V[]; qrEnabled: boolean; readOnly?: boolean }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [source, setSource] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    const res = await fetch(`/api/admin/releases/${releaseId}/variants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, source }) });
    if (!res.ok) return setErr((await res.json()).error);
    setSlug("");
    setSource("");
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/admin/releases/${releaseId}/variants?variantId=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const rows = [{ id: "main", slug: "", source: "main link", clicks: -1 }, ...variants];
  return (
    <div className="space-y-3">
      {rows.map((v) => {
        const url = v.slug ? `${baseUrl}/${v.slug}` : baseUrl;
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{v.slug ? `/${v.slug}` : "Main link"} <span className="text-muted-foreground">· {v.source}</span></div>
              <div className="truncate text-xs text-muted-foreground">{url}</div>
            </div>
            {v.clicks >= 0 && <span className="text-xs tabular-nums text-muted-foreground">{v.clicks} clicks</span>}
            <CopyButton value={url} />
            {qrEnabled && <QrDownload value={url} filename={`qr-${v.slug || "main"}`} />}
            {!readOnly && v.id !== "main" && <Button size="icon" variant="ghost" onClick={() => remove(v.id)} aria-label="Delete variant"><Trash2 /></Button>}
          </div>
        );
      })}
      {!readOnly && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug e.g. ig-story" />
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="source e.g. instagram" />
          <Button variant="secondary" onClick={create} disabled={!slug}><Plus /> Add variant</Button>
        </div>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
      {!qrEnabled && <p className="text-xs text-muted-foreground">QR codes are on Pro and above.</p>}
    </div>
  );
}
