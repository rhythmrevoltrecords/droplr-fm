import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BioStats } from "@/lib/bio-stats";
import { fmtNum, pct } from "@/lib/utils";
import { DailyChart, PlatformBars } from "./charts";
import { ActivityHeatmap, DeviceShare, InsightList, RankBars } from "./insights";

/**
 * A bio page's own numbers. Same components as the release panels, a different set of questions:
 * no pre-saves, no conversion rate, no chosen store, no by-artist. Those are release concepts,
 * and a panel that shows them as zero is making a claim about something that does not exist.
 */
export function BioAnalyticsPanels({ stats, days }: { stats: BioStats; days: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: `Views · ${days}d`, value: fmtNum(stats.views), sub: null },
          { label: `Taps · ${days}d`, value: fmtNum(stats.clicks), sub: null },
          { label: "Tap rate", value: pct(stats.clicks, stats.views), sub: null },
          // Both all-time numbers in one card. They used to sit in the page header as well, which
          // put three view/tap figures on one screen with only two of them explained.
          { label: "All time", value: fmtNum(stats.allTimeViews), sub: `views · ${fmtNum(stats.allTimeClicks)} taps` },
        ].map((i) => (
          <Card key={i.label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{i.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{i.value}</div>
            {i.sub && <div className="text-xs text-muted-foreground">{i.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Said once, plainly, rather than letting someone discover it by subtracting. The all-time
          counter has been running since bio pages existed; the detail below only starts the day
          droplr began keeping a row per visit, and no row can be written for the past. */}
      {stats.allTimeViews > stats.views && (
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">All time</strong> counts every visit this page has ever had.
          Everything else on this screen is the last {days} days, from the day droplr started recording where
          visits come from &mdash; so the two will not add up on a page older than that, and that is expected.
        </p>
      )}

      {!stats.hasEvents ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing recorded in the last {days} days. Once someone opens the page, this fills in with where
            they came from, what country they are in and which button they tapped.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>What I&apos;m seeing</CardTitle><CardDescription>Only shown once there are enough visits to mean something</CardDescription></CardHeader>
            <CardContent><InsightList items={stats.insights} enough={stats.views >= 30} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Traffic</CardTitle></CardHeader>
            {/* presaves={false}: a bio page has none, and a flat line labelled "presaves" is a lie. */}
            <CardContent><DailyChart data={stats.daily} presaves={false} /></CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Where they came from</CardTitle><CardDescription>&ldquo;direct&rdquo; is what a tap from an app&rsquo;s bio field looks like</CardDescription></CardHeader>
              <CardContent>
                <RankBars rows={stats.bySource.map((r) => ({ label: r.source, value: r.views }))} empty="No visits yet." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Where they are</CardTitle></CardHeader>
              <CardContent>
                <RankBars rows={stats.byCountry.map((r) => ({ label: r.name, value: r.views }))} empty="No visits yet." />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Which button</CardTitle><CardDescription>Each button counted on its own, so two of the same platform stay separate</CardDescription></CardHeader>
              <CardContent>
                <PlatformBars data={stats.byLink.map((r) => ({ platform: r.platform, clicks: r.clicks, label: r.label, key: r.id }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>What they opened it on</CardTitle></CardHeader>
              <CardContent><DeviceShare rows={stats.byDevice} /></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>When they open it</CardTitle><CardDescription>In each visitor&rsquo;s own timezone, not yours</CardDescription></CardHeader>
            {/* presaves={null}: no second metric, so the toggle is not drawn at all. */}
            <CardContent><ActivityHeatmap views={stats.heat} presaves={null} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
