"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * Connect a SoundCloud app, for download-gate steps that perform a follow, like or repost.
 *
 * The credentials are checked against SoundCloud before they're saved — a key that doesn't work
 * should fail here, in settings, not later on a fan's screen half-way through a gate.
 */
export function SoundCloudConnectForm({ status, username, canEdit }: { status: string; username: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function submit(method: "POST" | "DELETE") {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/org/soundcloud", {
      method,
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), profileUrl: profileUrl.trim() || undefined }) }
        : {}),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setClientId(""); setClientSecret("");
      setMsg({ tone: "ok", text: method === "POST" ? "Connected." : "Disconnected." });
      router.refresh();
      return;
    }
    setMsg({ tone: "bad", text: (await res?.json().catch(() => null))?.error ?? "Couldn't save that." });
  }

  if (!canEdit) return <p className="text-sm text-muted-foreground">Only the account owner can change this.</p>;

  return (
    <div className="space-y-3">
      {status === "active" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connected{username ? <> as <strong className="text-foreground">{username}</strong></> : null}. Gate steps can follow, like and repost on a fan&apos;s behalf.
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void submit("DELETE")}>
            {busy && <Loader2 className="animate-spin" />} Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-id">Client ID</Label>
              <Input id="sc-id" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-secret">Client Secret</Label>
              <Input id="sc-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-profile">Your SoundCloud profile <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="sc-profile" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://soundcloud.com/you" />
          </div>
          <Button size="sm" disabled={busy || !clientId || !clientSecret} onClick={() => void submit("POST")}>
            {busy && <Loader2 className="animate-spin" />} Connect
          </Button>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
