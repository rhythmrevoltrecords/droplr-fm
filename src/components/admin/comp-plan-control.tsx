"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

async function patch(orgId: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/platform/orgs/${orgId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? null : j.error ?? "Failed";
}

const COMP_OPTIONS: Record<"label" | "artist", [string, string][]> = {
  label: [["pro", "Pro (free)"], ["label", "Label (free)"], ["enterprise", "Enterprise (free)"]],
  artist: [["artist", "Artist (free)"], ["artist_pro", "Artist Pro (free)"]],
};

/** Comp lengths worth having a button for. 0 = no end date. */
const DURATIONS: [number, string][] = [[0, "No end date"], [30, "30 days"], [60, "60 days"], [90, "90 days"], [180, "6 months"], [365, "12 months"]];

export function CompPlanControl({ orgId, kind, compPlan, compNote, compUntil, founderPrice }: { orgId: string; kind: "label" | "artist"; compPlan: string | null; compNote: string | null; compUntil?: string | null; founderPrice?: string | null }) {
  const router = useRouter();
  const [plan, setPlan] = useState(compPlan ?? "none");
  const [note, setNote] = useState(compNote ?? "");
  const [days, setDays] = useState(0);
  const [after, setAfter] = useState(founderPrice ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = plan !== (compPlan ?? "none") || note !== (compNote ?? "") || after !== (founderPrice ?? "") || (plan !== "none" && days !== 0);

  async function save() {
    setBusy(true);
    setErr(null);
    const e = await patch(orgId, { compPlan: plan === "none" ? null : plan, compNote: note, compDays: days, founderPrice: after });
    setBusy(false);
    if (e) return setErr(e);
    setDays(0);
    router.refresh();
  }

  return (
    <div className="flex w-56 flex-col gap-1.5">
      <div className="flex gap-2">
        <Select aria-label="Complimentary plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-8 flex-1 text-xs">
          <option value="none">No comp</option>
          {COMP_OPTIONS[kind].map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </Select>
        <Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? <Loader2 className="animate-spin" /> : "Save"}</Button>
      </div>
      {plan !== "none" && (
        <>
          <Select aria-label="Comp length" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 text-xs">
            {DURATIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
          <Input aria-label="What they pay after" value={after} onChange={(e) => setAfter(e.target.value)} placeholder="After: A$17/mo, locked 24 months" className="h-8 text-xs" maxLength={120} />
        </>
      )}
      <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. own label" className="h-8 text-xs" maxLength={200} />
      {compPlan && (
        <span className="text-[11px] text-muted-foreground">
          {compUntil ? `Ends ${new Date(compUntil).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : "No end date"}
        </span>
      )}
      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  );
}

/** Switch an account between label and artist. The API refuses while a Stripe subscription or other-type comp is attached. */
export function AccountKindControl({ orgId, kind, blocker }: { orgId: string; kind: "label" | "artist"; blocker: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const to = kind === "artist" ? "label" : "artist";

  async function flip() {
    if (!window.confirm(`Switch this account to ${to}? Its nav, plans and promo steps change; releases and fans stay.`)) return;
    setBusy(true);
    setErr(null);
    const e = await patch(orgId, { kind: to });
    setBusy(false);
    if (e) return setErr(e);
    router.refresh();
  }

  return (
    <div className="flex w-40 flex-col gap-1.5">
      <Button size="sm" variant="outline" onClick={flip} disabled={busy || !!blocker} title={blocker ?? undefined}>
        {busy ? <Loader2 className="animate-spin" /> : `Make ${to}`}
      </Button>
      {(err || blocker) && <span className="text-xs text-muted-foreground">{err ?? blocker}</span>}
    </div>
  );
}
