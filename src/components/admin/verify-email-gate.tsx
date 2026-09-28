"use client";
import { Loader2, MailWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * The screen an account sees until it confirms its address.
 *
 * The thing this must not be is a wall. Whoever is looking at it has just signed up, the email is
 * probably in spam, and a meaningful share of them typed the address slightly wrong — so the two
 * ways out, resend and correct the address, are on the screen rather than behind a support email
 * they'd have to find.
 */
export function VerifyEmailGate({ email }: { email: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(email);
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"resend" | "change" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy("resend");
    setMsg(null);
    const res = await fetch("/api/auth/verify-email", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(null);
    setMsg({ ok: res.ok, text: j.message ?? j.error ?? "Couldn't send it just now." });
  }

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setBusy("change");
    setMsg(null);
    const res = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: next }),
    });
    const j = (await res.json().catch(() => ({}))) as { email?: string; message?: string; error?: string };
    setBusy(null);
    if (res.ok && j.email) {
      setCurrent(j.email);
      setEditing(false);
      setNext("");
    }
    setMsg({ ok: res.ok, text: j.message ?? j.error ?? "Couldn't change it just now." });
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-sm text-amber-300"><MailWarning className="h-5 w-5" aria-hidden /> One more step</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We sent a link to <strong className="break-all text-foreground">{current}</strong>. Click it and you&apos;re in — it works for 48 hours.
          Everything in your account is waiting on the other side of it.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing there? Check spam and promotions first; it comes from accounts@droplr.fm.
        </p>

        {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-emerald-400" : "text-red-300"}`}>{msg.text}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={resend} disabled={busy !== null}>
            {busy === "resend" && <Loader2 className="animate-spin" />} Resend the link
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.refresh()} disabled={busy !== null}>
            I&apos;ve clicked it
          </Button>
          {!editing && (
            <button type="button" onClick={() => { setEditing(true); setMsg(null); }} className="text-sm text-muted-foreground underline hover:text-foreground">
              Wrong address?
            </button>
          )}
        </div>

        {editing && (
          <form onSubmit={change} className="mt-5 space-y-2 border-t pt-5">
            <Label htmlFor="new-email">The right address</Label>
            <Input id="new-email" type="email" required autoFocus value={next} onChange={(e) => setNext(e.target.value)} placeholder="you@yourlabel.com" />
            <p className="text-xs text-muted-foreground">We&apos;ll move your account to this address and send the link there instead.</p>
            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={busy !== null || !next.trim()}>
                {busy === "change" && <Loader2 className="animate-spin" />} Save and send
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setNext(""); }}>Cancel</Button>
            </div>
          </form>
        )}

      <div className="mt-6 flex items-center justify-center gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span>Stuck? <a className="underline" href="mailto:support@droplr.fm">support@droplr.fm</a></span>
        <span aria-hidden>·</span>
        <form method="post" action="/api/auth/logout"><button className="underline hover:text-foreground">Log out</button></form>
      </div>
    </>
  );
}
