import { AccountKindControl, DomainAccessControl, CompPlanControl } from "@/components/admin/comp-plan-control";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { ManagePanel } from "@/components/platform/manage-panel";
import { BetaFeaturesControl } from "@/components/platform/beta-features-control";
import { MessageComposer } from "@/components/platform/message-composer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { LEGAL } from "@/lib/legal";
import { aliasUsage } from "@/lib/domains";
import { requirePlatformAdmin } from "@/lib/platform";
import { accountKind, kindChangeBlocker, planOf } from "@/lib/plans";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

/** One set of column widths for the header and every row (desktop only; a phone stacks each row). */
const COLS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.7fr)_minmax(0,1.3fr)_4.5rem_3.5rem_6.5rem_6.5rem]";
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
      id: true, name: true, slug: true, kind: true, plan: true, compPlan: true, compNote: true, compSetAt: true, compSetBy: true, compUntil: true, founderPrice: true, founderOfferUntil: true, founderCode: true, stripeSubscriptionId: true, createdAt: true, customDomain: true, customDomainLiveAt: true, customDomainVerifiedAt: true, domainsAllowedAt: true, domainsAllowedBy: true, betaFeatures: true,
      users: { where: { role: "owner" }, select: { email: true }, take: 1 },
      _count: { select: { releases: true, users: true } },
    },
  });
  const counts = { total: orgs.length, paid: orgs.filter((o) => o.stripeSubscriptionId).length, comp: orgs.filter((o) => o.compPlan).length };
  // Who still has to accept the current Terms (they see a notice in their dashboard until they do).
  const staleTerms = await prisma.user.count({ where: { termsVersion: { not: LEGAL.version } } });
  // Custom hostnames are capped by the certificate Netlify issues for the site, not by any plan.
  // It fills quietly, so it's counted here rather than discovered when someone's domain won't go live.
  const aliases = await aliasUsage();

  // Recent notices, with how many people have dismissed each — the only read-back there is on
  // whether anyone saw one, and the reason the seen table is worth having.
  const sent = (
    await prisma.platformMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, body: true, createdAt: true, revokedAt: true, organization: { select: { name: true } }, _count: { select: { seen: true } } },
    })
  ).map((m) => ({
    id: m.id, title: m.title, body: m.body,
    orgName: m.organization?.name ?? null,
    createdAt: m.createdAt.toISOString(),
    revokedAt: m.revokedAt ? m.revokedAt.toISOString() : null,
    seenCount: m._count.seen,
  }));

  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  // The whole platform, whatever the search shows: a filtered list must never read as a total.
  const [allAccounts, artistAccounts, paying, comped] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { kind: "artist" } }),
    prisma.organization.count({ where: { stripeSubscriptionId: { not: null } } }),
    prisma.organization.count({ where: { compPlan: { not: null } } }),
  ]);
  const strip = [
    { label: "Accounts", value: allAccounts, note: q ? `${counts.total} match “${q}”` : allAccounts > counts.total ? `newest ${counts.total} listed` : undefined },
    { label: "Label · artist", value: `${allAccounts - artistAccounts} · ${artistAccounts}` },
    { label: "Paying (Stripe)", value: paying },
    { label: "Complimentary", value: comped },
  ];

  return (
    <PlatformChrome email={admin.email} active="accounts">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every label and artist account, its plan and what it has made.</p>
          </div>
          <form className="flex w-full gap-2 sm:w-auto" role="search">
            <input name="q" defaultValue={q} placeholder="Search name, slug or owner email" aria-label="Search accounts" className="h-10 min-w-0 flex-1 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 text-sm outline-none transition focus:border-violet-400/50 sm:w-72" />
            <button className="h-10 shrink-0 rounded-full bg-white px-4 text-sm font-medium text-black transition hover:bg-white/90">Search</button>
          </form>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {strip.map((t) => (
            <div key={t.label} className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.label}</div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums">{t.value}</div>
              {t.note && <div className="mt-0.5 text-xs text-muted-foreground">{t.note}</div>}
            </div>
          ))}
        </div>

        {staleTerms > 0 && (
          <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground">
            <strong className="text-foreground">{staleTerms} login{staleTerms === 1 ? "" : "s"}</strong> yet to accept the {LEGAL.version} terms. They see a notice in their dashboard until they do.
          </p>
        )}

        {aliases.warn && (
          <Card className="rounded-2xl border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <strong className="text-foreground">Custom hostnames: {aliases.used} of {aliases.budget} used, {aliases.free} left.</strong>{" "}
            {aliases.attached} live{aliases.redirecting > 0 ? `, ${aliases.redirecting} held for renamed domains` : ""}. Netlify puts a site&apos;s
            domain aliases on a single Let&apos;s Encrypt certificate, which holds 100 names, so past roughly 90 the next customer&apos;s domain
            silently fails to go live. Move custom hostnames to Cloudflare for SaaS before this fills — droplr.fm&apos;s DNS is already on Cloudflare,
            and it&apos;s 100 hostnames free then US$0.10 each per month.
          </Card>
        )}

        <details className="group rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span>Send a notice to accounts <span className="ml-1 font-normal text-muted-foreground">· {sent.length ? `${sent.length} recent` : "none sent yet"}</span></span>
            <span className="text-muted-foreground transition group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-white/[0.07] p-4">
            <MessageComposer orgs={orgs.map((o) => ({ id: o.id, name: o.name, kind: o.kind }))} sent={sent} />
          </div>
        </details>

        {/* A grid, not a table: on a phone each account becomes a card, and the Manage drawer opens
            under it full width instead of off the side of a scrolling table. */}
        <div className="rounded-2xl border border-white/[0.07]">
          <div aria-hidden className={`hidden ${COLS} gap-4 border-b border-white/[0.07] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:grid`}>
            <div>Account</div><div>Owner</div><div>Plan</div><div className="text-right">Releases</div><div className="text-right">Users</div><div>Joined</div><div className="text-right">Manage</div>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {orgs.map((o) => (
              <li key={o.id} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-3.5 md:items-center ${COLS}`}>
                <div className="col-span-2 flex items-start gap-3 md:col-span-1">
                  <span aria-hidden className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-semibold ${o.kind === "artist" ? "bg-amber-400/15 text-amber-200" : "bg-violet-500/15 text-violet-200"}`}>{initials(o.name)}</span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">/{o.slug}</div>
                    {o.customDomain && <div className="truncate text-xs text-muted-foreground">{o.customDomain} · {o.customDomainLiveAt ? "live" : o.customDomainVerifiedAt ? "connecting" : "unverified"}</div>}
                  </div>
                </div>
                <div className="col-span-2 min-w-0 truncate text-xs text-muted-foreground md:col-span-1 md:text-foreground">{o.users[0]?.email ?? "No owner login"}</div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-col md:items-start">
                  <span className="flex flex-wrap gap-1"><Badge variant={o.plan === "free" ? "secondary" : "success"}>{planOf(o.plan).name}</Badge>{o.domainsAllowedAt && <Badge variant="secondary">Domains on</Badge>}{o.betaFeatures.length > 0 && <Badge variant="warning">Beta: {o.betaFeatures.length}</Badge>}</span>
                  <span className="text-xs text-muted-foreground">{o.kind === "artist" ? "Artist" : "Label"} · {o.stripeSubscriptionId ? "Stripe" : o.compPlan ? `Comp${o.compSetBy ? ` · ${o.compSetBy}` : ""}` : "no billing"}</span>
                  {o.compNote && <span className="w-full truncate text-xs text-muted-foreground">{o.compNote}</span>}
                </div>
                <div className="text-right text-xs text-muted-foreground md:text-sm md:tabular-nums md:text-foreground"><span className="md:hidden">{o._count.releases} release{o._count.releases === 1 ? "" : "s"} · {o._count.users} user{o._count.users === 1 ? "" : "s"} · {formatInTz(o.createdAt, "Australia/Brisbane", { dateStyle: "medium" })}</span><span className="hidden md:inline"><span className="sr-only">Releases: </span>{o._count.releases}</span></div>
                <div className="hidden text-right tabular-nums md:block"><span className="sr-only">Users: </span>{o._count.users}</div>
                <div className="hidden whitespace-nowrap text-xs text-muted-foreground md:block"><span className="sr-only">Joined </span>{formatInTz(o.createdAt, "Australia/Brisbane", { dateStyle: "medium" })}</div>
                <ManagePanel name={o.name}>
                    <div><div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Account type</div><AccountKindControl orgId={o.id} kind={accountKind(o.kind)} blocker={kindChangeBlocker(o, accountKind(o.kind) === "artist" ? "label" : "artist")} /></div>
                    <div><div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Custom domains</div><DomainAccessControl orgId={o.id} allowed={!!o.domainsAllowedAt} by={o.domainsAllowedBy} /></div>
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Beta features</div>
                      <BetaFeaturesControl
                        orgId={o.id}
                        on={o.betaFeatures}
                        planNote={{
                          ...(accountKind(o.kind) === "artist" ? { agreements: "Artist account: label accounts only.", royalties: "Artist account: label accounts only." } : {}),
                          ...(accountKind(o.kind) === "label" && !planOf(o.plan).contracts ? { agreements: `On ${planOf(o.plan).name}: they'll see it but can't add one. Comp Pro or Label to test.` } : {}),
                          ...(accountKind(o.kind) === "label" && !planOf(o.plan).royalties ? { royalties: `On ${planOf(o.plan).name}: they'll see it but can't start one. Comp Pro or Label to test.` } : {}),
                        }}
                      />
                    </div>
                    <div><div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Complimentary plan</div><CompPlanControl orgId={o.id} kind={accountKind(o.kind)} compPlan={o.compPlan} compNote={o.compNote} compUntil={o.compUntil?.toISOString() ?? null} founderPrice={o.founderPrice} founderOfferUntil={o.founderOfferUntil?.toISOString() ?? null} founderCode={o.founderCode} /></div>
                </ManagePanel>
              </li>
            ))}
            {orgs.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No account matches that.</li>}
          </ul>
        </div>

        <details className="rounded-2xl border border-white/[0.07] bg-white/[0.02] text-sm">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">How complimentary plans work</summary>
          <p className="border-t border-white/[0.07] px-4 py-3 text-muted-foreground">
            A complimentary plan is free and acts as a floor: the account keeps it without paying, Stripe can only move them higher, and cancelling a Stripe subscription drops them back to the comp plan instead of Free. Comps and paid plans are per account type, so to switch an account between label and artist, cancel its Stripe subscription and remove any comp first. Removing a comp drops the account to whatever it pays for through Stripe, or Free.
          </p>
        </details>
    </PlatformChrome>
  );
}
