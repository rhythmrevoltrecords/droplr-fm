"use client";
import { ImagePlus, Loader2, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { ARTIST_BIO_MAX, ARTIST_STATUS_LABELS, ARTIST_STATUSES, initials, PRESS_PHOTOS_MAX, SOCIAL_KEYS, SOCIAL_LABELS, type SocialKey } from "@/lib/artist-fields";
import { CopyButton } from "./copy-button";
import { ASPECT_16_9, ASPECT_4_5, ASPECT_ORIGINAL, ASPECT_SQUARE, IMAGE_HINT, useImageUpload } from "./image-crop-dialog";

type Msg = { ok: boolean; text: string } | null;
const MsgText = ({ msg }: { msg: Msg }) => (msg ? <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span> : null);
const textareaClass = "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function sendJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as { error?: string; id?: string; link?: string } };
}

/** Square photo or an initials tile tinted with the artist's accent colour. */
export function ArtistAvatar({ name, photoUrl, accentColor, size = 56 }: { name: string; photoUrl?: string | null; accentColor?: string | null; size?: number }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover ring-1 ring-white/10" style={{ width: size, height: size }} />;
  }
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-xl font-semibold text-white/90 ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(135deg, ${accentColor || "#6D28D9"}, #18181b)` }}
    >
      {initials(name)}
    </div>
  );
}

// ---------- roster: add artist ----------

