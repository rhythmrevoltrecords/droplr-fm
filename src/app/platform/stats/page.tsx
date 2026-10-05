import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { CopySummary } from "@/components/platform/copy-summary";
import { platformStats, statsSummary } from "@/lib/platform-stats";
import { requirePlatformAdmin } from "@/lib/platform";

export const metadata = { title: "Numbers" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-AU");

/**
 * Platform totals, for pitching.
 *
 * The headline figures deliberately **exclude our own accounts**. The fastest way to lose a partner
 * conversation is to quote a number they later discover is mostly you, so the customer-only figure
 * is the big one and the all-inclusive figure sits next to it in small type, named. Set
 * PLATFORM_INTERNAL_ORG_SLUGS to decide which accounts are ours.
 */
export default async function PlatformStatsPage() {
  const admin = await requirePlatformAdmin();
  const s = await platformStats();
  const e = s.external;

  const headline: { label: string; value: number; all: number; note?: string }[] = [
    { label: "Links created", value: e.links, all: s.all.links, note: `${fmt(e.smartLinks)} release pages · ${fmt(e.bioPages)} bio pages` },
    { label: "Unique fans", value: e.uniqueFans, all: s.all.uniqueFans, note: "distinct email addresses" },
    { label: "Pre-saves taken", value: e.presaves, all: s.all.presaves, note: "repeat fans counted each time" },
    { label: "Artist profiles", value: e.artistProfiles, all: s.all.artistProfiles, note: "on labels' rosters" },
    { label: "Accounts", value: e.labelAccounts + e.artistAccounts, all: s.all.labelAccounts + s.all.artistAccounts, note: `${fmt(e.labelAccounts)} label · ${fmt(e.artistAccounts)} artist` },
    { label: "Clicks to stores", value: e.clicks, all: s.all.clicks },
  ];

  return (
    <PlatformChrome email={admin.email} active="stats">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Numbers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everything below counts rows that already exist — there is no separate tally to drift out of step.
            Figures are current, so a deleted account takes its rows with it.
          </p>
        </div>

        {s.excluded.length === 0 ? (
          <Card className="border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm">
            <strong>These totals include your own accounts.</strong> Set <code>PLATFORM_INTERNAL_ORG_SLUGS</code> in
            Netlify to a comma-separated list of your own org slugs (Rhythm Revolt, your artist account) and the
            headline figures will exclude them. Until you do, don&apos;t quote these to anyone — a partner who
            discovers the number is mostly you will discount everything else you said.
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            Headline figures exclude <strong>{s.excluded.join(", ")}</strong>. The grey number under each is the
            total including them.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {headline.map((h) => (
            <Card key={h.label} className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{h.label}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{fmt(h.value)}</div>
              {h.note && <div className="mt-0.5 text-xs text-muted-foreground">{h.note}</div>}
              {h.all !== h.value && (
                <div className="mt-1.5 text-xs text-muted-foreground">{fmt(h.all)} including our own accounts</div>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div>
              <h2 className="font-semibold">By month</h2>
              <p className="text-xs text-muted-foreground">
                Customers only, UTC months, oldest first. Derived from when each row was created, so the history
                goes back further than this page does.
              </p>
            </div>
          </div>
          <Table>
            <THead>
              <TR><TH>Month</TH><TH className="text-right">Links</TH><TH className="text-right">Fans</TH><TH className="text-right">New accounts</TH></TR>
            </THead>
            <TBody>
              {s.months.map((m) => (
                <TR key={m.month}>
                  <TD className="font-mono text-xs">{m.month}</TD>
                  <TD className="text-right tabular-nums">{fmt(m.links)}</TD>
                  <TD className="text-right tabular-nums">{fmt(m.fans)}</TD>
                  <TD className="text-right tabular-nums">{fmt(m.accounts)}</TD>
                </TR>
              ))}
              {s.months.every((m) => !m.links && !m.fans && !m.accounts) && (
                <TR><TD colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Nothing yet from anyone but us.</TD></TR>
              )}
            </TBody>
          </Table>
        </Card>

        <Card className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold">For an email</h2>
            <p className="text-xs text-muted-foreground">
              Already caveated, so the figures can&apos;t leave here without the exclusion note attached.
            </p>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-black/20 p-3 text-xs">{statsSummary(s)}</pre>
          <CopySummary text={statsSummary(s)} />
        </Card>
      </div>
    </PlatformChrome>
  );
}
