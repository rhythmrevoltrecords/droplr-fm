"use client";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? null : j.error || "Something went wrong";
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (v.next !== v.confirm) return setMsg({ ok: false, text: "The two new passwords don't match" });
    setBusy(true);
    const err = await post("/api/auth/password", { currentPassword: v.current, newPassword: v.next });
    setBusy(false);
    if (err) return setMsg({ ok: false, text: err });
    setV({ current: "", next: "", confirm: "" });
    setMsg({ ok: true, text: "Password changed. Other devices have been signed out." });
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      {/* Hidden username helps password managers update the right entry */}
      <div className="space-y-2"><Label htmlFor="current">Current password</Label><Input id="current" type="password" autoComplete="current-password" required value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="new">New password</Label><Input id="new" type="password" autoComplete="new-password" minLength={minLength} required value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" type="password" autoComplete="new-password" minLength={minLength} required value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} /></div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Change password</Button>
        {msg && <span role="status" className={msg.ok ? "text-sm text-emerald-400" : "text-sm text-red-400"}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function SignOutEverywhereButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const err = await post("/api/auth/sessions");
          setBusy(false);
          setMsg(err ?? "Signed out on every other device.");
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Sign out other devices
      </Button>
      {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
    </div>
  );
}
