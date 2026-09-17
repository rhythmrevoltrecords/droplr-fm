import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { countryName, type Stats } from "@/lib/analytics";
import { fmtNum, pct } from "@/lib/utils";
import { DailyChart, PlatformBars } from "./charts";
import { ActivityHeatmap, DeviceShare, InsightList, RankBars, StoreChoiceBars } from "./insights";

export function StatCards({ stats }: { stats: Stats }) {
  const items = [
    { label: "Views", value: fmtNum(stats.views) },
    { label: "Clicks", value: fmtNum(stats.clicks) },
    { label: "CTR", value: pct(stats.clicks, stats.views) },
    { label: "Pre-saves", value: fmtNum(stats.presaves) },
    { label: "Conv. rate", value: pct(stats.presaves, stats.views) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((i) => (
        <Card key={i.label} className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{i.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{i.value}</div>
        </Card>
      ))}
    </div>
  );
}

export function RangeTabs({ base, days, maxDays = Infinity }: { base: string; days: number; maxDays?: number }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border p-0.5 text-sm">
        {[14, 30, 90, 365].map((d) =>
          d > maxDays ? (
            <Link key={d} href="/admin/settings/billing" title="More history on paid plans" className="rounded-md px-3 py-1 text-muted-foreground/50 hover:text-foreground">
              {d === 365 ? "1y" : `${d}d`} 🔒
            </Link>
          ) : (
            <Link key={d} href={`${base}${sep}days=${d}`} className={`rounded-md px-3 py-1 ${d === days ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {d === 365 ? "1y" : `${d}d`}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

export function AnalyticsPanels({ stats, showArtists = false, perLink = false }: { stats: Stats; showArtists?: boolean; perLink?: boolean }) {
  return (
    <div className="space-y-4">
      <StatCards stats={stats} />
      <Card>
        <CardHeader><CardTitle>What we&apos;re seeing</CardTitle><CardDescription>Patterns in how fans find and use your links</CardDescription></CardHeader>
        <CardContent><InsightList items={stats.insights} enough={stats.views >= 30} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Traffic</CardTitle></CardHeader>
        <CardContent><DailyChart data={stats.daily} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>When fans are active</CardTitle><CardDescription>Day and hour in each fan&apos;s own timezone. Post just before your busiest hours.</CardDescription></CardHeader>
        <CardContent><ActivityHeatmap views={stats.heat.views} presaves={stats.heat.presaves} /></CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle>Clicks by platform</CardTitle><CardDescription>Stores and streaming, side by side</CardDescription></CardHeader>
          <CardContent><PlatformBars data={perLink ? stats.byLink : stats.byPlatform} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Performance by source</CardTitle></CardHeader>
          <CardContent className="px-2">
            <Table>
              <THead><TR><TH>Source</TH><TH className="text-right">Views</TH><TH className="text-right">Clicks</TH><TH className="text-right">CTR</TH><TH className="text-right">Pre-saves</TH></TR></THead>
              <TBody>
                {stats.bySource.map((s) => (
                  <TR key={s.source}><TD className="font-medium">{s.source}</TD><TD className="text-right tabular-nums">{fmtNum(s.views)}</TD><TD className="text-right tabular-nums">{fmtNum(s.clicks)}</TD><TD className="text-right tabular-nums">{pct(s.clicks, s.views)}</TD><TD className="text-right tabular-nums">{fmtNum(s.presaves)}</TD></TR>
                ))}
                {!stats.bySource.length && <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">No traffic yet</TD></TR>}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Countries</CardTitle><CardDescription>Page views</CardDescription></CardHeader>
          <CardContent><RankBars rows={stats.byCountry.map((c) => ({ label: c.country === "Unknown" ? "Unknown" : countryName(c.country), value: c.views }))} empty="No views yet." /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Devices</CardTitle><CardDescription>Share of page views</CardDescription></CardHeader>
          <CardContent><DeviceShare rows={stats.byDevice} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Where pre-savers listen</CardTitle><CardDescription>The store fans picked on the email pre-save</CardDescription></CardHeader>
          <CardContent><StoreChoiceBars rows={stats.byListenOn} /></CardContent>
        </Card>
        {showArtists && (
          <Card>
            <CardHeader><CardTitle>Clicks by artist</CardTitle><CardDescription>Which artist is driving the roster</CardDescription></CardHeader>
            <CardContent className="px-2">
              <Table>
                <THead><TR><TH>Artist</TH><TH className="text-right">Clicks</TH><TH className="text-right">Share</TH></TR></THead>
                <TBody>
                  {stats.byArtist.map((a) => (
                    <TR key={a.artist}><TD className="font-medium">{a.artist}</TD><TD className="text-right tabular-nums">{fmtNum(a.clicks)}</TD><TD className="text-right tabular-nums">{pct(a.clicks, stats.clicks)}</TD></TR>
                  ))}
                  {!stats.byArtist.length && <TR><TD colSpan={3} className="py-8 text-center text-muted-foreground">No clicks yet</TD></TR>}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
