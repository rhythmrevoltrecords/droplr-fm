"use client";
import { Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Hand the graphic straight to the phone's share sheet, so posting it to a story is two taps
 * instead of download → find in camera roll → open Instagram → pick it.
 *
 * Deliberately the Web Share API rather than Instagram's Content Publishing API. That one needs
 * a Business or Creator account linked to a Facebook Page, plus app review, *per artist* — weeks
 * of setup to publish to one network. navigator.share reaches every app on the phone, needs no
 * tokens and no review, and works from the mobile web today.
 *
 * Renders nothing where it wouldn't work — mostly desktop browsers, which have no share sheet
 * worth the name. The Download button beside it already covers that case, so a disabled button
 * here would just be clutter.
 */
export function ShareButton({ url, filename, title }: { url: string; filename: string; title: string }) {
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // canShare({files}) is the only honest test: Safari and Chrome both expose navigator.share
    // on desktop while refusing files, and a button that fails on click is worse than no button.
    try {
      const probe = new File([new Blob([""], { type: "image/png" })], "probe.png", { type: "image/png" });
      setCan(typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [probe] }));
    } catch {
      setCan(false);
    }
  }, []);

  if (!can) return null;

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], filename, { type: "image/png" });
      await navigator.share({ files: [file], title });
    } catch (e) {
      // AbortError is the person closing the sheet — not a failure, and not worth a message.
      if ((e as Error)?.name !== "AbortError") console.error("[share]", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={() => void share()} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Share2 />} Share
    </Button>
  );
}
