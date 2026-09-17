"use client";
import { Check, ChevronsUpDown, Loader2, Monitor, Moon, Sun, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArtworkPageShell, GlassLink, type PublicTheme } from "@/components/public/artwork-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LOCATIONS } from "@/lib/time";
import { cn, slugify } from "@/lib/utils";
import { ASPECT_ORIGINAL, ASPECT_SQUARE, IMAGE_HINT, useImageUpload } from "./image-crop-dialog";

async function patchOrg(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/org", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, error: j.error as string | undefined, slug: j.slug as string | undefined };
}

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    const r = await patchOrg(body);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? "Saved" : r.error ?? "Couldn't save" });
    if (r.ok) router.refresh();
    return r;
  };
  return { busy, msg, save };
}

const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg ? <span className={cn("text-sm", msg.ok ? "text-emerald-400" : "text-red-400")}>{msg.text}</span> : null;

/* ---------------- Location / timezone combobox (searchable, touch friendly) ---------------- */

type Loc = { label: string; tz: string; region: string };

function allZones(): Loc[] {
  const extra: string[] = typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone") : [];
  const known = new Set(LOCATIONS.map((l) => l.tz));
  return [
    ...LOCATIONS,
    ...extra.filter((z) => !known.has(z) && z.includes("/")).map((z) => ({ label: z.split("/").pop()!.replace(/_/g, " "), tz: z, region: z.split("/")[0] })),
  ];
}

