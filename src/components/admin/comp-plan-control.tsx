"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { afterOptions, CLAIM_WINDOWS, COMP_NOTES, FOUNDER_CODES, founderPercentOff } from "@/lib/comp-presets";
import type { PlanKey } from "@/lib/plans";

async function patch(orgId: string, body: unknown): Promise<string | null> {
  const res = await fetch(`/api/platform/orgs/${orgId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? null : j.error ?? "Failed";
}

const COMP_OPTIONS: Record<"label" | "artist", [string, string][]> = {
  label: [["pro", "Pro (free)"], ["label", "Label (free)"], ["enterprise", "Enterprise (free)"]],
  artist: [["artist", "Artist (free)"], ["artist_pro", "Artist Pro (free)"]],
};

const CUSTOM = "__custom__";

/** Comp lengths worth having a button for. 0 = no end date. */
const DURATIONS: [number, string][] = [[0, "No end date"], [30, "30 days"], [60, "60 days"], [90, "90 days"], [180, "6 months"], [365, "12 months"]];

export function CompPlanControl({ orgId, kind, compPlan, compNote, compUntil, founderPrice, founderOfferUntil, founderCode }: { orgId: string; kind: "label" | "artist"; compPlan: string | null; compNote: string | null; compUntil?: string | null; founderPrice?: string | null; founderOfferUntil?: string | null; founderCode?: string | null }) {
  const router = useRouter();
  const [plan, setPlan] = useState(compPlan ?? "none");
  const [note, setNote] = useState(compNote ?? "");
  const [days, setDays] = useState(0);
  const [after, setAfter] = useState(founderPrice ?? "");
  // "" means the preset list is showing; CUSTOM swaps in the free text box.
  const [noteMode, setNoteMode] = useState<string>(compNote && !COMP_NOTES.includes(compNote as (typeof COMP_NOTES)[number]) ? CUSTOM : compNote ?? "");
  const [afterMode, setAfterMode] = useState<string>(founderPrice ? CUSTOM : "");
  const [claimDays, setClaimDays] = useState(30);
  const [code, setCode] = useState(founderCode ?? "");
  const afters = afterOptions(plan as PlanKey | "none");
  const suggestedCode = plan !== "none" ? FOUNDER_CODES[plan as PlanKey] ?? null : null;
  const percentOff = plan !== "none" ? founderPercentOff(plan as PlanKey) : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = plan !== (compPlan ?? "none") || note !== (compNote ?? "") || after !== (founderPrice ?? "") || code !== (founderCode ?? "") || (plan !== "none" && days !== 0);

  async function save() {
    setBusy(true);
    setErr(null);
    const e = await patch(orgId, { compPlan: plan === "none" ? null : plan, compNote: note, compDays: days, founderPrice: after, claimDays, founderCode: code });
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
          <Select
            aria-label="What they pay after"
            value={afterMode}
            onChange={(e) => {
              setAfterMode(e.target.value);
              setAfter(e.target.value === CUSTOM || e.target.value === "" ? "" : e.target.value);
            }}
            className="h-8 text-xs"
          >
            <option value="">After: don&apos;t say</option>
            {afters.map((a) => <option key={a} value={a}>After: {a}</option>)}
            <option value={CUSTOM}>After: custom…</option>
          </Select>
          {afterMode === CUSTOM && (
            <Input aria-label="Custom price after" value={after} onChange={(e) => setAfter(e.target.value)} placeholder="Your own words" className="h-8 text-xs" maxLength={120} />
          )}
          {after && days > 0 && (
            <>
              <Select aria-label="Claim window" value={claimDays} onChange={(e) => setClaimDays(Number(e.target.value))} className="h-8 text-xs">
                {CLAIM_WINDOWS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </Select>
              <Select aria-label="Promo code" value={code} onChange={(e) => setCode(e.target.value)} className="h-8 text-xs">
                <option value="">No code</option>
                {suggestedCode && <option value={suggestedCode}>{suggestedCode}</option>}
                {code && code !== suggestedCode && <option value={code}>{code}</option>}
              </Select>
              {suggestedCode && percentOff !== null && (
                <span className="text-[11px] text-muted-foreground">
                  Stripe coupon: {percentOff}% off, repeating 24 months, applies_to this plan&apos;s product.
                </span>
              )}
            </>
          )}
        </>
      )}
      <Select
        aria-label="Message"
        value={noteMode}
        onChange={(e) => {
          setNoteMode(e.target.value);
          setNote(e.target.value === CUSTOM || e.target.value === "" ? "" : e.target.value);
        }}
        className="h-8 text-xs"
      >
        <option value="">No message</option>
        {COMP_NOTES.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value={CUSTOM}>Custom…</option>
      </Select>
      {noteMode === CUSTOM && (
        <Input aria-label="Custom message" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your own words" className="h-8 text-xs" maxLength={200} />
      )}
      {compPlan && (
        <span className="text-[11px] text-muted-foreground">
          {compUntil ? `Ends ${new Date(compUntil).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : "No end date"}
          {founderOfferUntil && ` · claim by ${new Date(founderOfferUntil).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
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
