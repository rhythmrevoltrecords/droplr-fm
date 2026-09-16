import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8888").replace(/\/$/, "");
const cover = (title: string, a: string, b: string) =>
  `${SITE}/api/cover-art?title=${encodeURIComponent(title)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;

async function main() {
  // Platform org (droplr.fm itself). customDomain is informational — middleware always treats droplr.fm as the platform host.
  await prisma.organization.upsert({
    where: { slug: "droplr" },
    update: {},
    create: { name: "Droplr", slug: "droplr", customDomain: "droplr.fm", plan: "enterprise" },
  });

  // Customer #1
  const rrr = await prisma.organization.upsert({
    where: { slug: "rhythm-revolt" },
    update: { customDomain: "presave.rhythmrevoltrecords.com", plan: "pro" },
    create: {
      name: "Rhythm Revolt Records",
      slug: "rhythm-revolt",
      customDomain: "presave.rhythmrevoltrecords.com",
      plan: "pro",
      emailFromName: "Rhythm Revolt Records",
      // Spotify BYO creds intentionally empty — add in /admin/settings/integrations
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@rhythmrevoltrecords.com" },
    update: {},
    create: { email: "owner@rhythmrevoltrecords.com", passwordHash: await bcrypt.hash("admin123", 12), role: "owner", organizationId: rrr.id },
  });
  const artist = await prisma.user.upsert({
    where: { email: "artist@rhythmrevoltrecords.com" },
    update: {},
    create: { email: "artist@rhythmrevoltrecords.com", passwordHash: await bcrypt.hash("demo123", 12), role: "artist", artistName: "OTOTO", organizationId: rrr.id },
  });

  const day = 86400_000;

  // Upcoming → pre-save view
  const upcoming = await prisma.release.upsert({
    where: { slug: "demo-presave" },
    update: { releaseDate: new Date(Date.now() + 10 * day) },
    create: {
      organizationId: rrr.id,
      artistId: artist.id,
      slug: "demo-presave",
      title: "Night Bus Dubplate",
      artistName: "OTOTO",
      coverUrl: cover("Night Bus Dubplate", "#7C3AED", "#EC4899"),
      accentColor: "#A855F7",
      spotifyUrl: "https://open.spotify.com/album/0000000000000000000000",
      spotifyAlbumId: "0000000000000000000000",
      releaseDate: new Date(Date.now() + 10 * day),
      status: "upcoming",
      autoReResolve: true,
      platformLinks: {
        create: [{ platform: "spotify", url: "https://open.spotify.com/album/0000000000000000000000", order: 0 }],
      },
      linkVariants: { create: [{ slug: "ig", source: "instagram" }, { slug: "tiktok", source: "tiktok" }, { slug: "bio", source: "bio" }] },
    },
  });

  // Live → smart link view
  const live = await prisma.release.upsert({
    where: { slug: "demo-release" },
    update: {},
    create: {
      organizationId: rrr.id,
      artistId: artist.id,
      slug: "demo-release",
      title: "Two Step Theory",
      artistName: "OTOTO",
      coverUrl: cover("Two Step Theory", "#0EA5E9", "#22C55E"),
      accentColor: "#22D3EE",
      spotifyUrl: "https://open.spotify.com/album/1111111111111111111111",
      spotifyAlbumId: "1111111111111111111111",
      releaseDate: new Date(Date.now() - 20 * day),
      status: "live",
      resolvedAt: new Date(),
      platformLinks: {
        create: [
          { platform: "spotify", url: "https://open.spotify.com/album/1111111111111111111111", order: 0 },
          { platform: "appleMusic", url: "https://music.apple.com/au/album/example/1", order: 1 },
          { platform: "beatport", url: "https://www.beatport.com/release/example/1", order: 2, isCustom: true },
          { platform: "traxsource", url: "https://www.traxsource.com/title/1/example", order: 3, isCustom: true },
          { platform: "bandcamp", url: "https://rhythmrevoltrecords.bandcamp.com/album/example", order: 4, isCustom: true },
          { platform: "youtubeMusic", url: "https://music.youtube.com/playlist?list=example", order: 5 },
          { platform: "soundcloud", url: "https://soundcloud.com/ototo/example", order: 6 },
          { platform: "juno", url: "https://www.junodownload.com/products/example/1-02/", order: 7, isCustom: true },
          { platform: "deezer", url: "https://www.deezer.com/album/1", order: 8 },
          { platform: "tidal", url: "https://tidal.com/browse/album/1", order: 9 },
        ],
      },
      linkVariants: { create: [{ slug: "ig", source: "instagram" }, { slug: "tiktok", source: "tiktok" }, { slug: "bio", source: "bio" }] },
    },
    include: { linkVariants: true },
  });

  // Bio link page — same artwork system (image → vibrant accent → blurred glow)
  await prisma.bioPage.upsert({
    where: { slug: "ototo" },
    update: {},
    create: {
      organizationId: rrr.id,
      slug: "ototo",
      title: "OTOTO",
      bio: "UK garage, speed garage & stutter house from Brisbane.",
      imageUrl: cover("OTOTO", "#F59E0B", "#DB2777"),
      accentColor: "#F59E0B",
      links: {
        create: [
          { platform: "spotify", label: "New single: Two Step Theory", url: "https://open.spotify.com/album/1111111111111111111111", order: 0 },
          { platform: "custom", label: "Pre-save Night Bus Dubplate", url: `${SITE}/rhythm-revolt/demo-presave`, order: 1 },
          { platform: "bandcamp", label: "Merch & vinyl", url: "https://rhythmrevoltrecords.bandcamp.com", order: 2 },
          { platform: "soundcloud", label: "Mixes", url: "https://soundcloud.com/ototo", order: 3 },
          { platform: "custom", label: "Rhythm Revolt Records", url: "https://rhythmrevoltrecords.com", order: 4 },
        ],
      },
    },
  });

  // Sample analytics for the live release (only when empty)
  if ((await prisma.pageView.count({ where: { releaseId: live.id } })) === 0) {
    const variants = await prisma.linkVariant.findMany({ where: { releaseId: live.id } });
    const sources = [...variants.map((v) => ({ id: v.id, source: v.source })), { id: null, source: "direct" }];
    const platforms = ["spotify", "spotify", "spotify", "appleMusic", "beatport", "beatport", "traxsource", "bandcamp", "youtubeMusic", "soundcloud"];
    const countries = ["AU", "AU", "AU", "GB", "GB", "US", "NZ", "DE"];
    const devices = ["mobile", "mobile", "mobile", "desktop"];
    const views: object[] = [];
    const clicks: object[] = [];
    for (let i = 0; i < 900; i++) {
      const s = sources[i % sources.length];
      const at = new Date(Date.now() - Math.floor(Math.random() * 30 * day));
      const common = { releaseId: live.id, variantId: s.id, source: s.source, country: countries[i % countries.length], deviceType: devices[i % devices.length], createdAt: at, anonId: `seed-${i}` };
      views.push(common);
      if (Math.random() < 0.42) clicks.push({ ...common, platform: platforms[Math.floor(Math.random() * platforms.length)] });
    }
    await prisma.pageView.createMany({ data: views as never });
    await prisma.clickEvent.createMany({ data: clicks as never });

    const ups = await prisma.release.findUnique({ where: { id: upcoming.id }, include: { linkVariants: true } });
    await prisma.pageView.createMany({
      data: Array.from({ length: 140 }, (_, i) => ({ releaseId: upcoming.id, source: ["instagram", "tiktok", "bio", "direct"][i % 4], variantId: ups?.linkVariants[i % 3]?.id, country: countries[i % countries.length], deviceType: "mobile", createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * day)) })),
    });
    await prisma.preSave.createMany({
      data: Array.from({ length: 24 }, (_, i) => ({
        releaseId: upcoming.id,
        platform: "email",
        email: `fan${i + 1}@example.com`,
        emailConsent: true,
        source: ["instagram", "tiktok", "bio", "direct"][i % 4],
        status: "pending",
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * day)),
      })),
    });
  }

  console.log("Seeded:");
  console.log("  org      rhythm-revolt  (plan pro, domain presave.rhythmrevoltrecords.com)");
  console.log(`  owner    ${owner.email} / admin123`);
  console.log(`  artist   ${artist.email} / demo123`);
  console.log(`  releases /rhythm-revolt/${upcoming.slug} (pre-save), /rhythm-revolt/${live.slug} (smart link)`);
  console.log("  bio      /b/ototo");
  console.log("  ⚠ Change both passwords before this goes anywhere public.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
