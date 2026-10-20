import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { BioForm } from "@/components/admin/bio-form";
import { CopyButton } from "@/components/admin/copy-button";
import { LinkEditor } from "@/components/admin/link-editor";
import { QrDownload } from "@/components/admin/qr-download";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { bioPublicUrl } from "@/lib/bio";
import { bioLabelBadges } from "@/lib/bio-label-server";
import { linkedLabelNames } from "@/lib/bio-roster";
import { bioReleaseFor } from "@/lib/bio-release-server";
import { bioFontOf, bioThemeOf } from "@/lib/bio-themes";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { fmtNum } from "@/lib/utils";

export default async function EditBio(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await requireUser("label");
  const page = await prisma.bioPage.findFirst({ where: { id: params.id, organizationId: user.organizationId }, include: { links: { orderBy: { order: "asc" } } } });
  if (!page) notFound();
  const plan = planOf(user.organization.plan);
  const url = bioPublicUrl(user.organization, page.slug);
  const clicks = page.links.reduce((n, l) => n + l.clicks, 0);
  // Same resolver the public page uses, so the preview cannot drift from what a fan gets.
  const [artists, previewReleases, labelBadges, linkedLabels] = await Promise.all([
    prisma.artist.findMany({ where: { organizationId: user.organizationId, status: { not: "alumni" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Forced "on": the preview has to show what ticking the box would publish, which is the
    // only honest way to offer an opt-in. The form itself gates on the toggle.
    bioReleaseFor({ ...page, releaseBlock: "on" }, user.organization),
    // Resolved as if the artist had turned it on, same reason: an opt-in has to show what it
    // would publish. Empty unless a label has allowed it and the roster row is still active.
    bioLabelBadges({ ...page, labelBadge: "on" }, user.organization),
    user.organization.kind === "artist" ? linkedLabelNames(user.organizationId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{page.title}</h1>
          <p className="text-sm text-muted-foreground">{fmtNum(page.views)} views · {fmtNum(clicks)} link clicks</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="truncate rounded bg-secondary px-2 py-1 text-xs">{url}</code>
            <CopyButton value={url} />
            {plan.qr && <QrDownload value={url} filename={`bio-${page.slug}`} />}
            <Button asChild size="sm" variant="ghost"><a href={`/b/${page.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
          </div>
        </div>
      </div>

      {searchParams.created && <Card className="border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">Bio link created. Add your links below.</Card>}

      <Card>
        <CardHeader><CardTitle>Links</CardTitle><CardDescription>Drag to reorder. Each link gets the same glass button as your release pages. Clicks are counted.</CardDescription></CardHeader>
        <CardContent>
          <LinkEditor
            saveUrl={`/api/admin/bio/${page.id}/links`}
            initial={page.links.map((l) => ({ id: l.id, platform: l.platform, url: l.url, title: l.label, buttonText: l.buttonText, icon: l.icon, iconUrl: l.iconUrl, visible: l.isActive }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Page</CardTitle></CardHeader>
        <CardContent>
          <BioForm
            mode="edit"
            id={page.id}
            initial={{ title: page.title, slug: page.slug, bio: page.bio ?? "", imageUrl: page.imageUrl, accentColor: page.accentColor ?? "", theme: bioThemeOf(page.theme), font: bioFontOf(page.font), artistProfileId: page.artistProfileId ?? "", releaseBlock: page.releaseBlock ?? "", backgroundUrl: page.backgroundUrl ?? "", backgroundColor: page.backgroundColor ?? "", buttonColor: page.buttonColor ?? "", labelBadge: page.labelBadge ?? "", isPublic: page.isPublic }}
            previewLinks={page.links.filter((l) => l.isActive).map((l) => ({ id: l.id, platform: l.platform, label: l.label, buttonText: l.buttonText, icon: l.icon, iconUrl: l.iconUrl }))}
            glow={{ on: user.organization.publicGlow, color: user.organization.glowColor }}
            artists={artists}
            previewReleases={previewReleases}
            labelBadges={labelBadges}
            linkedLabels={linkedLabels}
            orgName={user.organization.name}
            showBranding={!plan.removeBranding}
          />
        </CardContent>
      </Card>
    </div>
  );
}
