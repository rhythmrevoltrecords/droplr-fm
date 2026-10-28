"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Suspend or lift. Suspending asks once, in place (no browser dialog), and says what it does;
 * lifting doesn't ask, because it only puts things back. `blocker` is decided on the server.
 */
export function SuspendControl({ orgId, name, suspendedAt, by, reason, blocker }: { orgId: string; name: string; suspendedAt: string | null; by: string | null; reason: string | null; blocker: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(suspended: boolean) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/platform/orgs/${orgId}/suspend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suspended, reason: why }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!res?.ok) return setErr(j.error ?? "Couldn't change that. Try again.");
    setConfirming(false);
    setWhy("");
    router.refresh();
  }

  if (suspendedAt) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-red-300">
          Suspended {new Date(suspendedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" })}
          {by ? ` by ${by}` : ""}.{reason ? <span className="block text-xs text-muted-foreground">{reason}</span> : null}
        </p>
        <Button size="sm" variant="outline" onClick={() => send(false)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : "Lift suspension"}</Button>
        {err && <p role="alert" className="text-xs text-red-300">{err}</p>}
      </div>
    );
  }

  if (blocker) return <p className="text-xs text-muted-foreground">Can&apos;t suspend: {blocker}</p>;

  if (!confirming) {
    return <Button size="sm" variant="outline" className="border-red-500/40 text-red-200 hover:bg-red-500/10" onClick={() => setConfirming(true)}>Suspend</Button>;
  }

  return (
    <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
      <p>
        Suspend <strong>{name}</strong>? Their pages, links and gates go offline (404) and they&apos;re signed out. Nothing is deleted, and lifting it puts everything back.
      </p>
      <Input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} placeholder="Why (only you see this)" aria-label="Reason for suspending" />
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={() => send(true)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : "Suspend"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setConfirming(false); setErr(null); }} disabled={busy}>Cancel</Button>
      </div>
      {err && <p role="alert" className="text-xs text-red-300">{err}</p>}
    </div>
  );
}
