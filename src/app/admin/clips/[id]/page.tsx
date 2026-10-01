import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ClipForgeLazy } from "@/components/admin/clip-forge-lazy";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { grantedRelease } from "@/lib/roster-grant";
import { isReleased } from "@/lib/time";

/**
 * Making a clip for a release a label put out under this artist's name.
 *
 * The artist can't open /admin/releases/[id] for it — that page is the label's editing surface and
 * is scoped to the caller's own organisation, which is exactly right. But a clip is not an edit.
 * Nothing here writes anything, and everything it needs (the artwork, the public link, the title)
 * is already on the public release page the artist can open anyway. So this is the one read-only
 * corner of a label's release that a linked artist reaches, and it is a page of its own rather than
 * a widened tab so the widening is visible in one file instead of hidden inside a guard.
 *
 * Authorisation is grantedRelease() and nothing else: the release must be in an organisation this
 * account holds an accepted link to, AND must name this account. A label's other artists' releases
 * resolve to null here exactly as they do everywhere else.
 */
export default async function GrantedClipPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser("label");

  // Their own release already has a Clip tab sitting next to its links, promo plan and analytics.
  // Send them there rather than rendering a second, thinner copy of the same tool.
  const own = await prisma.release.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
  if (own) redirect(`/admin/releases/${own.id}?tab=clip`);

  const release = await grantedRelease(user.id, id);
  if (!release) notFound();
  // Safe to read now: the release is authorised, and this is the organisation it belongs to.
  const label = await prisma.organization.findUnique({ where: { id: release.organizationId } });
  if (!label) notFound();

  const url = publicReleaseUrl(label, release.slug, SITE_URL);
  const live = isReleased(release.releaseDate);
  // The label's plan, not the artist's. It is the label's release and the label's link on the
  // clip, so the same release makes the same clip whichever side renders it — and a label that
  // paid to lose the mark doesn't get it back because its artist is on Free.
  const plan = planOf(label.plan);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Releases
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{release.title}</h1>
          <Badge variant="secondary">{label.name}</Badge>
          {live ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Pre-save</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {release.artistName} · <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">{url.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" /></a>
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Your label put this out, so it stays theirs to edit — but the clip is yours to make. It carries their link, which is the one the
          release lives on.
        </p>
      </div>

      <ClipForgeLazy
        releaseId={release.id}
        slug={release.slug}
        title={release.title}
        artistName={release.artistName}
        coverSrc={`/api/admin/releases/${release.id}/cover`}
        // The label's logo, for the same reason the plan above is the label's: one release
        // makes one clip whichever side renders it.
        logoSrc={label.logoUrl ? `/api/admin/releases/${release.id}/cover?part=logo` : null}
        accentColor={release.accentColor ?? label.accentColor}
        link={url}
        live={live}
        removeBranding={plan.removeBranding}
      />
    </div>
  );
}
