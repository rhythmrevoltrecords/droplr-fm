import Link from "next/link";
import { notFound } from "next/navigation";
import { PressKit, pressKitGaps, type PressKitData } from "@/components/press/press-kit";
import { TemplateActions } from "@/components/templates/template-actions";
import { Card } from "@/components/ui/card";
import { readSocialLinks } from "@/lib/artist-fields";
import { labelArtist } from "@/lib/artists";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Press kit" };

export default async function ArtistPressKit(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser("label");
  const artist = await labelArtist(user, id);
  if (!artist) notFound();
  const releases = await prisma.release.findMany({
    where: { artistProfileId: artist.id, organizationId: user.organizationId },
    orderBy: { releaseDate: "desc" },
    take: 6,
    select: { title: true, slug: true, releaseDate: true },
  });
  const org = user.organization;
  const data: PressKitData = {
    name: artist.name,
    genre: artist.genre,
    location: artist.location,
    bio: artist.bio,
    website: artist.website,
    photoUrl: artist.photoUrl,
    pressPhotoUrls: artist.pressPhotoUrls,
    socials: readSocialLinks(artist.socialLinks),
    monthlyListeners: artist.monthlyListeners,
    followers: artist.followers,
    contactEmail: artist.email ?? null,
    contactLabel: org.kind === "artist" ? "Bookings and press" : "Artist",
    labelName: org.kind === "artist" ? undefined : org.name,
    linkUrl: `${SITE_URL.replace(/^https?:\/\//, "")}/${org.slug}`,
    releases: releases.map((r) => ({ title: r.title, date: formatInTz(r.releaseDate, org.timezone, { dateStyle: "medium" }), url: `${SITE_URL.replace(/^https?:\/\//, "")}/${org.slug}/${r.slug}` })),
  };
  const gaps = pressKitGaps(data);
  const back = `/admin/artists/${artist.id}`;
  return (
    <div className="space-y-6">
      <div className="no-print max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground"><Link href={back} className="hover:underline">{artist.name}</Link> / Press kit</p>
        <div>
          <h1 className="text-2xl font-semibold">Press kit</h1>
          <p className="mt-1 text-muted-foreground">Built from the profile. Update the profile and this updates with it: nothing to re-type.</p>
        </div>
        {gaps.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            Still missing {gaps.join(", ")}. <Link href={back} className="underline">Fill it in on the profile</Link> and this page fills itself.
          </Card>
        )}
        <TemplateActions text={`${data.name}\n${[data.genre, data.location].filter(Boolean).join(" · ")}\n\n${data.bio ?? ""}\n\nLinks: ${data.linkUrl ?? ""}\n${Object.entries(data.socials).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nContact: ${data.contactEmail ?? ""}`} />
        <p className="text-xs text-muted-foreground">Print, then choose <strong>Save as PDF</strong> to get a file you can email or attach.</p>
      </div>
      <PressKit data={data} />
    </div>
  );
}