export function AddArtistForm({ limitReached }: { limitReached?: string }) {
  const router = useRouter();
  const [v, setV] = useState({ name: "", email: "", status: "active", genre: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (limitReached) {
    return <p className="text-sm text-muted-foreground">{limitReached} <a href="/admin/settings/billing" className="text-violet-400 underline">Upgrade</a></p>;
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await sendJson("/api/admin/roster", "POST", v);
        if (!r.ok) {
          setBusy(false);
          return setMsg({ ok: false, text: r.data.error ?? "Couldn't add artist" });
        }
        router.push(`/admin/artists/${r.data.id}?created=1`);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_140px_1fr_auto]">
        <Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Artist name" aria-label="Artist name" maxLength={120} />
        <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="Email (optional)" aria-label="Email" />
        <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} aria-label="Status">
          {ARTIST_STATUSES.map((s) => <option key={s} value={s}>{ARTIST_STATUS_LABELS[s]}</option>)}
        </Select>
        <Input value={v.genre} onChange={(e) => setV({ ...v, genre: e.target.value })} placeholder="Genre (optional)" aria-label="Genre" maxLength={60} />
        <Button type="submit" disabled={busy || !v.name.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add artist</Button>
      </div>
      <MsgText msg={msg} />
    </form>
  );
}

// ---------- profile editor (label + artist self-service) ----------

export type ArtistEditorValues = {
  name: string;
  status: string;
  genre: string;
  location: string;
  bio: string;
  website: string;
  socialLinks: Partial<Record<SocialKey, string>>;
  photoUrl: string;
  accentColor: string;
  pressPhotoUrls: string[];
  // Label-only: the artist page passes blanks and never renders or sends these.
  email: string;
  phone: string;
  spotifyArtistId: string;
  monthlyListeners: string;
  followers: string;
  notes: string;
  signedAt: string;
};

const SELF_FIELDS = ["bio", "genre", "location", "website", "socialLinks", "photoUrl", "accentColor", "pressPhotoUrls"] as const;

function toNumber(raw: string): number | null | "invalid" {
  const t = raw.replace(/[,\s]/g, "");
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : "invalid";
}

export function ArtistProfileEditor({ mode, artistId, initial, statsUpdated }: { mode: "label" | "artist"; artistId?: string; initial: ArtistEditorValues; statsUpdated?: string | null }) {
  const router = useRouter();
  const label = mode === "label";
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(saved), [v, saved]);
  const set = <K extends keyof ArtistEditorValues>(k: K, val: ArtistEditorValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const uploadUrl = label ? "/api/admin/upload-cover" : "/api/artist/upload-photo";

  const photo = useImageUpload({
    endpoint: uploadUrl,
    purpose: "avatar",
    aspects: [ASPECT_SQUARE],
    maxEdge: 1600,
    round: true,
    title: "Crop photo",
    onUploaded: (img) => {
      setMsg(null);
      setV((x) => ({ ...x, photoUrl: img.url, accentColor: img.accentColor ?? x.accentColor }));
    },
  });
  const press = useImageUpload({
    endpoint: uploadUrl,
    purpose: "press",
    aspects: [ASPECT_ORIGINAL, ASPECT_SQUARE, ASPECT_4_5, ASPECT_16_9],
    maxEdge: 2400,
    title: "Crop press photo",
    multiple: true,
    allowSkip: true,
    maxFiles: PRESS_PHOTOS_MAX - v.pressPhotoUrls.length,
    // Each file lands as soon as it uploads, so cancelling later ones doesn't lose earlier ones.
    onUploaded: (img) => setV((x) => (x.pressPhotoUrls.length >= PRESS_PHOTOS_MAX ? x : { ...x, pressPhotoUrls: [...x.pressPhotoUrls, img.url] })),
  });
  const uploading = photo.busy || press.busy;

  async function save() {
    setMsg(null);
    let body: Record<string, unknown>;
    if (label) {
      const monthlyListeners = toNumber(v.monthlyListeners);
      const followers = toNumber(v.followers);
      if (monthlyListeners === "invalid" || followers === "invalid") return setMsg({ ok: false, text: "Stats must be whole numbers" });
      body = { ...v, monthlyListeners, followers };
    } else {
      body = Object.fromEntries(SELF_FIELDS.map((k) => [k, v[k]]));
    }
    setBusy(true);
    const r = await sendJson(label ? `/api/admin/roster/${artistId}` : "/api/artist/profile", "PATCH", body);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.data.error ?? "Couldn't save" });
    setSaved(v);
    setMsg({ ok: true, text: "Saved" });
    router.refresh();
  }

  const field = (k: "name" | "genre" | "location" | "website" | "email" | "phone" | "spotifyArtistId", text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={`f-${k}`}>{text}</Label>
      <Input id={`f-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );
  const labelOnly = <Badge variant="secondary" className="ml-2 align-middle">Label only</Badge>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <ArtistAvatar name={v.name || "?"} photoUrl={v.photoUrl} accentColor={v.accentColor} size={96} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="h-9 px-3 text-sm" onClick={photo.pick} disabled={uploading}>
                    {photo.uploading ? <Loader2 className="animate-spin" /> : <Upload />} {v.photoUrl ? "Replace photo" : "Upload photo"}
                  </Button>
                  {photo.ui}
                  {v.photoUrl && <Button type="button" size="sm" variant="ghost" onClick={() => set("photoUrl", "")}>Remove</Button>}
                  <p className="w-full text-xs text-muted-foreground">{IMAGE_HINT}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {label ? field("name", "Name", { maxLength: 120, required: true }) : (
                  <div className="space-y-2"><Label>Name</Label><p className="flex h-10 items-center text-sm text-muted-foreground">{v.name} · set by your label</p></div>
                )}
                {label ? (
                  <div className="space-y-2">
                    <Label htmlFor="f-status">Status</Label>
                    <Select id="f-status" value={v.status} onChange={(e) => set("status", e.target.value)}>
                      {ARTIST_STATUSES.map((s) => <option key={s} value={s}>{ARTIST_STATUS_LABELS[s]}</option>)}
                    </Select>
                  </div>
                ) : null}
                {field("genre", "Genre", { maxLength: 60, placeholder: "UK garage" })}
                {field("location", "Location", { maxLength: 120, placeholder: "Brisbane, AU" })}
                {field("website", "Website", { placeholder: "https://…", inputMode: "url" })}
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="f-bio">Bio</Label>
                    <span className={`text-xs tabular-nums ${v.bio.length > ARTIST_BIO_MAX - 100 ? "text-amber-400" : "text-muted-foreground"}`}>{v.bio.length} / {ARTIST_BIO_MAX}</span>
                  </div>
                  <textarea id="f-bio" value={v.bio} maxLength={ARTIST_BIO_MAX} rows={7} onChange={(e) => set("bio", e.target.value)} placeholder="Where they're from, what they sound like, recent wins." className={textareaClass} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Links</CardTitle><CardDescription>Full https:// links to each profile.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => (
                <div key={k} className="min-w-0 space-y-2">
                  <Label htmlFor={`s-${k}`}>{SOCIAL_LABELS[k]}</Label>
                  <Input id={`s-${k}`} inputMode="url" placeholder="https://…" value={v.socialLinks[k] ?? ""} onChange={(e) => set("socialLinks", { ...v.socialLinks, [k]: e.target.value })} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Press photos</CardTitle>
              <CardDescription>Up to {PRESS_PHOTOS_MAX}. {v.pressPhotoUrls.length} added.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {v.pressPhotoUrls.map((u, i) => (
                  <div key={u + i} className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`Press photo ${i + 1}`} className="h-full w-full object-cover" />
                    <button type="button" aria-label="Remove photo" onClick={() => set("pressPhotoUrls", v.pressPhotoUrls.filter((_, j) => j !== i))} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-black">
                      <X className="h-4 w-4" />
                    </button>
                    <a href={u} target="_blank" rel="noreferrer" className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white opacity-0 transition group-hover:opacity-100">Open</a>
                  </div>
                ))}
                {v.pressPhotoUrls.length < PRESS_PHOTOS_MAX && (
                  <button type="button" onClick={press.pick} disabled={uploading} className="grid aspect-square place-items-center rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-accent disabled:opacity-50">
                    <span className="flex flex-col items-center gap-1">
                      {press.uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                      {press.uploading ? "Uploading" : "Add photos"}
                    </span>
                  </button>
                )}
              </div>
              {press.ui}
              <p className="mt-3 text-xs text-muted-foreground">{IMAGE_HINT}</p>
            </CardContent>
          </Card>
        </div>

        {label && (
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader><CardTitle>Contact {labelOnly}</CardTitle><CardDescription>Never shown to the artist or fans.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {field("email", "Email", { type: "email", placeholder: "artist@email.com" })}
                {field("phone", "Phone", { type: "tel", maxLength: 40 })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Stats</CardTitle><CardDescription>{statsUpdated ? `Updated ${statsUpdated}` : "Not recorded yet"}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {field("spotifyArtistId", "Spotify artist ID", { placeholder: "22 characters", maxLength: 22 })}
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 space-y-2"><Label htmlFor="f-ml">Monthly listeners</Label><Input id="f-ml" inputMode="numeric" value={v.monthlyListeners} onChange={(e) => set("monthlyListeners", e.target.value)} /></div>
                  <div className="min-w-0 space-y-2"><Label htmlFor="f-fl">Followers</Label><Input id="f-fl" inputMode="numeric" value={v.followers} onChange={(e) => set("followers", e.target.value)} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Label notes {labelOnly}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <textarea aria-label="Label notes" value={v.notes} maxLength={5000} rows={5} onChange={(e) => set("notes", e.target.value)} placeholder="Deal terms, next steps, who manages them…" className={textareaClass} />
                <div className="space-y-2"><Label htmlFor="f-signed">Signed</Label><Input id="f-signed" type="date" value={v.signedAt} onChange={(e) => set("signedAt", e.target.value)} /></div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button onClick={save} disabled={busy || uploading || (label && !v.name.trim())}>{busy && <Loader2 className="animate-spin" />} Save profile</Button>
        {msg ? <MsgText msg={msg} /> : dirty ? <span className="text-sm text-muted-foreground">Unsaved changes</span> : null}
      </div>
    </div>
  );
}

// ---------- login access ----------

export type LoginState = { kind: "login"; email: string } | { kind: "invited"; email: string; expires: string } | { kind: "none" };

export function ArtistLoginAccess({ artistId, state, isOwner, defaultEmail }: { artistId: string; state: LoginState; isOwner: boolean; defaultEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function invite() {
    setBusy(true);
    setMsg(null);
    const r = await sendJson(`/api/admin/roster/${artistId}/invite`, "POST", { email });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.data.error ?? "Couldn't create invite" });
    setLink(r.data.link ?? null);
    router.refresh();
  }
  async function revoke() {
    if (!confirm("Delete this artist's login? Their profile and releases stay on the roster.")) return;
    setBusy(true);
    const r = await sendJson(`/api/admin/roster/${artistId}/revoke-login`, "POST");
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.data.error ?? "Couldn't remove login" });
    router.refresh();
  }

  if (link) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
        <p>Send this link to them. It works once and expires in 14 days, and it won&apos;t be shown again.</p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code className="min-w-0 max-w-full truncate rounded bg-black/40 px-2 py-1 text-xs">{link}</code>
          <CopyButton value={link} />
        </div>
      </div>
    );
  }

  if (state.kind === "login") {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="success">Has login</Badge><span className="min-w-0 break-all text-muted-foreground">{state.email}</span></div>
        <p className="text-muted-foreground">They see their own releases, stats and this profile (minus contact details and label notes).</p>
        {isOwner ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={revoke}>{busy && <Loader2 className="animate-spin" />} Remove login</Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only the label owner can remove a login.</p>
        )}
        <MsgText msg={msg} />
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {state.kind === "invited" ? (
        <>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="warning">Invited</Badge><span className="min-w-0 break-all text-muted-foreground">{state.email} · expires {state.expires}</span></div>
          <p className="text-muted-foreground">Invite links are only shown once. To resend, create a new invite: the old link stops working.</p>
        </>
      ) : (
        <p className="text-muted-foreground">No login. Invite them to see their releases and stats, and keep this profile up to date.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="artist@email.com" aria-label="Invite email" />
        <Button className="shrink-0" disabled={busy || !email.trim()} onClick={invite}>{busy && <Loader2 className="animate-spin" />} {state.kind === "invited" ? "Create new invite" : "Invite to log in"}</Button>
      </div>
      <MsgText msg={msg} />
    </div>
  );
}

// ---------- danger zone ----------

export function DeleteArtistButton({ artistId, name, hasLogin }: { artistId: string; name: string; hasLogin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="destructive"
        disabled={busy || hasLogin}
        onClick={async () => {
          if (!confirm(`Delete ${name} from the roster? Their releases stay, unassigned.`)) return;
          setBusy(true);
          const r = await sendJson(`/api/admin/roster/${artistId}`, "DELETE");
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.data.error ?? "Couldn't delete" });
          router.push("/admin/artists");
          router.refresh();
        }}
      >
        {busy && <Loader2 className="animate-spin" />} Delete artist
      </Button>
      {hasLogin && <span className="text-sm text-muted-foreground">Remove their login first. Deleting a profile never deletes a login.</span>}
      <MsgText msg={msg} />
    </div>
  );
}
