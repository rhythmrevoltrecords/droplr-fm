import Link from "next/link";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/platform";
import { isPeriod, signupSourcesReport, UNKNOWN, type Period } from "@/lib/signup-sources-report";
import { SIGNUP_SOURCE_DAYS } from "@/lib/signup-source";
import { formatInTz } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign-ups · Platform", robots: { index: false, follow: false } };

const PERIOD_LABEL: Record<Period, string> = { "30": "30 days", "90": "90 days", all: "All time" };
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

/** Where accounts came from. The column that judges a channel is "made a release", not sign-ups. */
export default async function PlatformSources({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const admin = await requirePlatformAdmin();
  const q = await searchParams;
  const period: Period = isPeriod(q.period) ? q.period : "90";
  const r = await signupSourcesReport(period);
  const tz = "Australia/Brisbane";
  const known = r.total - r.unknown;

  return (
    <PlatformChrome email={admin.email} active="sources">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Where sign-ups came from</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {r.total} sign-up{r.total === 1 ? "" : "s"}{r.since ? ` since ${formatInTz(r.since, tz, { dateStyle: "medium" })}` : ""}.{" "}
            {r.total ? `${known} with a known source, ${r.unknown} direct or unknown.` : ""}
            {r.excluded.length ? ` Your own accounts (${r.excluded.join(", ")}) are left out.` : ""}
          </p>
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1 text-sm">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <Link key={p} href={`/platform/sources?period=${p}`} aria-current={p === period ? "page" : undefined} className={cn("rounded-full px-3 py-1", p === period ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {PERIOD_LABEL[p]}
            </Link>
          ))}
        </nav>
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <THead>
            <TR><TH>Source</TH><TH className="text-right">Sign-ups</TH><TH className="text-right">Confirmed email</TH><TH className="text-right">Made a release</TH><TH className="text-right">Paying</TH><TH className="text-right">Via a referral</TH></TR>
          </THead>
          <TBody>
            {r.rows.map((row) => (
              <TR key={`${row.source}|${row.medium}|${row.campaign}`}>
                <TD>
                  <div className={cn("font-medium", row.source === UNKNOWN && "text-muted-foreground")}>{row.source}</div>
                  {(row.medium || row.campaign) && <div className="text-xs text-muted-foreground">{[row.medium, row.campaign].filter(Boolean).join(" · ")}</div>}
                </TD>
                <TD className="text-right tabular-nums">{row.signups}</TD>
                <TD className="text-right tabular-nums">{row.confirmed} <span className="text-xs text-muted-foreground">{pct(row.confirmed, row.signups)}</span></TD>
                <TD className="text-right tabular-nums font-medium">{row.madeRelease} <span className="text-xs font-normal text-muted-foreground">{pct(row.madeRelease, row.signups)}</span></TD>
                <TD className="text-right tabular-nums">{row.paying}</TD>
                <TD className="text-right tabular-nums">{row.referred}</TD>
              </TR>
            ))}
            {!r.rows.length && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">No sign-ups in this period.</TD></TR>}
          </TBody>
        </Table>
      </Card>

      <Card className="space-y-2 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Tagging a link</p>
        <p>Add tags to any droplr.fm link you put out, so its sign-ups show up here under their own name:</p>
        <p className="break-all rounded-md bg-white/[0.04] px-3 py-2 font-mono text-xs text-foreground">https://droplr.fm/tools/release-plan?utm_source=reddit&amp;utm_medium=ad&amp;utm_campaign=release-plan</p>
        <p>
          <code>utm_source</code> is the row name, so keep one word per channel and spell it the same every time. Tags are cleaned to lowercase letters, numbers, dots, dashes and underscores. With no tag, the row is the site that sent them, when the browser says (Google, Reddit, YouTube…). Only the first tagged link or outside site in {SIGNUP_SOURCE_DAYS} days counts, and only on droplr.fm&apos;s own pages, never an artist&apos;s.
        </p>
        <p>&ldquo;{UNKNOWN}&rdquo; means droplr can&apos;t tell: typed the address, a bookmark, an app that hides where a link came from, or it was more than {SIGNUP_SOURCE_DAYS} days before they signed up. Accounts made before this was added are all here.</p>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Latest sign-ups</h2>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead><TR><TH>Account</TH><TH>Joined</TH><TH>Source</TH><TH>Landed on</TH><TH>Release</TH><TH>Paying</TH></TR></THead>
            <TBody>
              {r.recent.map((s) => (
                <TR key={s.slug}>
                  <TD><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.slug} · {s.kind}</div></TD>
                  <TD className="whitespace-nowrap text-xs">{formatInTz(s.createdAt, tz, { dateStyle: "medium" })}</TD>
                  <TD>
                    <div className={cn(s.source === UNKNOWN && "text-muted-foreground")}>{s.source}</div>
                    <div className="text-xs text-muted-foreground">{[s.medium, s.campaign, s.referrerHost && s.referrerHost !== s.source ? s.referrerHost : null].filter(Boolean).join(" · ")}</div>
                  </TD>
                  <TD className="font-mono text-xs text-muted-foreground">{s.landingPath ?? "—"}</TD>
                  <TD className="text-xs">{s.madeRelease ? "Yes" : "No"}</TD>
                  <TD className="text-xs">{s.paying ? "Yes" : "No"}</TD>
                </TR>
              ))}
              {!r.recent.length && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">No sign-ups in this period.</TD></TR>}
            </TBody>
          </Table>
        </Card>
      </div>
    </PlatformChrome>
  );
}
