import { PlatformChrome } from "@/components/platform/platform-chrome";
import { CopySummary } from "@/components/platform/copy-summary";
import { StatTile } from "@/components/platform/stat-tile";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
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
  const series = (k: "links" | "fans" | "accounts" | "gates" | "clips") => s.months.map((m) => ({ month: m.month, value: m[k] }));

  return (
    <PlatformChrome email={admin.email} active="stats">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Numbers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Counted from rows that exist. A deleted account takes its rows with it. Clips are the exception:
            a clip is made in the browser, so the browser reports each finished render, and that is what is counted.
            Bars are the last 13 months, customers only.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          As at {s.generatedAt.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })}
        </div>
      </div>

      {s.excluded.length === 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm">
          <strong>These totals include your own accounts.</strong> Set <code>PLATFORM_INTERNAL_ORG_SLUGS</code> in
          Netlify to a comma-separated list of your own org slugs (Rhythm Revolt, your artist account) and the
          headline figures will exclude them. Until you do, don&apos;t quote these to anyone. Clip renders are marked
          as yours or a customer&apos;s when they happen, so renders made before you set it stay counted as customers&apos;.
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Big numbers exclude <strong className="text-foreground">{s.excluded.join(", ")}</strong>. The small line under one is the total including them.
        </p>
      )}

      <section aria-label="Made on droplr" className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">What people made</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile size="lg" label="Pages made" value={e.links} all={s.all.links} note={`${fmt(e.smartLinks)} release · ${fmt(e.downloadGates)} gate · ${fmt(e.bioPages)} bio`} months={series("links")} />
          <StatTile size="lg" label="Download gates" value={e.downloadGates} all={s.all.downloadGates} note={`${fmt(e.gateUnlocks)} downloads unlocked`} months={series("gates")} />
          <StatTile size="lg" label="Clips rendered" value={e.clipsRendered} all={s.all.clipsRendered} note="reported by the browser when a render finishes, since this tally shipped" months={series("clips")} />
          <StatTile size="lg" label="Accounts" value={e.labelAccounts + e.artistAccounts} all={s.all.labelAccounts + s.all.artistAccounts} note={`${fmt(e.labelAccounts)} label · ${fmt(e.artistAccounts)} artist`} months={series("accounts")} />
        </div>
      </section>

      <section aria-label="Reach" className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Who it reached</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Unique fans" value={e.uniqueFans} all={s.all.uniqueFans} note="distinct email addresses" />
          <StatTile label="Pre-saves taken" value={e.presaves} all={s.all.presaves} note="repeat fans counted each time" />
          <StatTile label="Clicks to stores" value={e.clicks} all={s.all.clicks} />
          <StatTile label="Artist profiles" value={e.artistProfiles} all={s.all.artistProfiles} note="on labels' rosters" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07]">
        <div className="border-b border-white/[0.07] p-4">
          <h2 className="font-semibold">By month</h2>
          <p className="text-xs text-muted-foreground">Customers only, UTC months, newest first. The same figures the bars above draw. Fan sign-ups count every pre-save and contact added, so one fan can appear in more than one month.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR><TH>Month</TH><TH className="text-right">Pages</TH><TH className="text-right">Gates</TH><TH className="text-right">Clips</TH><TH className="text-right">Fan sign-ups</TH><TH className="text-right">New accounts</TH></TR>
            </THead>
            <TBody>
              {[...s.months].reverse().map((m) => (
                <TR key={m.month}>
                  <TD className="font-mono text-xs">{m.month}</TD>
                  {[m.links, m.gates, m.clips, m.fans, m.accounts].map((v, i) => (
                    <TD key={i} className={v ? "text-right tabular-nums" : "text-right tabular-nums text-muted-foreground/60"}>{fmt(v)}</TD>
                  ))}
                </TR>
              ))}
              {s.months.every((m) => !m.links && !m.fans && !m.accounts && !m.clips) && (
                <TR><TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nothing yet from anyone but us.</TD></TR>
              )}
            </TBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/[0.07] p-4">
        <div>
          <h2 className="font-semibold">For an email</h2>
          <p className="text-xs text-muted-foreground">Already caveated, so the figures can&apos;t leave here without the exclusion note attached.</p>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/30 p-3 text-xs">{statsSummary(s)}</pre>
        <CopySummary text={statsSummary(s)} />
      </section>
    </PlatformChrome>
  );
}
