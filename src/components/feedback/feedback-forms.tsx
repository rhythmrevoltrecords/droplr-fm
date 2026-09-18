"use client";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

const CATEGORIES: [string, string][] = [["idea", "Idea"], ["bug", "Something's broken"], ["question", "Question"], ["other", "Other"]];
const textarea = "min-h-32 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
  return res.ok ? { ok: true as const, url: j.url } : { ok: false as const, error: j.error ?? "Something went wrong. Try again." };
}

/** Header button: opens the feedback page and remembers which page you were on. */
export function FeedbackButton({ href, unread }: { href: string; unread: boolean }) {
  const path = usePathname();
  const from = path && !path.includes("/feedback") ? `?from=${encodeURIComponent(path)}` : "";
  return (
    <Link href={`${href}${from}`} data-tour="feedback" className="relative inline-flex shrink-0 items-center gap-1.5 text-muted-foreground hover:text-foreground" title={unread ? "The droplr.fm team replied" : "Send feedback"}>
      <MessageSquarePlus className="h-4 w-4" />
      <span className="hidden lg:inline">Feedback</span>
      {unread && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-background" aria-label="New reply" />}
    </Link>
  );
}

export function NewFeedbackForm({ from }: { from: string | null }) {
  const router = useRouter();
  const [category, setCategory] = useState("idea");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    const r = await post("/api/feedback", { category, subject, body, page: from });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    router.push(r.url ?? "?");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          <Label htmlFor="fb-cat">Type</Label>
          <Select id="fb-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="fb-subject">Subject <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="fb-subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Pre-save email didn't arrive" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fb-body">Message</Label>
        <textarea id="fb-body" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} className={textarea} placeholder="What's working, what isn't, what you wish droplr did. Screenshots help: paste a link." />
      </div>
      {from && <p className="text-xs text-muted-foreground">We&apos;ll see you sent this from <span className="font-mono">{from}</span>.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={send} disabled={busy || body.trim().length < 2}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Send to the droplr.fm team</Button>
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>
    </div>
  );
}

/** Reply box for either side. `statusControl`: platform owner can close / reopen. */
export function FeedbackReply({ endpoint, placeholder, status, statusControl = false }: { endpoint: string; placeholder: string; status?: string; statusControl?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(extra: { status?: string } = {}, withBody = true) {
    setBusy(extra.status ?? "send");
    setErr(null);
    const r = await post(endpoint, { ...(withBody ? { body } : {}), ...extra });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    if (withBody) setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <textarea aria-label="Reply" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} className={textarea} placeholder={placeholder} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => send()} disabled={!!busy || !body.trim()}>{busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send reply</Button>
        {statusControl && status === "open" && (
          <>
            <Button variant="outline" onClick={() => send({ status: "closed" }, !!body.trim())} disabled={!!busy}>{busy === "closed" && <Loader2 className="animate-spin" />} {body.trim() ? "Send and close" : "Close"}</Button>
          </>
        )}
        {statusControl && status === "closed" && <Button variant="outline" onClick={() => send({ status: "open" }, false)} disabled={!!busy}>{busy === "open" && <Loader2 className="animate-spin" />} Reopen</Button>}
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>
    </div>
  );
}
