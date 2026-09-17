"use client";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RunReferralsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/platform/referrals", { method: "POST" });
          const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setBusy(false);
          setMsg(res.ok ? (j.skipped ? String(j.skipped) : `checked ${j.checked}, earned ${j.earned}, applied ${j.applied}, errors ${j.errors}`) : String(j.error ?? "Failed"));
          router.refresh();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Run check now
      </Button>
    </div>
  );
}
