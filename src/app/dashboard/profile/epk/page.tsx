import Link from "next/link";
import { PressKit, pressKitGaps, type PressKitData } from "@/components/press/press-kit";
import { TemplateActions } from "@/components/templates/template-actions";
import { Card } from "@/components/ui/card";
import { readSocialLinks } from "@/lib/artist-fields";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Press kit" };

export default async function OwnPressKit() {
  const user = await requireUser("artist");
  // Only fields the artist may see: label-only notes, phone and stats stay out.
  const artist = await prisma.artist.findFirst({
    where: { userId: user.id, organizationId: user.organizationId },
    select: { id: true, name: true, genre: true, location: true, bio: true, website: true, socialLinks: true, photoUrl: true, pressPhotoUrls: true },
  });
  if (!artist) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Press kit</h1>
        <Card className="p-10 text-center text-sm text-muted-foreground">{user.organization.name} hasn&apos;t set up your profile yet.</Card>
      </div>
    );
  }
  const org = user.organization;
  const releases = await prisma.release.findMany({
    where: { artistProfileId: artist.id, organizationId: user.organizationId },
    orderBy: { releaseDate: "desc" },
    take: 6,
    select: { title: true, slug: true, releaseDate: true },
  });
  const host = SITE_URL.replace(/^https?:\/\//, "");
  const data: PressKitData = {
    name: artist.name,
    genre: artist.genre,
    location: artist.location,
    bio: artist.bio,
    website: artist.website,
    photoUrl: artist.photoUrl,
    pressPhotoUrls: artist.pressPhotoUrls,
    socials: readSocialLinks(artist.socialLinks),
    contactEmail: user.email,
    contactLabel: "Bookings and press",
    labelName: org.kind === "artist" ? undefined : org.name,
    linkUrl: `${host}/${org.slug}`,
    releases: releases.map((r) => ({ title: r.title, date: formatInTz(r.releaseDate, org.timezone, { dateStyle: "medium" }), url: `${host}/${org.slug}/${r.slug}` })),
  };
  const gaps = pressKitGaps(data);
  return (
    <div className="space-y-6">
      <div className="no-print max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground"><Link href="/dashboard/profile" className="hover:underline">Your profile</Link> / Press kit</p>
        <div>
          <h1 className="text-2xl font-semibold">Press kit</h1>
          <p className="mt-1 text-muted-foreground">Built from your profile. Send it to promoters, radio and labels.</p>
        </div>
        {gaps.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            Still missing {gaps.join(", ")}. <Link href="/dashboard/profile" className="underline">Add it to your profile</Link> and this page fills itself.
          </Card>
        )}
        <TemplateActions text={`${data.name}\n${[data.genre, data.location].filter(Boolean).join(" · ")}\n\n${data.bio ?? ""}\n\nLinks: ${data.linkUrl ?? ""}\n${Object.entries(data.socials).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nContact: ${data.contactEmail ?? ""}`} />
        <p className="text-xs text-muted-foreground">Print, then choose <strong>Save as PDF</strong> to get a file you can email or attach.</p>
      </div>
      <PressKit data={data} />
    </div>
  );
}
