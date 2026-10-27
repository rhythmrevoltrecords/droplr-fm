"use client";
import { Loader2, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { ASPECT_SQUARE, IMAGE_HINT, useImageUpload } from "./image-crop-dialog";
import { GATE_PLATFORMS, SOUNDCLOUD_ACTION_ORDER, effectiveProof, enforcementNote, soundcloudGroupOf, withSoundcloudGroup, type SoundCloudGroup, type Enforcement, type GateAction, type GatePlatform } from "@/lib/gate-steps";
import { slugify } from "@/lib/utils";

type Step = { platform: GatePlatform; action: GateAction; target: string; required: boolean };

export type DownloadFormValues = {
  id?: string;
  title: string;
  artistName: string;
  coverUrl: string;
  slug: string;
  downloadUrl: string;
  downloadNote: string;
  isPublic: boolean;
  steps: Step[];
};

const EMPTY: DownloadFormValues = {
  title: "", artistName: "", coverUrl: "", slug: "", downloadUrl: "", downloadNote: "", isPublic: true,
  // Email first by default: it's the only step that leaves the artist with something they keep.
  steps: [{ platform: "email", action: "email", target: "", required: true }],
};

/**
 * Build a download gate.
 *
 * The one thing this form does that competitors' don't: every step says, to the artist, what it
 * can and can't prove. They're deciding what to ask their own fans to do, so they should know
 * which of those asks is checked and which is a link and a hope.
 */
export function DownloadForm({
  initial,
  soundcloudConnected,
  soundcloudFollow,
  enforcement = "enforced",
}: {
  initial?: DownloadFormValues;
  soundcloudConnected: boolean;
  /** Where a new SoundCloud card's follow starts: the artist profile's SoundCloud link, or "" (required, so no caller can forget it). */
  soundcloudFollow: string;
  /**
   * Whether droplr can still perform a performed step. A label must never be shown a "Verified"
   * badge for a step that is currently completing on a click — that badge is the reason they chose
   * droplr, and a stale one is worse than no badge at all.
   */
  enforcement?: Enforcement;
}) {
  const router = useRouter();
  const [v, setV] = useState<DownloadFormValues>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!v.id;
  const set = <K extends keyof DownloadFormValues>(k: K, val: DownloadFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  // Same uploader, crop dialog and server-side re-encode the release form uses: the gate's artwork
  // is shown to fans on a public page, so it goes through processUpload like every other image.
  const cover = useImageUpload({
    endpoint: "/api/admin/upload-cover",
    purpose: "cover",
    aspects: [ASPECT_SQUARE],
    maxEdge: 1600,
    title: "Crop artwork",
    onUploaded: (img) => set("coverUrl", img.url),
  });

  const used = new Set(v.steps.map((s) => s.platform));
  // SoundCloud is one card: a profile to follow, one link (track or set) to like and repost, and a
  // tick for each. Every other platform is one step each.
  const scGroup = soundcloudGroupOf(v.steps);
  const addable = (Object.keys(GATE_PLATFORMS) as GatePlatform[]).filter((p) => !used.has(p));
  const setScGroup = (g: SoundCloudGroup | null) =>
    set("steps", withSoundcloudGroup(v.steps, g, (action, target) => ({ platform: "soundcloud" as GatePlatform, action, target, required: true })));

  function addStep(platform: GatePlatform) {
    if (platform === "soundcloud") return setScGroup({ follow: soundcloudFollow, item: "", actions: ["follow", "like", "repost"] });
    const spec = GATE_PLATFORMS[platform];
    set("steps", [...v.steps, { platform, action: spec.actions[0], target: "", required: true }]);
  }
  function patchStep(i: number, patch: Partial<Step>) {
    set("steps", v.steps.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      title: v.title, artistName: v.artistName, coverUrl: v.coverUrl,
      downloadUrl: v.downloadUrl, downloadNote: v.downloadNote || null, isPublic: v.isPublic,
      steps: v.steps.map((s) => ({ platform: s.platform, action: s.action, target: s.target || null, required: s.required })),
      ...(editing ? {} : { slug: slugify(v.slug || v.title) }),
    };
    const res = await fetch(editing ? `/api/admin/downloads/${v.id}` : "/api/admin/downloads", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't save that. Try again.");
      return;
    }
    const json = await res.json().catch(() => null);
    router.push(editing ? "/admin/downloads" : `/admin/downloads/${json?.id ?? ""}`);
    router.refresh();
  }

  // Deleting cascades to the emails this gate collected, so the confirmation says that and names
  // the way to take a gate down without losing anything.
  async function remove() {
    if (!v.id) return;
    if (!confirm("Delete this gate? The email addresses it collected are deleted with it. To take it down and keep them, untick Live and save instead.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/downloads/${v.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't delete that. Try again.");
      return;
    }
    router.push("/admin/downloads");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Name</Label>
            <Input id="title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Edit Pack Vol. 1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="artistName">Artist</Label>
            <Input id="artistName" value={v.artistName} onChange={(e) => set("artistName", e.target.value)} placeholder="Ototo" />
          </div>
        </div>

        {!editing && (
          <div className="space-y-1.5">
            <Label htmlFor="slug">Link</Label>
            <Input id="slug" value={v.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugify(v.title) || "edit-pack-vol-1"} />
            <p className="text-xs text-muted-foreground">The last part of the URL. Can&apos;t be changed later — shared links would break.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Artwork</Label>
          <div className="flex items-start gap-3">
            {v.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.coverUrl} alt="" className="size-16 shrink-0 rounded-md border border-border object-cover" />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
                <Upload className="size-4" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="shrink-0" onClick={cover.pick} disabled={cover.busy}>
                  {cover.uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                  {v.coverUrl ? "Replace artwork" : "Upload artwork"}
                </Button>
                {v.coverUrl && (
                  <Button type="button" variant="ghost" className="shrink-0" onClick={() => set("coverUrl", "")} disabled={cover.busy}>
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{IMAGE_HINT}</p>
            </div>
            {cover.ui}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="downloadUrl">Where the files are</Label>
          <Input id="downloadUrl" value={v.downloadUrl} onChange={(e) => set("downloadUrl", e.target.value)} placeholder="https://drive.google.com/…" />
          <p className="text-xs text-muted-foreground">
            droplr keeps the link, not the files — they stay in your own Drive, Dropbox or host. Nobody sees this
            address until they&apos;ve finished the steps.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="downloadNote">What they&apos;re getting <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="downloadNote" value={v.downloadNote} onChange={(e) => set("downloadNote", e.target.value)} placeholder="320 MP3 + WAV, 412MB" maxLength={200} />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">What they do first</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every step is somewhere you can lose someone. Two is usually the most that&apos;s worth it.
          </p>
        </div>

        <ul className="space-y-3">
          {v.steps.map((s, i) => {
            if (s.platform === "soundcloud") {
              if (v.steps.findIndex((x) => x.platform === "soundcloud") !== i || !scGroup) return null;
              return (
                <SoundCloudCard
                  key="soundcloud"
                  group={scGroup}
                  onChange={setScGroup}
                  enforcement={enforcement}
                  missingKey={!soundcloudConnected && enforcement === "enforced"}
                />
              );
            }
            const spec = GATE_PLATFORMS[s.platform];
            const proof = effectiveProof(s.platform, enforcement);
            const degraded = enforcementNote(s.platform, enforcement);
            // A missing key only matters while the action is actually being performed; once the
            // step is a plain visit there is nothing to connect.
            return (
              <li key={`${s.platform}-${i}`} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{spec.label}</span>
                  {proof === "performed" && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">Verified</span>}
                  {proof === "given" && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">You keep this</span>}
                  {proof === "unverified" && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">Can&apos;t be checked</span>}
                  <button type="button" onClick={() => set("steps", v.steps.filter((_, n) => n !== i))} className="ml-auto text-muted-foreground hover:text-foreground" aria-label={`Remove ${spec.label} step`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{degraded ?? spec.note}</p>

                {spec.actions.length > 1 && (
                  <Select className="mt-2.5" value={s.action} onChange={(e) => patchStep(i, { action: e.target.value as GateAction })}>
                    {spec.actions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </Select>
                )}
                {spec.needsTarget && (
                  <Input
                    className="mt-2.5"
                    value={s.target}
                    onChange={(e) => patchStep(i, { target: e.target.value })}
                    placeholder="https://…"
                  />
                )}
              </li>
            );
          })}
          {v.steps.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No steps — anyone with the link gets the files straight away. That&apos;s fine, it just isn&apos;t a gate.
            </li>
          )}
        </ul>


        {addable.length > 0 && v.steps.length < 6 && (
          <div className="flex flex-wrap gap-2">
            {addable.map((p) => (
              <Button key={p} type="button" size="sm" variant="outline" onClick={() => addStep(p)}>
                <Plus className="h-3.5 w-3.5" /> {GATE_PLATFORMS[p].label}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={busy || !v.title || !v.downloadUrl || !v.coverUrl}>
          {busy && <Loader2 className="animate-spin" />}
          {editing ? "Save" : "Create download"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={v.isPublic} onChange={(e) => set("isPublic", e.target.checked)} className="h-4 w-4" />
          Live
        </label>
        {editing && (
          <Button variant="destructive" className="ml-auto" disabled={busy} onClick={() => void remove()}>
            Delete gate
          </Button>
        )}
      </div>
    </div>
  );
}

const SC_TICKS: Record<string, string> = { follow: "Follow", like: "Like", repost: "Repost" };

/**
 * One SoundCloud card. Follow takes a profile; like and repost share one link, a track or a set
 * (packs are often uploaded as sets). Fans connect SoundCloud once and droplr does everything ticked.
 */
function SoundCloudCard({
  group, onChange, enforcement, missingKey,
}: {
  group: SoundCloudGroup;
  onChange: (g: SoundCloudGroup | null) => void;
  enforcement: Enforcement;
  missingKey: boolean;
}) {
  const proof = effectiveProof("soundcloud", enforcement);
  const degraded = enforcementNote("soundcloud", enforcement);
  const toggle = (a: GateAction) => {
    const actions = group.actions.includes(a) ? group.actions.filter((x) => x !== a) : [...group.actions, a];
    onChange(actions.length ? { ...group, actions } : null);
  };
  const wantsItem = group.actions.includes("like") || group.actions.includes("repost");
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">SoundCloud</span>
        {proof === "performed"
          ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">Verified</span>
          : <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">Can&apos;t be checked</span>}
        <button type="button" onClick={() => onChange(null)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Remove SoundCloud step">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {degraded ?? "Fans connect SoundCloud once and droplr does everything you tick, for real."}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
        {SOUNDCLOUD_ACTION_ORDER.map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={group.actions.includes(a)} onChange={() => toggle(a)} />
            {SC_TICKS[a]}
          </label>
        ))}
      </div>
      {group.actions.includes("follow") && (
        <div className="mt-2.5 space-y-1">
          <span className="text-xs text-muted-foreground">Profile to follow</span>
          <Input value={group.follow} onChange={(e) => onChange({ ...group, follow: e.target.value })} placeholder="https://soundcloud.com/you" aria-label="SoundCloud profile to follow" />
        </div>
      )}
      {wantsItem && (
        <div className="mt-2.5 space-y-1">
          <span className="text-xs text-muted-foreground">Track or set to {group.actions.includes("like") && group.actions.includes("repost") ? "like and repost" : group.actions.includes("like") ? "like" : "repost"} (a pack uploaded as a set works)</span>
          <Input value={group.item} onChange={(e) => onChange({ ...group, item: e.target.value })} placeholder="https://soundcloud.com/you/the-track or …/sets/the-pack" aria-label="SoundCloud track or set" />
        </div>
      )}
      {missingKey && (
        <p className="mt-2 text-xs text-amber-400">
          Connect SoundCloud in Settings → Integrations first, or this step won&apos;t show on the page.
        </p>
      )}
    </li>
  );
}
