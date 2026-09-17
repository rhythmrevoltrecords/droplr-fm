import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { countryName } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { fanSummary, listFans } from "@/lib/fans";
import { isListenChoice, platformMeta } from "@/lib/platforms";
import { planOf } from "@/lib/plans";
import { formatInTz } from "@/lib/time";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fans" };

const PAGE = 100;

export default async function FansPage(props: { searchParams: Promise<{ q?: string; news?: string; country?: string; store?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const user = await requireUser("label");
  const org = user.organization;
  const plan = planOf(org.plan);
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const filter = {
    q: sp.q?.trim().slice(0, 100) || undefined,
    news: sp.news === "1",
    country: /^[A-Z]{2}$/.test(sp.country ?? "") ? sp.country : undefined,
    listenOn: isListenChoice(sp.store) ? sp.store : undefined,
  };
  const [summary, fans] = await Promise.all([fanSummary(org.id), listFans(org.id, filter, PAGE + 1, (page - 1) * PAGE)]);
  const more = fans.length > PAGE;
  const rows = fans.slice(0, PAGE);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: filter.q, news: filter.news ? "1" : undefined, country: filter.country, store: filter.listenOn, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/fans${p.size ? `?${p}` : ""}`;
  };
  const exportHref = `/api/admin/fans/export${qs({}).replace("/admin/fans", "")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fans</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Everyone who pre-saved any of your releases, in one list.</p>
        </div>
        {plan.csvExport ? (
          <Button asChild variant="outline"><a href={exportHref}>Export CSV</a></Button>
        ) : (
          <Link href="/admin/settings/billing" className="text-sm text-violet-400 underline">Export is on paid plans</Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Fans", value: summary.total, hint: "unique emails" },
          { label: "Opted in to news", value: summary.news, hint: "you can email about anything" },
          { label: "Came back", value: summary.returning, hint: "pre-saved 2+ releases" },
          { label: "Unsubscribed", value: summary.unsubscribed, hint: "never email again" },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtNum(t.value)}</div>
            <div className="text-xs text-muted-foreground">{t.hint}</div>
          </Card>
        ))}
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Who you can email:</strong> fans marked <Badge variant="success">News</Badge> said yes to news and new music. Everyone else only agreed to hear about the release they pre-saved, and droplr sends that email for you. Emailing them about other things breaks anti-spam law (in Australia, the Spam Act).
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>Find fans by email, country, store or news opt-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
            <Input name="q" defaultValue={filter.q} placeholder="Search email" aria-label="Search email" />
            <Select name="country" defaultValue={filter.country ?? ""} aria-label="Country">
              <option value="">All countries</option>
              {summary.countries.map((c) => <option key={c.value} value={c.value}>{countryName(c.value)} ({c.fans})</option>)}
            </Select>
            <Select name="store" defaultValue={filter.listenOn ?? ""} aria-label="Store">
              <option value="">Any store</option>
              {summary.stores.map((s) => <option key={s.value} value={s.value}>{platformMeta(s.value).name} ({s.fans})</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="news" value="1" defaultChecked={filter.news} className="h-4 w-4" /> News opt-ins only</label>
            <div className="flex gap-2"><Button type="submit" variant="secondary">Apply</Button>{(filter.q || filter.news || filter.country || filter.listenOn) && <Button asChild variant="ghost"><Link href="/admin/fans">Clear</Link></Button>}</div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2 md:hidden">
        {rows.map((f) => (
          <Card key={f.email} className="p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-all font-medium">{f.email}</span>
              {f.unsubscribed ? <Badge variant="secondary">Unsubscribed</Badge> : f.news ? <Badge variant="success">News</Badge> : <span className="shrink-0 text-xs text-muted-foreground">Release only</span>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {[f.listenOn ? platformMeta(f.listenOn).name : null, f.country ? countryName(f.country) : null, `${f.releases} release${f.releases === 1 ? "" : "s"}`, formatInTz(f.lastSeen, org.timezone, { dateStyle: "medium" })].filter(Boolean).join(" · ")}
            </div>
          </Card>
        ))}
        {!rows.length && <Card className="py-10 text-center text-sm text-muted-foreground">{summary.total ? "No fans match those filters." : "No fans yet. Share a pre-save link and they'll show up here."}</Card>}
      </div>

      <Card className="hidden p-0 md:block">
        <div className="overflow-x-auto">
          <Table>
            <THead><TR><TH>Email</TH><TH>News</TH><TH>Listens on</TH><TH>Country</TH><TH className="text-right">Releases</TH><TH>Last pre-save</TH></TR></THead>
            <TBody>
              {rows.map((f) => (
                <TR key={f.email}>
                  <TD className="font-medium">{f.email}</TD>
                  <TD>{f.unsubscribed ? <Badge variant="secondary">Unsubscribed</Badge> : f.news ? <Badge variant="success">News</Badge> : <span className="text-muted-foreground">Release only</span>}</TD>
                  <TD>{f.listenOn ? platformMeta(f.listenOn).name : <span className="text-muted-foreground">—</span>}</TD>
                  <TD>{f.country ? countryName(f.country) : <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="text-right tabular-nums">{f.releases}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatInTz(f.lastSeen, org.timezone, { dateStyle: "medium" })}</TD>
                </TR>
              ))}
              {!rows.length && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">{summary.total ? "No fans match those filters." : "No fans yet. Share a pre-save link and they'll show up here."}</TD></TR>}
            </TBody>
          </Table>
        </div>
      </Card>
      {(page > 1 || more) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? <Link className="underline" href={qs({ page: String(page - 1) })}>Previous</Link> : <span />}
          {more && <Link className="underline" href={qs({ page: String(page + 1) })}>Next</Link>}
        </div>
      )}
    </div>
  );
}
