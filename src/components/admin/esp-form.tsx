"use client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

// Mailchimp audience sync. Mirrors the SoundCloud/Spotify connect forms: inline status, no toast,
// owner-only. The server never returns the API key; this component only ever sends it.

type State = {
  connected: boolean;
  planAllows: boolean;
  status?: string;
  listId?: string | null;
  listName?: string | null;
  marketingOnly?: boolean;
  tagPrefix?: string | null;
  lastSyncedAt?: string | null;
  lastSyncedCount?: number;
  lastError?: string | null;
  audienceCount?: number;
  lists?: { id: string; name: string }[];
  webhookUrl?: string;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-secondary px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

export function EspSyncForm({ canEdit }: { canEdit: boolean }) {
  const [s, setS] = useState<State | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [listId, setListId] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "save" | "sync" | "disconnect">(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/admin/integrations/esp").catch(() => null);
    const j = (await res?.json().catch(() => null)) as State | null;
    if (j) {
      setS(j);
      setListId(j.listId ?? "");
      setTag(j.tagPrefix ?? "");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function connect() {
    setBusy("connect");
    setMsg(null);
    const res = await fetch("/api/admin/integrations/esp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setApiKey("");
      setMsg({ tone: "ok", text: "Connected. Now choose an audience and save." });
      await load();
    } else setMsg({ tone: "bad", text: (await res?.json().catch(() => null))?.error ?? "Couldn't connect." });
  }

  async function save() {
    if (!listId) return setMsg({ tone: "bad", text: "Pick an audience first." });
    setBusy("save");
    setMsg(null);
    const listName = s?.lists?.find((l) => l.id === listId)?.name ?? null;
    const res = await fetch("/api/admin/integrations/esp", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", listId, listName, marketingOnly: true, tagPrefix: tag.trim() || null }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setMsg({ tone: "ok", text: "Saved." });
      await load();
    } else setMsg({ tone: "bad", text: (await res?.json().catch(() => null))?.error ?? "Couldn't save." });
  }

  async function sync() {
    setBusy("sync");
    setMsg(null);
    const res = await fetch("/api/admin/integrations/esp", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    }).catch(() => null);
    setBusy(null);
    const j = await res?.json().catch(() => null);
    if (res?.ok) {
      setMsg({ tone: "ok", text: j?.stoppedEarly ? `Pushed ${j.upserted}. The rest finish within the hour.` : `Pushed ${j?.upserted ?? 0} fans to Mailchimp.` });
      await load();
    } else setMsg({ tone: "bad", text: j?.error ?? "Sync failed." });
  }

  async function disconnect() {
    setBusy("disconnect");
    setMsg(null);
    const res = await fetch("/api/admin/integrations/esp", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setMsg({ tone: "ok", text: "Disconnected." });
      await load();
    } else setMsg({ tone: "bad", text: "Couldn't disconnect." });
  }

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!s.planAllows)
    return <p className="text-sm text-muted-foreground">Audience sync is on the paid plans. Fans you collect push straight into your Mailchimp list.</p>;
  if (!canEdit) return <p className="text-sm text-muted-foreground">Only the account owner can change this.</p>;

  return (
    <div className="space-y-4">
      {!s.connected ? (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>In Mailchimp: Account &amp; billing → Extras → API keys → Create a key.</li>
            <li>Paste it below. droplr checks it, then only ever stores it encrypted.</li>
          </ol>
          <div className="space-y-1.5">
            <Label htmlFor="esp-key">Mailchimp API key</Label>
            <Input id="esp-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="xxxxxxxx-us21" />
          </div>
          <Button size="sm" disabled={busy !== null || apiKey.trim().length < 10} onClick={() => void connect()}>
            {busy === "connect" && <Loader2 className="animate-spin" />} Connect Mailchimp
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {s.audienceCount ?? 0} consented fan{(s.audienceCount ?? 0) === 1 ? "" : "s"} ready to sync.
            {s.lastSyncedAt ? <> Last pushed {new Date(s.lastSyncedAt).toLocaleString()} ({s.lastSyncedCount ?? 0}).</> : <> Not synced yet.</>}
          </p>
          {s.lastError && <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{s.lastError}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="esp-list">Mailchimp audience</Label>
            <select id="esp-list" className={selectClass} value={listId} onChange={(e) => setListId(e.target.value)} disabled={busy !== null}>
              <option value="">Select an audience…</option>
              {(s.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="esp-tag">Tag added to each fan <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="esp-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="droplr" maxLength={40} />
          </div>

          {s.webhookUrl && (
            <div className="space-y-1.5">
              <Label htmlFor="esp-hook">Unsubscribe webhook <span className="text-muted-foreground">(optional, keeps opt-outs in sync)</span></Label>
              <Input id="esp-hook" readOnly value={s.webhookUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Paste this in Mailchimp → Audience → Settings → Webhooks, ticked for &quot;unsubscribes&quot;. Then an unsubscribe there also stops droplr emailing them.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Only fans who opted in to hear from you are synced. Anyone who unsubscribes in Mailchimp stays unsubscribed — droplr never re-subscribes an existing member.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => void save()}>
              {busy === "save" && <Loader2 className="animate-spin" />} Save
            </Button>
            <Button size="sm" variant="secondary" disabled={busy !== null || !s.listId} onClick={() => void sync()}>
              {busy === "sync" && <Loader2 className="animate-spin" />} Sync now
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void disconnect()}>
              {busy === "disconnect" && <Loader2 className="animate-spin" />} Disconnect
            </Button>
          </div>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
