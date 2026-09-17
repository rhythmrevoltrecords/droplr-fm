"use client";
import { Loader2, MailWarning } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div role="status" className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center">
      <MailWarning className="hidden h-5 w-5 shrink-0 text-amber-400 sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p><strong>Confirm your email.</strong> We sent a link to <span className="break-all">{email}</span>. Until then you can&apos;t invite people or connect a custom domain or Spotify app.</p>
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
