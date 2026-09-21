import Link from "next/link";
import { notFound } from "next/navigation";
import { countryName } from "@/lib/analytics";
import { platformMeta } from "@/lib/platforms";
import { publicReleaseUrl } from "@/lib/releases";
import { reportByToken } from "@/lib/report";
import { SITE_URL } from "@/lib/env";
import { formatInTz, isReleased } from "@/lib/time";
import { fmtNum, pct } from "@/lib/utils";
import { NOINDEX } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ token: string }> }) {
  const data = await reportByToken((await props.params).token);
  if (!data) return { ...NOINDEX, title: "Report" };
  return {
    title: `${data.release.title} — release report`,
    description: `${fmtNum(data.totals.presaves)} pre-saves and ${fmtNum(data.totals.clicks)} link clicks for ${data.release.artistName}.`,
    // A shared link shouldn't end up in search results: the label chose who to send it to.
    ...NOINDEX,
  };
}

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{fmtNum(value)}{suffix}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, empty, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-4 space-y-3">{empty ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : children}</div>
    </section>
  );
}

export default async function ReportPage(props: { params: Promise<{ token: string }> }) {
  const data = await reportByToken((await props.params).token);
  if (!data) notFound();
  const { release, org, totals } = data;
  const out = isReleased(release.releaseDate);
  const link = publicReleaseUrl(org, release.slug, SITE_URL);

  const maxPlatform = Math.max(1, ...data.byPlatform.map((p) => p.clicks));
  const maxCountry = Math.max(1, ...data.byCountry.map((c) => c.views));
  const maxStore = Math.max(1, ...data.byListenOn.map((s) => s.presaves));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 print:py-0">
      <header className="flex flex-wrap items-center gap-4 border-b border-border pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={release.coverUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Release report · {org.name}</p>
          <h1 className="truncate text-2xl font-semibold">{release.title}</h1>
          <p className="text-sm text-muted-foreground">
            {release.artistName} · {out ? "released" : "releases"} {formatInTz(release.releaseDate, org.timezone, { dateStyle: "medium" })}
          </p>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pre-saves", value: fmtNum(totals.presaves) },
          { label: "Link clicks", value: fmtNum(totals.clicks) },
          { label: "Page views", value: fmtNum(totals.views) },
          { label: "Click-through", value: pct(totals.clicks, totals.views) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Panel title="Clicks by platform" empty={!data.byPlatform.length}>
          {data.byPlatform.map((p) => <Bar key={p.platform} label={platformMeta(p.platform).name} value={p.clicks} max={maxPlatform} />)}
        </Panel>

        <Panel title="Where the audience is" empty={!data.byCountry.length}>
          {data.byCountry.map((c) => <Bar key={c.country} label={countryName(c.country)} value={c.views} max={maxCountry} />)}
        </Panel>

        <Panel title="Stores fans picked" empty={!data.byListenOn.length}>
          {data.byListenOn.map((s) => <Bar key={s.platform} label={platformMeta(s.platform).name} value={s.presaves} max={maxStore} />)}
        </Panel>

        <Panel title="Where they came from" empty={!data.bySource.length}>
          {data.bySource.map((s) => (
            <div key={s.source} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{s.source}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{fmtNum(s.presaves)} pre-saves · {fmtNum(s.clicks)} clicks</span>
            </div>
          ))}
        </Panel>
      </div>

      <section className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <p>
          Smart link: <a href={link} className="text-violet-400 underline">{link.replace(/^https?:\/\//, "")}</a>
        </p>
        <p className="mt-1">Figures cover the 365 days to {formatInTz(new Date(), org.timezone, { dateStyle: "medium" })}. No personal information about any fan is shown on this page.</p>
      </section>

      <footer className="mt-8 border-t border-border pt-5 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Pre-saves, smart links and reports by <strong className="text-muted-foreground">droplr.fm</strong>
        </Link>
      </footer>
    </main>
  );
}
