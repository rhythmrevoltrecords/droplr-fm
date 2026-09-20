"use client";
import { Gift, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Two one-off notices about a complimentary plan, in the same shape as LegalUpdateNotice:
 * a strip at the top of every dashboard page until it's acknowledged, never a blocking modal.
 *
 *  - "granted": a comp has been put on this account. Says which plan, and until when if it ends.
 *  - "ended":   the comp has lapsed. Says what the account pays now, in the owner's own words.
 *
 * Acknowledging is per grant, so a second comp later shows its own notice.
 */
export function CompNotice({
  kind,
  planName,
  until,
  note,
  founderPrice,
}: {
  kind: "granted" | "ended";
  planName: string;
  until?: string | null;
  note?: string | null;
  founderPrice?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return null;

  async function ack() {
    setBusy(true);
    const res = await fetch("/api/comp-notice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setDone(true);
      router.refresh();
    }
  }

  const granted = kind === "granted";
  return (
    <div className={`no-print mb-6 rounded-xl border p-4 ${granted ? "border-emerald-500/30 bg-emerald-500/[0.08]" : "border-violet-500/30 bg-violet-500/[0.08]"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Gift className={`mt-0.5 h-4 w-4 shrink-0 ${granted ? "text-emerald-300" : "text-violet-300"}`} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          {granted ? (
            <>
              <p className="text-sm">
                <strong>You&apos;re on {planName}, on us.</strong>{" "}
                {until ? `Free until ${until}.` : "Free, with no end date."}
              </p>
              {note && <p className="text-sm text-muted-foreground">{note}</p>}
              <p className="text-sm text-muted-foreground">
                No card needed and nothing to cancel. Everything on {planName} is switched on now
                {until ? ", and we'll tell you here before it changes" : ""}.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                <strong>Your complimentary {planName} has ended.</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                {founderPrice
                  ? `Your founding rate is ${founderPrice}. Add a card to stay on ${planName} — nothing has been charged, and nothing will be until you do.`
                  : `Nothing has been charged. Add a card to stay on ${planName}, or carry on with the Free plan — your releases and fan list stay either way.`}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!granted && (
            <Button size="sm" asChild>
              <Link href="/admin/settings/billing">See plans</Link>
            </Button>
          )}
          <Button size="sm" variant={granted ? "default" : "ghost"} disabled={busy} onClick={() => void ack()}>
            {busy ? <Loader2 className="animate-spin" /> : granted ? "Thanks" : <X className="h-4 w-4" />}
            {granted ? "" : <span className="sr-only">Dismiss</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
