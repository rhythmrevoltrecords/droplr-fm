import Link from "next/link";
import { CreateLinkModal } from "@/components/admin/create-link-modal";
import { AnalyticsPanels, RangeTabs } from "@/components/admin/stats-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getStats, releaseTotals, statsRange } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { planOf, releaseWindowStart } from "@/lib/plans";
import { formatInTz, isReleased } from "@/lib/time";
import { fmtNum, pct } from "@/lib/utils";

export default async function AdminHome(
  props: { searchParams: Promise<{ days?: string; welcome?: string; password?: string; verified?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await requireUser("label");
  const maxDays = planOf(user.organization.plan).insightsDays;
  const days = statsRange(searchParams.days, maxDays);
  const releases = await prisma.release.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { releaseDate: "desc" },
    include: { artist: { select: { artistName: true, email: true } } },
  });
  const ids = releases.map((r) => r.id);
  const [totals, stats] = await Promise.all([releaseTotals(ids), getStats(ids, days, user.organization.timezone)]);
  const org = user.organization;
  const location = (org.locationLabel || "Local").toUpperCase();
  const plan = planOf(user.organization.plan);
  const windowStart = releaseWindowStart();
  const atLimit = releases.filter((r) => r.createdAt >= windowStart).length >= plan.releases;

  return (
    <div className="space-y-8">
      {searchParams.password === "reset" && <Card className="border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Password updated. You&apos;re signed in, and every other device has been signed out.</Card>}
      {searchParams.verified && <Card className="border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Email confirmed. Thanks!</Card>}
      {searchParams.welcome && (
        <Card className="border-primary/40 bg-primary/10 p-4 text-sm">
          {org.kind === "artist"
            ? <>Welcome to droplr.fm. Paste a Spotify link to create your first release: you&apos;ll get a pre-save page, a promo plan with dated steps and share graphics. Fill in your <Link className="underline" href="/admin/artists">profile</Link> while you&apos;re here.</>
            : <>Welcome to droplr.fm. Paste a Spotify link to create your first release, then invite artists from <Link className="underline" href="/admin/artists">Roster</Link>.</>}
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Releases</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {org.logoUrl && <img src={org.logoUrl} alt="" className="h-5 w-5 rounded object-cover ring-1 ring-border" />}
            <span>{org.name} · {releases.length} release{releases.length === 1 ? "" : "s"}</span>
            {atLimit && <Link href="/admin/settings/billing" className="text-xs text-violet-400 underline">{plan.name} limit reached · Upgrade</Link>}
          </p>
        </div>
        <CreateLinkModal releaseLimitReached={atLimit} />
      </div>

      {/* Phones: one card per release (a 9-column table is unreadable at 390px). */}
      <div className="space-y-3 md:hidden">
        {releases.map((r) => {
          const t = totals.get(r.id)!;
          return (
            <Card key={r.id} className="p-3">
              <Link href={`/admin/releases/${r.id}`} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.coverUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="truncate text-sm text-muted-foreground">{r.artist?.artistName ?? r.artistName}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {isReleased(r.releaseDate) ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Pre-save</Badge>}
                    <span>{formatInTz(r.releaseDate, org.timezone, { dateStyle: "medium" })}</span>
                  </div>
                </div>
              </Link>
              <dl className="mt-3 grid grid-cols-4 gap-1 border-t pt-3 text-center">
                {[["Views", fmtNum(t.views)], ["Clicks", fmtNum(t.clicks)], ["CTR", pct(t.clicks, t.views)], ["Pre-saves", fmtNum(t.presaves)]].map(([k, v]) => (
                  <div key={k}><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
                ))}
              </dl>
            </Card>
          );
        })}
        {!releases.length && <Card className="py-10 text-center text-sm text-muted-foreground">No releases yet.</Card>}
      </div>

      <Card className="hidden p-0 md:block">
        <Table>
          <THead>
            <TR><TH>Release</TH><TH>Artist</TH><TH>Date ({location})</TH><TH>Public link</TH><TH>Status</TH><TH className="text-right">Views</TH><TH className="text-right">Clicks</TH><TH className="text-right">CTR</TH><TH className="text-right">Pre-saves</TH></TR>
          </THead>
          <TBody>
            {releases.map((r) => {
              const t = totals.get(r.id)!;
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/admin/releases/${r.id}`} className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.coverUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                      <span className="font-medium hover:underline">{r.title}</span>
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">{r.artist?.artistName ?? r.artistName}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatInTz(r.releaseDate, org.timezone, { dateStyle: "medium" })}</TD>
                  <TD className="max-w-[220px]">
                    <a href={`/${org.slug}/${r.slug}?preview=1`} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline" title="Open public page (preview: not counted as a view)">
                      /{org.slug}/{r.slug}
                    </a>
                  </TD>
                  <TD>{isReleased(r.releaseDate) ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Pre-save</Badge>}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(t.views)}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(t.clicks)}</TD>
                  <TD className="text-right tabular-nums">{pct(t.clicks, t.views)}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(t.presaves)}</TD>
                </TR>
              );
            })}
            {!releases.length && <TR><TD colSpan={9} className="py-12 text-center text-muted-foreground">No releases yet.</TD></TR>}
          </TBody>
        </Table>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{org.kind === "artist" ? "Analytics" : "Label analytics"}</h2>
          <RangeTabs base="/admin" days={days} maxDays={maxDays} />
        </div>
        <AnalyticsPanels stats={stats} showArtists={org.kind !== "artist"} />
      </section>
    </div>
  );
}
