import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ClipForgeLazy } from "@/components/admin/clip-forge-lazy";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { isReleased } from "@/lib/time";

/**
 * An artist on a label's roster making a clip for their own release.
 *
 * The label put the release up, so the artist has no editing surface for it — but they are the one
 * posting about it, and until now all they could do here was copy the link. Nothing on this page
 * writes anything: it reads the title, the artwork and the public link, all of which are on the
 * release page anyone can open, and the render happens in their browser from the audio file on
 * their own computer.
 *
 * The scope is the one the dashboard list already uses, word for word: this organisation, and
 * assigned to this account. A release of the label's that isn't theirs resolves to null, exactly
 * as it does on the list they came from.
 */
export default async function ArtistClipPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser("artist");
  const release = await prisma.release.findFirst({
    where: { id, organizationId: user.organizationId, OR: [{ artistId: user.id }, { artistProfile: { userId: user.id } }] },
  });
  if (!release) notFound();

  const org = user.organization;
  const url = publicReleaseUrl(org, release.slug, SITE_URL);
  const live = isReleased(release.releaseDate);
  // The label's plan, because it is the label's release and the label's link on the clip.
  const plan = planOf(org.plan);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My releases
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{release.title}</h1>
          {live ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Pre-save</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
            {url.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <ClipForgeLazy
        releaseId={release.id}
        slug={release.slug}
        title={release.title}
        artistName={release.artistName}
        coverSrc={`/api/admin/releases/${release.id}/cover`}
        accentColor={release.accentColor ?? org.accentColor}
        link={url}
        live={live}
        removeBranding={plan.removeBranding}
      />
    </div>
  );
}
