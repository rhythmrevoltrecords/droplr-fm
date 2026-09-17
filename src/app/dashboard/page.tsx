import { CopyButton } from "@/components/admin/copy-button";
import { QrDownload } from "@/components/admin/qr-download";
import { AnalyticsPanels, RangeTabs } from "@/components/admin/stats-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getStats, releaseTotals, type StatsRange } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { formatInTz, isReleased } from "@/lib/time";
import { fmtNum, pct } from "@/lib/utils";

export default async function ArtistDashboard(props: { searchParams: Promise<{ days?: string; password?: string; verified?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser("artist");
  const days = ([14, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30) as StatsRange;
  // Scoped strictly to releases assigned to this artist
  const releases = await prisma.release.findMany({
    // artistId is derived from the profile; matching the profile too is belt and braces if a sync was missed.
    where: { organizationId: user.organizationId, OR: [{ artistId: user.id }, { artistProfile: { userId: user.id } }] },
    orderBy: { releaseDate: "desc" },
    include: { linkVariants: { where: { isActive: true } } },
  });
  const ids = releases.map((r) => r.id);
  const [totals, stats] = await Promise.all([releaseTotals(ids), getStats(ids, days, user.organization.timezone)]);
  const plan = planOf(user.organization.plan);

  return (
    <div className="space-y-8">
      {searchParams.password === "reset" && <Card className="border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Password updated. You&apos;re signed in, and every other device has been signed out.</Card>}
      {searchParams.verified && <Card className="border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">Email confirmed. Thanks!</Card>}
      <div>
        <h1 className="text-2xl font-semibold">Hey {user.artistName ?? user.email.split("@")[0]}</h1>
        <p className="text-sm text-muted-foreground">Your releases on {user.organization.name}. Copy a link for each placement so we can see what&apos;s working.</p>
      </div>

      <div className="space-y-4">
        {releases.map((r) => {
          const base = publicReleaseUrl(user.organization, r.slug, SITE_URL);
          const t = totals.get(r.id)!;
          const variant = (slug: string) => r.linkVariants.find((v) => v.slug === slug);
          const links = [
            { label: "Main link", url: base },
            ...["ig", "tiktok", "bio"].filter((s) => variant(s)).map((s) => ({ label: s === "ig" ? "IG link" : s === "tiktok" ? "TikTok link" : "Bio link", url: `${base}/${s}` })),
          ];
          return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.coverUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{r.title}</h2>
                    {isReleased(r.releaseDate) ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Out {formatInTz(r.releaseDate, user.organization.timezone, { dateStyle: "medium" })}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span>{fmtNum(t.views)} views</span><span>{fmtNum(t.clicks)} clicks</span><span>{pct(t.clicks, t.views)} CTR</span><span>{fmtNum(t.presaves)} pre-saves</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {links.map((l) => <CopyButton key={l.label} value={l.url} label={l.label} />)}
                    {plan.qr && <QrDownload value={base} filename={`${r.slug}-qr`} label="QR download" />}
                    {plan.csvExport && <Button asChild size="sm" variant="outline"><a href={`/api/admin/releases/${r.id}/export?type=presaves`}>Export emails CSV</a></Button>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {!releases.length && <Card className="p-10 text-center text-sm text-muted-foreground">No releases assigned to you yet. Your label adds them.</Card>}
      </div>

      {releases.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your stats</h2>
            <RangeTabs base="/dashboard" days={days} />
          </div>
          <AnalyticsPanels stats={stats} />
        </section>
      )}
    </div>
  );
}
