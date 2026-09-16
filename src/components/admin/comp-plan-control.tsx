"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export function CompPlanControl({ orgId, compPlan, compNote }: { orgId: string; compPlan: string | null; compNote: string | null }) {
  const router = useRouter();
  const [plan, setPlan] = useState(compPlan ?? "none");
  const [note, setNote] = useState(compNote ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = plan !== (compPlan ?? "none") || note !== (compNote ?? "");

  async function save() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/platform/orgs/${orgId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ compPlan: plan === "none" ? null : plan, compNote: note }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Failed");
    router.refresh();
  }

  return (
    <div className="flex w-56 flex-col gap-1.5">
      <div className="flex gap-2">
        <Select aria-label="Complimentary plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-8 flex-1 text-xs">
          <option value="none">No comp</option>
          <option value="pro">Pro (free)</option>
          <option value="label">Label (free)</option>
          <option value="enterprise">Enterprise (free)</option>
        </Select>
        <Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? <Loader2 className="animate-spin" /> : "Save"}</Button>
      </div>
      <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. own label" className="h-8 text-xs" maxLength={200} />
      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  );
}
