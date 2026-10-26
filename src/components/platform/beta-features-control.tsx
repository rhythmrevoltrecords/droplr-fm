"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BETA_FEATURES, type BetaFeature } from "@/lib/beta";

/**
 * Switch beta features on or off for one account. On makes the feature appear for them; their plan
 * still decides whether they can create anything, so a plan that doesn't qualify is named here.
 */
export function BetaFeaturesControl({ orgId, on, planNote }: { orgId: string; on: string[]; planNote: Partial<Record<BetaFeature, string>> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function flip(feature: BetaFeature, next: boolean) {
    setBusy(feature);
    setErr(null);
    const res = await fetch(`/api/platform/orgs/${orgId}/features`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature, on: next }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setErr("Couldn't change that. Try again."); return; }
    router.refresh();
  }
  return (
    <ul className="space-y-2">
      {BETA_FEATURES.map((b) => {
        const isOn = on.includes(b.key);
        return (
          <li key={b.key}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={isOn} disabled={busy !== null} onChange={(e) => flip(b.key, e.target.checked)} />
              <span>
                <span className="font-medium">{b.label}</span>
                <span className="block text-xs text-muted-foreground">{b.hint}</span>
                {isOn && planNote[b.key] && <span className="block text-xs text-amber-300">{planNote[b.key]}</span>}
              </span>
            </label>
          </li>
        );
      })}
      {err && <li role="alert" className="text-xs text-red-300">{err}</li>}
    </ul>
  );
}
