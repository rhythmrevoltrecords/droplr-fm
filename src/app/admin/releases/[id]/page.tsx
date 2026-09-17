import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { LinkEditor } from "@/components/admin/link-editor";
import { StoreFinder } from "@/components/admin/store-finder";
import { ShareGraphics } from "@/components/admin/share-graphics";
import { PromoPlan } from "@/components/admin/promo-plan";
import { AUTOMATIC, promoSteps, stepDate } from "@/lib/promo";
import { busiestHour } from "@/lib/analytics";
import { zonedDay } from "@/lib/time";
import { MILESTONES } from "@/lib/share-image";
import { PresaveTable } from "@/components/admin/presave-table";
import { ReleaseSettingsForm } from "@/components/admin/release-settings-form";
import { AnalyticsPanels, RangeTabs } from "@/components/admin/stats-panels";
import { VariantManager } from "@/components/admin/variant-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getStats, statsRange } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { dateToZonedLocal, formatInTz, isReleased } from "@/lib/time";

const TABS = [
  { key: "links", label: "Links" },
  { key: "promo", label: "Promo plan" },
  { key: "variants", label: "Variants & QR" },
  { key: "analytics", label: "Analytics" },
  { key: "presaves", label: "Pre-saves" },
  { key: "share", label: "Share" },
  { key: "settings", label: "Settings" },
];

