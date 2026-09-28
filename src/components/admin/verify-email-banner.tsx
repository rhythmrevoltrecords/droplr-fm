"use client";
import { Loader2, MailWarning } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shown to an artist a label invited onto its roster, who hasn't confirmed their address yet.
 *
 * Account owners don't see this — they're held on /verify-email until they confirm, because an
 * owner can publish a page on droplr.fm and an unconfirmed address proves nothing about who they
 * are. An invited artist can't publish anything: they see the releases their label assigned them
 * and nothing else. Walling them off would add friction to the label's onboarding and prevent
 * no abuse, so they get a nag instead.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div role="status" className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center">
      <MailWarning className="hidden h-5 w-5 shrink-0 text-amber-400 sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p><strong>Confirm your email.</strong> We sent a link to <span className="break-all">{email}</span>. It keeps your account yours, and it&apos;s how we reach you about your releases.</p>
        {msg && <p className={`mt-1 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/auth/verify-email", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg({ ok: res.ok, text: j.message ?? j.error ?? "Couldn't send" });
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Resend link
      </Button>
    </div>
  );
}
