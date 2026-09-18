"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Puts a scheduled send back to draft. The worker only picks up status "scheduled". */
export function NewsCancel({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {error && <span className="text-sm text-red-300">{error}</span>}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/admin/news/${id}/send`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "cancel" }),
          });
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setBusy(false);
          if (!res.ok) setError(j.error ?? "Couldn't cancel that.");
          else router.refresh();
        }}
      >
        {busy ? "Cancelling…" : "Cancel this send"}
      </Button>
    </div>
  );
}
