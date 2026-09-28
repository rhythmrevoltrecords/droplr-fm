"use client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";

export type ContestFormState = {
  headline: string;
  brief: string;
  prize: string;
  rulesUrl: string;
  published: boolean;
  opensAtLocal: string;
  closesAtLocal: string;
  winnerAnnouncedAtLocal: string;
  maxPerEntrant: number;
};

/**
 * Setting up a remix contest.
 *
 * The one thing this form is careful about is saying out loud what droplr does and doesn't do with
 * entries, at the moment the label decides to run one. A label that thinks droplr is hosting the
 * audio will write "upload your remix here" in the brief, and then field emails from confused
 * entrants — so the panel says it before the brief box, not in a help article.
 */
export function ContestSetup({
  releaseId, initial, exists, entryCount, locationLabel = "Brisbane",
}: {
  releaseId: string;
  initial: ContestFormState;
  exists: boolean;
  entryCount: number;
  locationLabel?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof ContestFormState>(k: K, v: ContestFormState[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/releases/${releaseId}/contest`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: f.headline,
        brief: f.brief.trim() || null,
        prize: f.prize.trim() || null,
        rulesUrl: f.rulesUrl.trim() || null,
        published: f.published,
        opensAtLocal: f.opensAtLocal || null,
        closesAtLocal: f.closesAtLocal,
        winnerAnnouncedAtLocal: f.winnerAnnouncedAtLocal || null,
        maxPerEntrant: Number(f.maxPerEntrant) || 1,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? "Saved" : (j.error ?? "Couldn't save that.") });
    if (res.ok) router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this contest? Only possible while nobody has entered.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/releases/${releaseId}/contest`, { method: "DELETE" });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (res.ok) router.refresh();
    else setMsg({ ok: false, text: j.error ?? "Couldn't delete that." });
  }

  return (
    <Card id="contest" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">Remix contest</CardTitle>
        <CardDescription>
          Entrants paste a link to their remix — SoundCloud, Drive, Dropbox, wherever they put it.{" "}
          <strong className="text-foreground">droplr never holds their audio</strong>, so don&apos;t write &quot;upload
          here&quot; in the brief. You get the link, the name, the email and a timestamped record of what they declared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>What it&apos;s called</Label>
          <Input value={f.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Remix contest: Mess It Up" maxLength={120} />
        </div>

        <div className="space-y-2">
          <Label>The brief <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <textarea
            rows={4}
            value={f.brief}
            onChange={(e) => set("brief", e.target.value)}
            maxLength={4000}
            placeholder="What you're after, what's off limits, who's judging, when you'll announce."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Prize <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={f.prize} onChange={(e) => set("prize", e.target.value)} placeholder="Signed and released on the label" maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label>Full rules link <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={f.rulesUrl} onChange={(e) => set("rulesUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-2">
            <Label>Opens ({locationLabel}) <span className="font-normal text-muted-foreground">— blank means straight away</span></Label>
            <Input type="datetime-local" value={f.opensAtLocal} onChange={(e) => set("opensAtLocal", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Entries close ({locationLabel})</Label>
            <Input type="datetime-local" value={f.closesAtLocal} onChange={(e) => set("closesAtLocal", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Winner announced ({locationLabel}) <span className="font-normal text-muted-foreground">— blank until you&apos;re ready</span></Label>
            <Input type="datetime-local" value={f.winnerAnnouncedAtLocal} onChange={(e) => set("winnerAnnouncedAtLocal", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Entries per person</Label>
            <Select value={String(f.maxPerEntrant)} onChange={(e) => set("maxPerEntrant", Number(e.target.value))}>
              <option value="1">One each</option>
              <option value="2">Two</option>
              <option value="3">Three</option>
              <option value="5">Five</option>
            </Select>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={f.published} onChange={(e) => set("published", e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="font-medium">Show it on the release page</span>
            <span className="block text-xs text-muted-foreground">
              Off keeps it a draft — nothing appears publicly, and the form takes nothing.
            </span>
          </span>
        </label>

        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-300"}`}>{msg.text}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy || !f.headline.trim() || !f.closesAtLocal}>
            {busy && <Loader2 className="animate-spin" />} {exists ? "Save" : "Create the contest"}
          </Button>
          {exists && entryCount === 0 && (
            <Button variant="ghost" onClick={remove} disabled={busy}>Delete</Button>
          )}
          {exists && entryCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {entryCount} {entryCount === 1 ? "entry" : "entries"} in — it can be closed, but not deleted.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
