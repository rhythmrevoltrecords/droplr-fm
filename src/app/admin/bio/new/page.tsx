import { BioForm } from "@/components/admin/bio-form";
import { requireUser } from "@/lib/auth";
import { DEFAULT_BIO_FONT, DEFAULT_BIO_THEME } from "@/lib/bio-themes";
import { bioReleaseFor } from "@/lib/bio-release-server";
import { linkedLabelNames } from "@/lib/bio-roster";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { DEFAULT_MERCH_DISPLAY } from "@/lib/bio-items";
import { socialsFor } from "@/lib/bio-socials";
import { slugify } from "@/lib/utils";

export default async function NewBio() {
  const user = await requireUser("label");
  const [artists, previewReleases, linkedLabels] = await Promise.all([
    prisma.artist.findMany({ where: { organizationId: user.organizationId, status: { not: "alumni" } }, orderBy: { name: "asc" }, select: { id: true, name: true, photoUrl: true, accentColor: true, socialLinks: true } }),
    bioReleaseFor({ organizationId: user.organizationId, artistProfileId: null, releaseBlock: "on" }, user.organization),
    user.organization.kind === "artist" ? linkedLabelNames(user.organizationId) : Promise.resolve([]),
  ]);
  // Start from what droplr already knows instead of three empty boxes. The name was typed at signup
  // and is the account's name; an artist account's photo is on its one profile, which the tour
  // sends them to first. A label's page has no single right photo, so it is left for them to pick.
  const own = user.organization.kind === "artist" && artists.length === 1 ? artists[0] : null;
  const title = user.organization.name.slice(0, 100);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New bio link</h1>
      <BioForm
        mode="create"
        initial={{ title, slug: slugify(title), bio: "", imageUrl: own?.photoUrl ?? "", accentColor: own?.photoUrl ? (own.accentColor ?? "") : "", theme: DEFAULT_BIO_THEME, font: DEFAULT_BIO_FONT, artistProfileId: "", releaseBlock: "on", backgroundUrl: "", backgroundColor: "", buttonColor: "", labelBadge: "", subscribe: "on", subscribeText: "", sectionOrder: "", gallery: "", socialIcons: "on", isPublic: true }}
        glow={{ on: user.organization.publicGlow, color: user.organization.glowColor }}
        artists={artists.map((a) => ({ id: a.id, name: a.name }))}
        previewReleases={previewReleases}
        linkedLabels={linkedLabels}
        orgName={user.organization.name}
        showBranding={!planOf(user.organization.plan).removeBranding}
        previewMerch={[]}
        previewVideos={[]}
        previewMerchDisplay={DEFAULT_MERCH_DISPLAY}
        socialsFor={socialsFor(artists, user.organization.kind)}
        previewLinks={[{ id: "p1", platform: "spotify", label: "Latest release" }, { id: "p2", platform: "bandcamp", label: "Merch" }]}
      />
    </div>
  );
}
