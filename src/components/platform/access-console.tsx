"use client";
import { Check, Copy, Loader2, Mail, Send, Slash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

type Kind = "" | "artist" | "label";
export type Created = { id: string; email: string | null; url: string; emailed: boolean };
type Settings = { kind: Kind; expiresInDays: number; note: string };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, j };
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this link", text);
        }
      }}
    >
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

/** Owner: make invite links (per person, or one open link with a use limit). Invited accounts start on the Free plan. */
export function InviteForm({ emailReady }: { emailReady: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"people" | "open">("people");
  const [emails, setEmails] = useState("");
  const [sendEmail, setSendEmail] = useState(emailReady);
  const [maxUses, setMaxUses] = useState(10);
  const [s, setS] = useState<Settings>({ kind: "", expiresInDays: 14, note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const [skipped, setSkipped] = useState<{ email: string; reason: string }[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { ok, j } = await post("/api/platform/invites", {
      ...(mode === "open" ? { open: true, maxUses } : { emails, sendEmail }),
      kind: s.kind || null, expiresInDays: s.expiresInDays, note: s.note,
    });
    setBusy(false);
    if (!ok) return setErr(String(j.error ?? "Couldn't make the invite"));
    setCreated((j.created as Created[]) ?? []);
    setSkipped((j.skipped as { email: string; reason: string }[]) ?? []);
    if (mode === "people") setEmails("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="Invite type" className="grid grid-cols-2 rounded-xl border p-1 text-sm sm:w-96">
        {(["people", "open"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 font-medium ${mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {m === "people" ? "Specific people" : "Open link"}
          </button>
        ))}
      </div>

      {mode === "people" ? (
        <div className="space-y-2">
          <Label htmlFor="inv-emails">Emails</Label>
          <textarea id="inv-emails" value={emails} onChange={(e) => setEmails(e.target.value)} rows={3} required placeholder={"artist@example.com\nlabel@example.com"} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm" />
          <p className="text-xs text-muted-foreground">One per line (or commas), up to 50. Each person gets their own single-use link that only works with their email.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} disabled={!emailReady} className="h-4 w-4 accent-violet-500" />
            Email them the invite{!emailReady && <span className="text-xs text-amber-400"> (account email isn&apos;t set up: copy the links instead)</span>}
          </label>
        </div>
      ) : (
        <div className="space-y-2 sm:w-64">
          <Label htmlFor="inv-max">How many people can use it</Label>
          <Input id="inv-max" type="number" min={1} max={500} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">Share it anywhere (DMs, a group chat). It stops working after this many signups.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-kind">Account type</Label>
          <Select id="inv-kind" value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value as Kind })}>
            <option value="">They choose</option>
            <option value="artist">Artist</option>
            <option value="label">Label</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-exp">Link works for</Label>
          <Select id="inv-exp" value={s.expiresInDays} onChange={(e) => setS({ ...s, expiresInDays: Number(e.target.value) })}>
            {[3, 7, 14, 30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-note">Note (only you see this)</Label>
        <Input id="inv-note" maxLength={200} value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} placeholder="Founding artists, Brisbane showcase…" />
      </div>
      <p className="text-xs text-muted-foreground">Invited accounts start on the Free plan, like everyone else. They can upgrade from Billing whenever they want (discount codes work at checkout).</p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />} {mode === "open" ? "Make link" : sendEmail && emailReady ? "Make and email invites" : "Make invite links"}</Button>

      {(created.length > 0 || skipped.length > 0) && (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          {created.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{c.email ?? "Open link"}{c.emailed && <span className="ml-2 text-xs text-emerald-400">emailed</span>}</span>
              <code className="hidden max-w-[320px] truncate text-xs text-muted-foreground md:block">{c.url}</code>
              <CopyButton text={c.url} />
            </div>
          ))}
          {skipped.map((k) => <p key={k.email} className="text-xs text-amber-400">Skipped {k.email}: {k.reason}</p>)}
        </div>
      )}
    </form>
  );
}

export function InviteActions({ id, url, canResend }: { id: string; url: string | null; canResend: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (action: "revoke" | "resend") => {
    if (action === "revoke" && !window.confirm("Switch this link off? Anyone who hasn't signed up yet won't be able to use it.")) return;
    setBusy(action);
    const { ok, j } = await post(`/api/platform/invites/${id}`, { action });
    setBusy(null);
    setMsg(ok ? (action === "resend" ? "Sent" : null) : String(j.error ?? "Failed"));
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      {url && <CopyButton text={url} label="Copy" />}
      {url && canResend && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("resend")}>{busy === "resend" ? <Loader2 className="animate-spin" /> : <Mail />} Resend</Button>}
      {url && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("revoke")} className="text-red-400">{busy === "revoke" ? <Loader2 className="animate-spin" /> : <Slash />} Revoke</Button>}
    </div>
  );
}

/** Waitlist row: one-click single-use invite to that email, emailed when account email is set up. */
export function WaitlistInviteButton({ email, emailReady }: { email: string; emailReady: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Created | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (res) return res.emailed ? <span className="text-xs text-emerald-400">Invite emailed</span> : <CopyButton text={res.url} />;
  return (
    <div className="flex items-center justify-end gap-2">
      {err && <span className="text-xs text-red-400">{err}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { ok, j } = await post("/api/platform/invites", { emails: email, sendEmail: emailReady, expiresInDays: 14, note: "From the waitlist" });
          setBusy(false);
          const c = (j.created as Created[] | undefined)?.[0];
          if (!ok || !c) return setErr(String(j.error ?? (j.skipped as { reason: string }[] | undefined)?.[0]?.reason ?? "Failed"));
          setRes(c);
          router.refresh();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Send />} {emailReady ? "Invite" : "Make link"}
      </Button>
    </div>
  );
}
