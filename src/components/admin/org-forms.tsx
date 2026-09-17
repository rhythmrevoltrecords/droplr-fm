"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { CopyButton } from "./copy-button";

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? j.message ?? "Saved" : j.error ?? "Failed" });
    if (res.ok) router.refresh();
    return { ok: res.ok, data: j };
  }
  return { busy, msg, submit };
}

const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) => (msg ? <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span> : null);

export function OrgFieldsForm({ fields, initial, disabled, submitLabel = "Save" }: { fields: { key: string; label: string; placeholder?: string }[]; initial: Record<string, string>; disabled?: string; submitLabel?: string }) {
  const [v, setV] = useState(initial);
  const { busy, msg, submit } = useSubmit();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit("/api/admin/org", "PATCH", v); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label>{f.label}</Label>
            <Input value={v[f.key] ?? ""} placeholder={f.placeholder} disabled={!!disabled} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !!disabled}>{busy && <Loader2 className="animate-spin" />} {submitLabel}</Button>
        {disabled ? <span className="text-sm text-muted-foreground">{disabled}. <a href="/admin/settings/billing" className="text-violet-400 underline">Upgrade</a></span> : <Msg msg={msg} />}
      </div>
    </form>
  );
}

export function SpotifyConnectForm({ status, canEdit, planAllows }: { status: string; canEdit: boolean; planAllows: boolean }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const { busy, msg, submit } = useSubmit();
  if (!planAllows) return <p className="text-sm text-muted-foreground">Bring-your-own Spotify app is on Pro and Label plans.</p>;
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const r = await submit("/api/admin/org/spotify", "POST", { clientId, clientSecret }); if (r.ok) { setClientId(""); setClientSecret(""); } }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Client ID</Label><Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={status !== "none" ? "•••••••• saved (enter to replace)" : "32 characters"} disabled={!canEdit} autoComplete="off" /></div>
        <div className="space-y-2"><Label>Client Secret</Label><Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={status !== "none" ? "•••••••• saved" : "32 characters"} disabled={!canEdit} autoComplete="off" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !canEdit || !clientId || !clientSecret}>{busy && <Loader2 className="animate-spin" />} Save &amp; verify</Button>
        {status !== "none" && canEdit && <Button type="button" variant="outline" onClick={() => submit("/api/admin/org/spotify", "DELETE")}>Disconnect</Button>}
        {!canEdit && <span className="text-sm text-muted-foreground">Only the label owner can change this.</span>}
        <Msg msg={msg} />
      </div>
    </form>
  );
}

export function SpotifyButtonToggle({ initial, canEdit }: { initial: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(initial);
  const { busy, msg, submit } = useSubmit();
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={on}
          disabled={!canEdit || busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setOn(next);
            const r = await submit("/api/admin/org/spotify", "PATCH", { publicButton: next });
            if (!r.ok) setOn(!next);
          }}
        />
        <span>
          <strong>Show &quot;Pre-save on Spotify&quot; to everyone</strong>
          <span className="block text-muted-foreground">Leave off while your app is in Development Mode: fans who aren&apos;t allowlisted would get a Spotify error. When off, the button only appears on links ending in <code>?spotify=1</code>, for the people you&apos;ve allowlisted.</span>
        </span>
      </label>
      <Msg msg={msg} />
    </div>
  );
}

/** adminOnly: the Team section invites admins; artists are added on the roster and invited from their profile. */
export function InviteForm({ allowAdmin, adminOnly = false }: { allowAdmin: boolean; adminOnly?: boolean }) {
  const [email, setEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [role, setRole] = useState(adminOnly ? "admin" : "artist");
  const [link, setLink] = useState<string | null>(null);
  const { busy, msg, submit } = useSubmit();
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await submit("/api/admin/artists", "POST", { email, artistName, role }); if (r.ok) { setLink(r.data.link); setEmail(""); setArtistName(""); } }}>
      <div className={`grid gap-3 ${adminOnly ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_1fr_140px_auto]"}`}>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={adminOnly ? "teammate@label.com" : "artist@email.com"} />
        {!adminOnly && <Input value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Artist name" />}
        {!adminOnly && (
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="artist">Artist</option>
            <option value="admin" disabled={!allowAdmin}>Admin{allowAdmin ? "" : " (Label plan)"}</option>
          </Select>
        )}
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Invite</Button>
      </div>
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <span>Send this link to them (valid 14 days):</span>
          <code className="min-w-0 max-w-full truncate rounded bg-black/40 px-2 py-1 text-xs">{link}</code>
          <CopyButton value={link} />
        </div>
      )}
      {!link && <Msg msg={msg} />}
    </form>
  );
}

export function RemoveMemberButton({ userId, inviteId }: { userId?: string; inviteId?: string }) {
  const { busy, submit } = useSubmit();
  const q = userId ? `userId=${userId}` : `inviteId=${inviteId}`;
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm("Remove access?") && submit(`/api/admin/artists?${q}`, "DELETE")}>
      Remove
    </Button>
  );
}