export default async function ReleaseDetail(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; days?: string; created?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await requireUser("label");
  const release = await prisma.release.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { links: { orderBy: { position: "asc" } }, linkVariants: { orderBy: { createdAt: "asc" } }, organization: true },
  });
  if (!release) notFound();
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "links";
  const plan = planOf(release.organization.plan);
  const days = statsRange(searchParams.days, plan.insightsDays);
  const url = publicReleaseUrl(release.organization, release.slug, SITE_URL);
  const live = isReleased(release.releaseDate);

  const presaveCounts = await prisma.preSave.groupBy({ by: ["status"], where: { releaseId: release.id }, _count: { _all: true } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={release.coverUrl} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{release.title}</h1>
            {live ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Pre-save until {formatInTz(release.releaseDate, release.organization.timezone)} ({release.organization.locationLabel})</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{release.artistName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="truncate rounded bg-secondary px-2 py-1 text-xs">{url}</code>
            <CopyButton value={url} />
            <Button asChild size="sm" variant="ghost"><a href={`${publicReleaseUrl({ slug: release.organization.slug, customDomain: null }, release.slug, "")}?preview=1`} target="_blank" rel="noreferrer"><ExternalLink /> Preview</a></Button>
          </div>
        </div>
      </div>

      {searchParams.created && (
        <Card className="border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          Release created. Add your Beatport, Traxsource and Bandcamp links below. Variants /ig, /tiktok and /bio are ready on the Variants tab.
        </Card>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/releases/${release.id}?tab=${t.key}`} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "links" && (
        <Card>
          <CardHeader>
            <CardTitle>Platform links</CardTitle>
            <CardDescription>Drag to reorder, rename, change button text, or hide a link without deleting it. DJ stores sit alongside the streaming majors. {release.autoReResolve && !release.resolvedAt && (release.upc || release.isrc ? "Apple Music, Deezer, Spotify and TIDAL fill in automatically from the UPC/ISRC: checked daily in the two weeks before release, then hourly once it's out." : "Add the UPC or ISRC in Settings so store links can be found automatically.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LinkEditor saveUrl={`/api/admin/releases/${release.id}/links`} reresolveUrl={`/api/admin/releases/${release.id}/reresolve`} initial={release.links.map((l) => ({ id: l.id, platform: l.platform, url: l.url, title: l.title, buttonText: l.buttonText, icon: l.icon, visible: l.visible }))} />
          </CardContent>
        </Card>
      )}
      {tab === "links" && (
        <StoreFinder
          query={`${release.artistName} ${release.title.replace(/\s*-\s*(single|ep)$/i, "")}`}
          have={release.links.map((l) => l.platform)}
          demand={Object.fromEntries(
            (await prisma.preSave.groupBy({ by: ["listenOn"], where: { releaseId: release.id, listenOn: { not: null } }, _count: { _all: true } })).map((g) => [g.listenOn!, g._count._all]),
          )}
        />
      )}

      {tab === "variants" && (
        <Card>
          <CardHeader><CardTitle>Link variants</CardTitle><CardDescription>One URL per placement, so every click and pre-save is attributed to its source.</CardDescription></CardHeader>
          <CardContent>
            <VariantManager releaseId={release.id} baseUrl={url} qrEnabled={plan.qr} variants={release.linkVariants.map((v) => ({ id: v.id, slug: v.slug, source: v.source, clicks: v.clicks }))} />
          </CardContent>
        </Card>
      )}

      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RangeTabs base={`/admin/releases/${release.id}?tab=analytics`} days={days} maxDays={plan.insightsDays} />
            {plan.csvExport && (
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline"><a href={`/api/admin/releases/${release.id}/export?type=clicks`}>Export clicks CSV</a></Button>
              </div>
            )}
          </div>
          <AnalyticsPanels perLink stats={await getStats([release.id], days, release.organization.timezone)} />
        </div>
      )}

      {tab === "presaves" && Number.isFinite(plan.releaseEmails) && (async () => {
        const emailFans = await prisma.preSave.count({ where: { releaseId: release.id, email: { not: null }, emailConsent: true } });
        if (emailFans <= plan.releaseEmails * 0.8) return null;
        const over = Math.max(0, emailFans - plan.releaseEmails);
        return (
          <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            {over > 0
              ? <><strong>{over} fan{over === 1 ? "" : "s"} won&apos;t get the release-day email.</strong> {plan.name} emails the first {plan.releaseEmails} pre-savers per release. </>
              : <><strong>{emailFans} of {plan.releaseEmails} release-day emails used.</strong> Fans past {plan.releaseEmails} still pre-save, but won&apos;t be emailed on {plan.name}. </>}
            <Link className="underline" href="/admin/settings/billing">Upgrade before release day</Link> and everyone gets it.
          </Card>
        );
      })()}
      {tab === "presaves" && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Pre-saves</CardTitle>
              <CardDescription>{presaveCounts.map((c) => `${c._count._all} ${c.status.replace(/_/g, " ")}`).join(" · ") || "None yet"}</CardDescription>
            </div>
            {plan.csvExport ? (
              <Button asChild size="sm" variant="outline"><a href={`/api/admin/releases/${release.id}/export?type=presaves`}>Export emails CSV</a></Button>
            ) : (
              <Badge variant="secondary">CSV export on paid plans</Badge>
            )}
          </CardHeader>
          <CardContent className="px-2">
            <PresaveTable timeZone={release.organization.timezone} locationLabel={release.organization.locationLabel} rows={await prisma.preSave.findMany({ where: { releaseId: release.id }, orderBy: { createdAt: "desc" }, take: 500 })} />
          </CardContent>
        </Card>
      )}

      {tab === "promo" && (async () => {
        const tz = release.organization.timezone;
        const [doneRows, orgReleases] = await Promise.all([
          prisma.promoTaskDone.findMany({ where: { releaseId: release.id }, select: { key: true } }),
          prisma.release.findMany({ where: { organizationId: user.organizationId }, select: { id: true } }),
        ]);
        const best = await busiestHour(orgReleases.map((r) => r.id), tz);
        const doneKeys = new Set(doneRows.map((d) => d.key));
        const today = zonedDay(new Date(), tz);
        const items = promoSteps(release.organization.kind === "artist" ? "artist" : "label").map((s) => {
          const d = stepDate(release.releaseDate, tz, s.day);
          const day = zonedDay(d, tz);
          return {
            key: s.key, day: s.day, title: s.title, body: s.body,
            href: s.href ?? (s.tab ? `/admin/releases/${release.id}?tab=${s.tab}` : null), external: !!s.href?.startsWith("http"),
            date: formatInTz(d, tz, { weekday: "short", day: "numeric", month: "short" }), overdue: day < today, today: day === today, done: doneKeys.has(s.key),
          };
        });
        return <PromoPlan releaseId={release.id} items={items} automatic={AUTOMATIC} bestTime={best ? `${best.label} (busiest day: ${best.topDay})` : null} />;
      })()}

      {tab === "share" && (async () => {
        const count = await prisma.preSave.count({ where: { releaseId: release.id } });
        return <ShareGraphics releaseId={release.id} live={live} presaves={count} milestones={MILESTONES.filter((m) => m <= count).slice(-3).reverse()} />;
      })()}

      {tab === "settings" && (
        <Card>
          <CardHeader><CardTitle>Release settings</CardTitle></CardHeader>
          <CardContent>
            <ReleaseSettingsForm
              releaseId={release.id}
              locationLabel={release.organization.locationLabel}
              soloArtist={release.organization.kind === "artist"}
              artists={(await prisma.artist.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, userId: true } })).map((a) => ({ id: a.id, name: a.name, hasLogin: !!a.userId }))}
              initial={{
                title: release.title, artistName: release.artistName, coverUrl: release.coverUrl, accentColor: release.accentColor ?? "", slug: release.slug,
                releaseDateLocal: dateToZonedLocal(release.releaseDate, release.organization.timezone), artistProfileId: release.artistProfileId ?? "", spotifyAlbumId: release.spotifyAlbumId ?? "",
                spotifyTrackId: release.spotifyTrackId ?? "", spotifyArtistId: release.spotifyArtistId ?? "", upc: release.upc ?? "", isrc: release.isrc ?? "", autoReResolve: release.autoReResolve, isPublic: release.isPublic, rollout: release.rollout === "global" ? "global" : "local",
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
