import Link from "next/link";
import { CreateLinkModal } from "@/components/admin/create-link-modal";
import { AnalyticsPanels, RangeTabs } from "@/components/admin/stats-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getStats, releaseTotals, type StatsRange } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { formatInTz, isReleased } from "@/lib/time";
import { fmtNum, pct } from "@/lib/utils";

export default async function AdminHome({ searchParams }: { searchParams: { days?: string; welcome?: string } }) {
  const user = await requireUser("label");
  const days = ([14, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30) as StatsRange;
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
  const atLimit = releases.length >= plan.releases;

  return (
    <div className="space-y-8">
      {searchParams.welcome && (
        <Card className="border-primary/40 bg-primary/10 p-4 text-sm">
          Welcome to droplr.fm. Paste a Spotify link to create your first release, then invite artists from <Link className="underline" href="/admin/artists">Roster</Link>.
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

      <Card className="p-0">
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Label analytics</h2>
          <RangeTabs base="/admin" days={days} />
        </div>
        <AnalyticsPanels stats={stats} showArtists />
      </section>
    </div>
  );
}