export function LocationPicker({ value, onChange }: { value: { label: string; tz: string }; onChange: (v: { label: string; tz: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const zones = useMemo(allZones, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? zones.filter((z) => `${z.label} ${z.region} ${z.tz}`.toLowerCase().includes(s)) : LOCATIONS;
    return list.slice(0, 60);
  }, [q, zones]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const now = (tz: string) => {
    try {
      return new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date());
    } catch {
      return "";
    }
  };

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/60 px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{value.label} <span className="text-muted-foreground">· {value.tz} · {now(value.tz)}</span></span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-card shadow-2xl">
          <div className="border-b p-2">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city or timezone…" className="h-10 text-base sm:text-sm" />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {results.map((z) => {
              const selected = z.tz === value.tz && z.label === value.label;
              return (
                <li key={`${z.label}-${z.tz}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange({ label: z.label, tz: z.tz });
                      setOpen(false);
                      setQ("");
                    }}
                    className={cn("flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent", selected && "bg-accent")}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{z.label} <span className="text-muted-foreground">· {z.region}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{now(z.tz)}</span>
                  </button>
                </li>
              );
            })}
            {!results.length && <li className="px-3 py-3 text-sm text-muted-foreground">No match. Try a nearby city.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------------- Section 1: Label identity ---------------- */

export function IdentityForm({ initial, siteHost, kind = "label" }: { initial: { name: string; slug: string; timezone: string; locationLabel: string; accentColor: string | null; logoUrl: string | null }; siteHost: string; kind?: "label" | "artist" }) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(true); // existing labels keep their slug unless edited
  const [loc, setLoc] = useState({ label: initial.locationLabel, tz: initial.timezone });
  const [accent, setAccent] = useState(initial.accentColor ?? "");
  const [logo, setLogo] = useState(initial.logoUrl ?? "");
  const { busy, msg, save } = useSave();
  const slugChanged = slugify(slug) !== initial.slug;

  const logoUpload = useImageUpload({
    endpoint: "/api/admin/upload-cover",
    purpose: "logo",
    aspects: [ASPECT_ORIGINAL, ASPECT_SQUARE],
    maxEdge: 1200,
    title: "Crop logo",
    onUploaded: (img) => setLogo(img.url),
  });

  return (
    <form
      className="min-w-0 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (slugChanged && !confirm(`Change your public URLs to ${siteHost}/${slugify(slug)}/…? Links using the old slug keep redirecting.`)) return;
        await save({ name, slug, timezone: loc.tz, locationLabel: loc.label, accentColor: accent, logoUrl: logo });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-2">
          <Label htmlFor="org-name">{kind === "artist" ? "Artist name" : "Label name"}</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-slug">Slug</Label>
          <div className="flex gap-2">
            <Input id="org-slug" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} className="font-mono" />
            <Button type="button" variant="outline" className="shrink-0" onClick={() => { setSlugTouched(false); setSlug(slugify(name)); }} title="Generate from name">From name</Button>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            Public URLs: <span className="font-mono text-foreground">{siteHost}/{slugify(slug) || (kind === "artist" ? "your-name" : "your-label")}/your-release</span>
            {slugChanged && <span className="text-amber-400"> · old links will redirect</span>}
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Location / timezone</Label>
          <LocationPicker value={loc} onChange={setLoc} />
          <p className="text-xs text-muted-foreground">Used for the date column, release date inputs and analytics days. Existing release times don&apos;t move. They&apos;re just shown in the new timezone.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-accent">Accent colour <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <div className="flex items-center gap-2">
            <label className="relative h-10 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border" style={{ background: accent || "transparent" }}>
              <input
                id="org-accent"
                type="color"
                value={accent || "#8b5cf6"}
                onChange={(e) => setAccent(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Pick accent colour"
              />
              {!accent && <span className="grid h-full place-items-center text-[10px] text-muted-foreground">none</span>}
            </label>
            <Input value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#8B5CF6" className="font-mono" maxLength={7} />
            {accent && <Button type="button" size="icon" variant="ghost" onClick={() => setAccent("")} aria-label="Clear accent"><X /></Button>}
          </div>
          <p className="text-xs text-muted-foreground">Admin top border, and the glow for any release that has no colour pulled from its artwork.</p>
        </div>

        <div className="space-y-2">
          <Label>{kind === "artist" ? "Logo or photo" : "Label logo"}</Label>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-border" /> : <div className="h-10 w-10 rounded-lg border border-dashed" />}
            <Button type="button" variant="outline" onClick={logoUpload.pick} disabled={logoUpload.busy}>
              {logoUpload.uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload
            </Button>
            {logoUpload.ui}
            {logo && <Button type="button" variant="ghost" size="sm" onClick={() => setLogo("")}>Remove</Button>}
          </div>
          <p className="text-xs text-muted-foreground">{IMAGE_HINT} Save identity to apply.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !name.trim() || !slugify(slug)}>{busy && <Loader2 className="animate-spin" />} Save identity</Button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}

/* ---------------- Section 2: Appearance ---------------- */

const THEMES = [
  { key: "dark", label: "Dark", icon: Moon },
  { key: "light", label: "Light", icon: Sun },
  { key: "system", label: "System", icon: Monitor },
] as const;

function ThemePreview({ theme, applyPublic, accent, orgName, locationLabel }: { theme: PublicTheme; applyPublic: boolean; accent: string | null; orgName: string; locationLabel: string }) {
  const adminClass = theme === "light" ? "theme-light" : theme === "system" ? "theme-system" : "theme-dark";
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
      {/* Admin table in the chosen theme */}
      <div className={cn(adminClass, "overflow-hidden rounded-xl border bg-background text-foreground")} style={accent ? { borderTop: `2px solid ${accent}` } : undefined}>
        <div className="border-b px-3 py-2 text-xs font-semibold">{orgName} · Releases</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-1.5">Release</th><th className="px-3 py-1.5">Date ({locationLabel.toUpperCase()})</th><th className="px-3 py-1.5 text-right">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {[["Two Step Theory", "26 Aug 2026", "402"], ["Night Bus Dubplate", "2 Oct 2026", "—"]].map(([t, d, c]) => (
              <tr key={t} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{t}</td><td className="px-3 py-2 text-muted-foreground">{d}</td><td className="px-3 py-2 text-right tabular-nums">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Smart link button: themed only when applied to public pages */}
      <div className="relative mx-auto h-[150px] w-[200px] overflow-hidden rounded-xl border sm:mx-0">
        {/* Real shell at phone width, scaled to 50% */}
        <div className="origin-top-left" style={{ width: 400, height: 300, transform: "scale(0.5)" }}>
          <ArtworkPageShell preview theme={applyPublic ? theme : "dark"} imageUrl="/demo/two-step-sky.svg" accentColor="#22D3EE">
            <div className="space-y-2.5">
              <GlassLink href="#" track={false} platform="beatport" />
              <GlassLink href="#" track={false} platform="soundcloud" label="SoundCloud (2)" />
              <GlassLink href="#" track={false} platform="custom" label="Merch & Vinyl" action="Buy" />
            </div>
          </ArtworkPageShell>
        </div>
      </div>
    </div>
  );
}

export function AppearanceForm({ initial, orgName, locationLabel, accent }: { initial: { themePreference: string; themePublic: boolean }; orgName: string; locationLabel: string; accent: string | null }) {
  const [theme, setTheme] = useState<PublicTheme>((["dark", "light", "system"].includes(initial.themePreference) ? initial.themePreference : "dark") as PublicTheme);
  const [applyPublic, setApplyPublic] = useState(initial.themePublic);
  const { busy, msg, save } = useSave();
  return (
    <form className="space-y-5" onSubmit={async (e) => { e.preventDefault(); await save({ themePreference: theme, themePublic: applyPublic }); }}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Theme</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-2 sm:max-w-md">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={theme === t.key}
              onClick={() => setTheme(t.key)}
              className={cn("flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm sm:flex-row", theme === t.key ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">System follows each viewer&apos;s device setting. Applies to your admin and artist dashboards.</p>
      </fieldset>

      <label className="flex min-h-[44px] items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" checked={applyPublic} onChange={(e) => setApplyPublic(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
        <span>
          <span className="font-medium">Apply theme to public smart links</span>
          <span className="block text-muted-foreground">Off: fan pages keep the signature look (artwork-colour glow on a black gradient). On: they follow the theme above.</span>
        </span>
      </label>

      <div>
        <div className="mb-2 text-sm font-medium">Preview</div>
        <ThemePreview theme={theme} applyPublic={applyPublic} accent={accent} orgName={orgName} locationLabel={locationLabel} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save appearance</Button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}
