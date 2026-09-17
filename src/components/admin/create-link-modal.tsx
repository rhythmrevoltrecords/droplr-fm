"use client";
import { Bell, Check, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArtworkPageShell } from "@/components/public/artwork-shell";
import { LinkTypePreview } from "@/components/public/link-type-preview";
import { Button } from "@/components/ui/button";
import { LINK_TYPES, previewArtwork, type LinkType } from "@/lib/link-types";
import { cn } from "@/lib/utils";

const PREVIEW_W = 390;
const PREVIEW_H = 560;
const SCALE = 0.52;

/**
 * Mini preview: the card backdrop is the real artwork shell (accent-colour glow),
 * with the actual page rendered at phone width inside a small device frame.
 * Coming-soon types are dimmed 60%.
 */
function PreviewFrame({ type, dimmed }: { type: LinkType; dimmed: boolean }) {
  return (
    <div className="relative h-[316px] overflow-hidden rounded-t-2xl bg-black">
      <div aria-hidden className={cn("absolute inset-0 transition", dimmed && "opacity-40")}>
        <ArtworkPageShell preview imageUrl={previewArtwork(type)} accentColor={type.preview.a}><span /></ArtworkPageShell>
      </div>
      <div
        aria-hidden
        className={cn("pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 select-none overflow-hidden rounded-[22px] ring-1 ring-white/15 shadow-2xl transition", dimmed && "opacity-40")}
        style={{ width: PREVIEW_W * SCALE, height: PREVIEW_H * SCALE }}
      >
        <div className="origin-top-left" style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `scale(${SCALE})` }}>
          <LinkTypePreview type={type} />
        </div>
      </div>
    </div>
  );
}

export function CreateLinkModal({ releaseLimitReached }: { releaseLimitReached: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function notify(t: LinkType) {
    setPending(t.key);
    const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature: t.key }) });
    setPending(null);
    if (res.ok) {
      setJoined((s) => new Set(s).add(t.key));
      setToast({ ok: true, text: `We'll notify you when ${t.name} launches!` });
    } else {
      setToast({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save that. Try again." });
    }
  }

  const active = LINK_TYPES.filter((t) => t.status === "active");
  const soon = LINK_TYPES.filter((t) => t.status === "soon");

  const card = (t: LinkType) => {
    const isSoon = t.status === "soon";
    const blocked = !isSoon && releaseLimitReached && t.href?.startsWith("/admin/releases");
    return (
      <div key={t.key} className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-violet-500/30 hover:shadow-[0_0_48px_-12px_rgba(139,92,246,0.5)]">
        <div className="relative">
          <PreviewFrame type={t} dimmed={isSoon} />
          {isSoon && <span className="absolute right-3 top-3 rounded-full bg-violet-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-lg">Coming Soon</span>}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="font-semibold">{t.name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
          </div>
          <div className="mt-auto">
            {isSoon ? (
              <Button variant="outline" className="w-full" disabled={pending === t.key || joined.has(t.key)} onClick={() => notify(t)}>
                {pending === t.key ? <Loader2 className="animate-spin" /> : joined.has(t.key) ? <Check /> : <Bell />}
                {joined.has(t.key) ? "You're on the list" : "Notify Me"}
              </Button>
            ) : blocked ? (
              <Button asChild variant="outline" className="w-full"><Link href="/admin/settings/billing">Upgrade for more releases</Link></Button>
            ) : (
              <Button asChild className="w-full"><Link href={t.href!} onClick={() => setOpen(false)}>Create {t.name}</Link></Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Create link</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="create-link-title">
          <button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} tabIndex={-1} />
          <div className="admin-surface relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0a14] shadow-[0_0_120px_-30px_rgba(124,58,237,0.6)] sm:m-4 sm:rounded-3xl">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-200px] h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-violet-500/20 blur-[120px]" />
            <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <h2 id="create-link-title" className="text-lg font-semibold">Create link</h2>
                <p className="text-sm text-muted-foreground">Every page is themed from its artwork automatically.</p>
              </div>
              <Button ref={closeRef} size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close"><X /></Button>
            </div>
            <div className="relative overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Available now</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{active.map(card)}</div>
              <h3 className="mb-3 mt-10 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Coming soon</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{soon.map(card)}</div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className={cn("fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-2xl", toast.ok ? "bg-violet-500 text-white" : "bg-red-500 text-white")}>
          {toast.text}
        </div>
      )}
    </>
  );
}
