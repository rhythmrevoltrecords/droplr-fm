"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type NewsDraft = {
  id?: string;
  subject: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  filterCountry: string;
  filterListenOn: string;
  filterReleaseId: string;
};

type Option = { value: string; label: string };

export function NewsComposer({
  draft,
  countries,
  stores,
  releases,
  orgName,
  timezone,
  status,
}: {
  draft: NewsDraft;
  countries: Option[];
  stores: Option[];
  releases: Option[];
  orgName: string;
  timezone: string;
  status: string;
}) {
  const router = useRouter();
  const [d, setD] = useState(draft);
  const [id, setId] = useState(draft.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [when, setWhen] = useState("");
  const locked = status !== "draft";

  const set = <K extends keyof NewsDraft>(k: K, v: NewsDraft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setError(null);
    setNote(null);
  };

  // Live audience size as the filters change.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (d.filterCountry) p.set("country", d.filterCountry);
    if (d.filterListenOn) p.set("store", d.filterListenOn);
    if (d.filterReleaseId) p.set("release", d.filterReleaseId);
    return p.toString();
  }, [d.filterCountry, d.filterListenOn, d.filterReleaseId]);

  useEffect(() => {
    let live = true;
    setCount(null);
    fetch(`/api/admin/news${query ? `?${query}` : ""}`)
      .then((r) => r.json())
      .then((j) => live && setCount(typeof j.recipients === "number" ? j.recipients : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [query]);

  async function save(): Promise<string | null> {
    const payload = {
      subject: d.subject.trim(),
      body: d.body.trim(),
      buttonLabel: d.buttonLabel.trim() || null,
      buttonUrl: d.buttonUrl.trim() || null,
      filterCountry: d.filterCountry || null,
      filterListenOn: d.filterListenOn || null,
      filterReleaseId: d.filterReleaseId || null,
    };
    const res = id
      ? await fetch(`/api/admin/news/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/admin/news", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok) {
      setError(j.error ?? "Couldn't save that.");
      return null;
    }
    const savedId = id ?? j.id!;
    if (!id) setId(savedId);
    return savedId;
  }

  async function act(action: "send" | "schedule" | "test", label: string) {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      const savedId = await save();
      if (!savedId) return;
      const res = await fetch(`/api/admin/news/${savedId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(action === "schedule" && { scheduledForLocal: when }) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; to?: string; recipients?: number };
      if (!res.ok) {
        setError(j.error ?? "That didn't work.");
        return;
      }
      if (action === "test") setNote(`Test sent to ${j.to}. Check it looks right before you send for real.`);
      else {
        router.push(`/admin/news/${savedId}`);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveOnly() {
    setBusy("Saving");
    setError(null);
    setNote(null);
    const savedId = await save();
    setBusy(null);
    if (savedId) {
      setNote("Draft saved.");
      if (!draft.id) router.replace(`/admin/news/${savedId}`);
      router.refresh();
    }
  }

  const ready = d.subject.trim().length > 0 && d.body.trim().length > 0;
  const audience = count === null ? "counting…" : `${count.toLocaleString()} ${count === 1 ? "fan" : "fans"}`;

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">This only goes to fans who opted in to news.</strong> Everyone who pre-saved agreed to hear about
          that one release, and droplr sends that email for you. Emailing the rest about anything else breaks the Spam Act. Every fan below said
          yes to news and new music from {orgName}, and every email carries an unsubscribe link.
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The email</CardTitle>
          <CardDescription>Plain words work best. No HTML — line breaks become paragraphs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={d.subject} maxLength={120} disabled={locked} onChange={(e) => set("subject", e.target.value)} placeholder="New single out Friday" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              value={d.body}
              maxLength={5000}
              disabled={locked}
              onChange={(e) => set("body", e.target.value)}
              rows={9}
              placeholder={`Hey,\n\nQuick one — the new track is out this Friday and I wanted you to hear it first.\n\nCheers,\n${orgName}`}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">{d.body.length}/5000</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="btnLabel">Button text (optional)</Label>
              <Input id="btnLabel" value={d.buttonLabel} maxLength={40} disabled={locked} onChange={(e) => set("buttonLabel", e.target.value)} placeholder="Listen now" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="btnUrl">Button link</Label>
              <Input id="btnUrl" value={d.buttonUrl} disabled={locked} onChange={(e) => set("buttonUrl", e.target.value)} placeholder="https://" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Who gets it</CardTitle>
          <CardDescription>Everyone opted in, unless you narrow it down.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={d.filterCountry} disabled={locked} onChange={(e) => set("filterCountry", e.target.value)} aria-label="Country">
              <option value="">All countries</option>
              {countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <Select value={d.filterListenOn} disabled={locked} onChange={(e) => set("filterListenOn", e.target.value)} aria-label="Store">
              <option value="">Any store</option>
              {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Select value={d.filterReleaseId} disabled={locked} onChange={(e) => set("filterReleaseId", e.target.value)} aria-label="Release">
              <option value="">Any release</option>
              {releases.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <p className={cn("text-sm", count === 0 ? "text-amber-400" : "text-muted-foreground")}>
            This will reach <strong className="text-foreground">{audience}</strong>
            {count === 0 ? " — nobody matches yet, so there's nothing to send." : "."}
          </p>
        </CardContent>
      </Card>

      {error && <Card className="border-red-500/40 bg-red-500/5"><CardContent className="p-4 text-sm text-red-300">{error}</CardContent></Card>}
      {note && <Card className="border-emerald-500/40 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-300">{note}</CardContent></Card>}

      {!locked && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Send</CardTitle>
            <CardDescription>Send a test to yourself first. Times are {timezone.replace(/_/g, " ")}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!!busy || !ready} onClick={saveOnly}>{busy === "Saving" ? "Saving…" : "Save draft"}</Button>
              <Button variant="secondary" disabled={!!busy || !ready} onClick={() => act("test", "Test")}>{busy === "Test" ? "Sending…" : "Send test to me"}</Button>
              <Button disabled={!!busy || !ready || count === 0} onClick={() => act("send", "Send")}>{busy === "Send" ? "Sending…" : `Send now to ${audience}`}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-auto" aria-label="Send at" />
              <Button variant="secondary" disabled={!!busy || !ready || !when || count === 0} onClick={() => act("schedule", "Schedule")}>
                {busy === "Schedule" ? "Scheduling…" : "Schedule"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
