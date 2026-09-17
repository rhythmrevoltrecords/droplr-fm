import { ArtistProfileEditor } from "@/components/admin/artist-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ARTIST_STATUS_LABELS, readSocialLinks } from "@/lib/artist-fields";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ArtistSelfProfilePage() {
  const user = await requireUser("artist");
  // Select only what the artist may see: contacts, stats and label notes never reach this page's HTML.
  const artist = await prisma.artist.findFirst({
    where: { userId: user.id, organizationId: user.organizationId },
    select: { name: true, status: true, genre: true, location: true, bio: true, website: true, socialLinks: true, photoUrl: true, accentColor: true, pressPhotoUrls: true },
  });

  if (!artist) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <Card className="p-10 text-center text-sm text-muted-foreground">{user.organization.name} hasn&apos;t set up your roster profile yet. Ask your label to add you, then you can edit your bio, photos and links here.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Your profile</h1>
          <Badge variant="secondary">{ARTIST_STATUS_LABELS[artist.status as keyof typeof ARTIST_STATUS_LABELS] ?? artist.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">What {user.organization.name} uses for press and pitching. Your name and status are managed by the label.</p>
      </div>
      <ArtistProfileEditor
        mode="artist"
        initial={{
          name: artist.name,
          status: artist.status,
          genre: artist.genre ?? "",
          location: artist.location ?? "",
          bio: artist.bio ?? "",
          website: artist.website ?? "",
          socialLinks: readSocialLinks(artist.socialLinks),
          photoUrl: artist.photoUrl ?? "",
          accentColor: artist.accentColor ?? "",
          pressPhotoUrls: artist.pressPhotoUrls,
          email: "", phone: "", spotifyArtistId: "", monthlyListeners: "", followers: "", notes: "", signedAt: "",
        }}
      />
    </div>
  );
}
