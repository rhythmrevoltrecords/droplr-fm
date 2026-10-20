import { BioForm } from "@/components/admin/bio-form";
import { requireUser } from "@/lib/auth";
import { DEFAULT_BIO_FONT, DEFAULT_BIO_THEME } from "@/lib/bio-themes";
import { bioReleaseFor } from "@/lib/bio-release-server";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";

export default async function NewBio() {
  const user = await requireUser("label");
  const [artists, previewReleases] = await Promise.all([
    prisma.artist.findMany({ where: { organizationId: user.organizationId, status: { not: "alumni" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    bioReleaseFor({ organizationId: user.organizationId, artistProfileId: null, releaseBlock: "on" }, user.organization),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New bio link</h1>
      <BioForm
        mode="create"
        initial={{ title: "", slug: "", bio: "", imageUrl: "", accentColor: "", theme: DEFAULT_BIO_THEME, font: DEFAULT_BIO_FONT, artistProfileId: "", releaseBlock: "on", backgroundUrl: "", backgroundColor: "", buttonColor: "", labelBadge: "", isPublic: true }}
        glow={{ on: user.organization.publicGlow, color: user.organization.glowColor }}
        artists={artists}
        previewReleases={previewReleases}
        orgName={user.organization.name}
        showBranding={!planOf(user.organization.plan).removeBranding}
        previewLinks={[{ id: "p1", platform: "spotify", label: "Latest release" }, { id: "p2", platform: "bandcamp", label: "Merch" }]}
      />
    </div>
  );
}
