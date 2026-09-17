import Link from "next/link";
import { AccountKindControl, CompPlanControl } from "@/components/admin/comp-plan-control";
import { Logo } from "@/components/marketing/logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { accountKind, kindChangeBlocker, planOf } from "@/lib/plans";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform", robots: { index: false, follow: false } };

/** droplr.fm owner console: every account (labels and artists), its plan, and complimentary plans. Hidden (404) unless your email is in PLATFORM_ADMIN_EMAILS. */
export default async function PlatformPage(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const admin = await requirePlatformAdmin();
  const q = (searchParams.q ?? "").trim();
  const orgs = await prisma.organization.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { users: { some: { email: { contains: q, mode: "insensitive" } } } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, name: true, slug: true, kind: true, plan: true, compPlan: true, compNote: true, compSetAt: true, compSetBy: true, stripeSubscriptionId: true, createdAt: true, customDomain: true, customDomainLiveAt: true, customDomainVerifiedAt: true,
      users: { where: { role: "owner" }, select: { email: true }, take: 1 },
      _count: { select: { releases: true, users: true } },
    },
  });
  const counts = { total: orgs.length, paid: orgs.filter((o) => o.stripeSubscriptionId).length, comp: orgs.filter((o) => o.compPlan).length };

  return (
    <div className="theme-dark min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="container flex h-14 items-center gap-4">
          <Logo href="/platform" />
          <Badge variant="warning">Platform owner</Badge>
          <span className="ml-auto text-sm text-muted-foreground">{admin.email} · <Link href="/admin" className="underline">Back to my label</Link></span>
        </div>
      </header>
      <main className="container space-y-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Accounts</h1>
            <p className="text-sm text-muted-foreground">{counts.total} shown · {orgs.filter((o) => o.kind === "artist").length} artist · {counts.paid} paying through Stripe · {counts.comp} complimentary</p>
          </div>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search name, slug or owner email" className="h-9 w-64 rounded-lg border bg-transparent px-3 text-sm" />
            <button className="h-9 rounded-lg border px-3 text-sm hover:bg-accent">Search</button>
          </form>
        </div>
        <Card className="p-4 text-sm text-muted-foreground">
          A complimentary plan is free and acts as a floor: the account keeps it without paying, Stripe can only move them higher, and cancelling a Stripe subscription drops them back to the comp plan instead of Free. Comps and paid plans are per account type, so to switch an account between label and artist, cancel its Stripe subscription and remove any comp first. Removing a comp drops the account to whatever it pays for through Stripe, or Free.
        </Card>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead><TR><TH>Account</TH><TH>Type</TH><TH>Owner</TH><TH>Plan</TH><TH>Billing</TH><TH className="text-right">Releases</TH><TH className="text-right">Users</TH><TH>Created</TH><TH>Complimentary plan</TH></TR></THead>
            <TBody>
              {orgs.map((o) => (
                <TR key={o.id}>
                  <TD><div className="font-medium">{o.name}</div><div className="font-mono text-xs text-muted-foreground">/{o.slug}{o.customDomain ? ` · ${o.customDomain} (${o.customDomainLiveAt ? "live" : o.customDomainVerifiedAt ? "connecting" : "unverified"})` : ""}</div></TD>
                  <TD><div className="flex flex-col items-start gap-1.5"><Badge variant={o.kind === "artist" ? "warning" : "secondary"}>{o.kind === "artist" ? "Artist" : "Label"}</Badge><AccountKindControl orgId={o.id} kind={accountKind(o.kind)} blocker={kindChangeBlocker(o, accountKind(o.kind) === "artist" ? "label" : "artist")} /></div></TD>
                  <TD className="text-xs">{o.users[0]?.email ?? "—"}</TD>
                  <TD><Badge variant={o.plan === "free" ? "secondary" : "success"}>{planOf(o.plan).name}</Badge></TD>
                  <TD className="text-xs">{o.stripeSubscriptionId ? "Stripe" : o.compPlan ? `Comp${o.compSetBy ? ` · ${o.compSetBy}` : ""}` : "—"}{o.compNote ? <div className="text-muted-foreground">{o.compNote}</div> : null}</TD>
                  <TD className="text-right tabular-nums">{o._count.releases}</TD>
                  <TD className="text-right tabular-nums">{o._count.users}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatInTz(o.createdAt, "Australia/Brisbane", { dateStyle: "medium" })}</TD>
                  <TD><CompPlanControl orgId={o.id} kind={accountKind(o.kind)} compPlan={o.compPlan} compNote={o.compNote} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </main>
    </div>
  );
}
