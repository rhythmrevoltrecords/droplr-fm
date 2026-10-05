"use client";
import { Loader2, Megaphone, Undo2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";

type Org = { id: string; name: string; kind: string };
type Sent = { id: string; title: string | null; body: string; orgName: string | null; createdAt: string; revokedAt: string | null; seenCount: number };

/**
 * Write a notice that appears in people's dashboards.
 *
 * Two audiences only: one account, or everyone. The account picker defaults to **everyone**, which
 * is the loud option — so the submit button says which it is, in words, right where the cursor is
 * about to be. A broadcast cannot be recalled from the people who already read it, only pulled from
 * the ones who haven't, and that asymmetry is worth one moment of friction.
 */
export function MessageComposer({ orgs, sent }: { orgs: Org[]; sent: Sent[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [tone, setTone] = useState("info");
  const [orgId, setOrgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const target = orgId ? orgs.find((o) => o.id === orgId)?.name ?? "that account" : "everyone";

  async function send() {
    setErr(null);
    setBusy(true);
    const r = await fetch("/api/platform/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, linkUrl, linkLabel, tone, organizationId: orgId || null }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't send.");
      return;
    }
    setTitle(""); setBody(""); setLinkUrl(""); setLinkLabel("");
    router.refresh();
  }

  async function revoke(id: string, revoked: boolean) {
    await fetch("/api/platform/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, revoked }),
    });
    router.refresh();
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-violet-300" aria-hidden />
        <h2 className="text-lg font-semibold">Dashboard notice</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Appears at the top of the dashboard until each person dismisses it. Dismissing one doesn&apos;t hide the next, so
        every notice you send is seen once by everyone it&apos;s for.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="msg-title">Headline (optional)</Label>
          <Input id="msg-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New: how-to videos in your dashboard" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="msg-who">Who sees it</Label>
          <Select id="msg-who" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Everyone</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.kind === "artist" ? "Artist" : "Label"})</option>)}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="msg-body">Message</Label>
        <textarea
          id="msg-body" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Welcome aboard — you're one of the first ten artists on droplr. Anything you want built, tell me through Feedback and it goes near the top of the list."
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">{body.length}/2000 · line breaks are kept, nothing else is formatted</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="msg-url">Link (optional)</Label>
          <Input id="msg-url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://droplr.fm/learn" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="msg-tone">Tone</Label>
          <Select id="msg-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="info">Announcement</option>
            <option value="good">Good news</option>
            <option value="warn">Heads-up</option>
          </Select>
        </div>
      </div>
      {linkUrl && (
        <div className="space-y-1.5">
          <Label htmlFor="msg-link-label">Link text</Label>
          <Input id="msg-link-label" maxLength={60} value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Read more" />
        </div>
      )}

      {err && <p className="text-sm text-amber-400">{err}</p>}

      <Button onClick={send} disabled={busy || !body.trim()}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Send to {target}
      </Button>

      {sent.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Sent</h3>
          {sent.map((m) => (
            <div key={m.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{m.title ?? m.body.slice(0, 60)}</div>
                <div className="text-xs text-muted-foreground">
                  {m.orgName ?? "Everyone"} · {new Date(m.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} ·
                  {" "}dismissed by {m.seenCount}{m.revokedAt ? " · pulled" : ""}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => revoke(m.id, !m.revokedAt)}>
                {m.revokedAt ? <><Undo2 className="mr-1.5 h-3.5 w-3.5" /> Put back</> : "Pull"}
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Pulling stops it showing to anyone who hasn&apos;t dismissed it yet. It can&apos;t unsend it from someone who already read it.
          </p>
        </div>
      )}
    </Card>
  );
}
