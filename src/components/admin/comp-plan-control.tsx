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

export function CompPlanControl({ orgId, kind, compPlan, compNote }: { orgId: string; kind: "label" | "artist"; compPlan: string | null; compNote: string | null }) {
  const router = useRouter();
  const [plan, setPlan] = useState(compPlan ?? "none");
  const [note, setNote] = useState(compNote ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = plan !== (compPlan ?? "none") || note !== (compNote ?? "");

  async function save() {
    setBusy(true);
    setErr(null);
    const e = await patch(orgId, { compPlan: plan === "none" ? null : plan, compNote: note });
    setBusy(false);
    if (e) return setErr(e);
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
      <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. own label" className="h-8 text-xs" maxLength={200} />
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
