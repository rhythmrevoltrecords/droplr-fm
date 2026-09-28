import { NextResponse, type NextRequest } from "next/server";
import { apiUser, isLabelRole } from "@/lib/auth";
import { fetchPublicImage } from "@/lib/color";
import { prisma } from "@/lib/db";
import { grantedRelease } from "@/lib/roster-grant";

/**
 * This release's artwork, served from droplr's own origin.
 *
 * The clip renderer draws the cover onto a canvas and then reads pixels back out of it. A cover
 * that came from a store's CDN taints the canvas unless that CDN happens to send CORS headers,
 * and a tainted canvas can't be encoded at all — so the artist would get "render failed" for a
 * release whose artwork droplr pulled in automatically.
 *
 * The fetch goes through fetchPublicImage, which is the same hardened path accentFromBuffer uses:
 * public HTTPS only, no redirects (a public host could otherwise bounce us to an internal
 * address after the check), a size cap and an image/* content type. This adds no new outbound
 * surface — it reaches exactly the URL already stored on the release.
 */
export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const found = await coverFor((await ctx.params).id);
  if ("status" in found) return new NextResponse(found.status === 401 ? "Unauthorised" : "Not found", { status: found.status, headers: SAFE_HEADERS });
  const release = found;

  // Already ours: hand back a redirect rather than proxying our own blob store through a function.
  if (release.coverUrl.startsWith("/")) return NextResponse.redirect(new URL(release.coverUrl, _req.nextUrl), 302);

  const buf = await fetchPublicImage(release.coverUrl);
  if (!buf) return new NextResponse("Not found", { status: 404, headers: SAFE_HEADERS });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      ...SAFE_HEADERS,
      // Sniffed from the bytes rather than trusted from the remote header; fetchPublicImage has
      // already refused anything that didn't declare image/*.
      "Content-Type": contentType(buf),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/**
 * Who may read a release's artwork, and by which route.
 *
 * Three ways in, each scoped on its own, and no fourth. Anyone who can make a clip of a release
 * needs its artwork from droplr's origin or the canvas taints and nothing encodes, so this is
 * deliberately the widest read in the release API — which is why the ways in are listed here by
 * name rather than hidden behind one clever query.
 *
 * 1. A label reading its own release.
 * 2. An artist account a label has linked to its roster, for a release naming them (grantedRelease:
 *    accepted link, and the release names this account).
 * 3. An artist on the label's roster, signed in to the label's organisation, for a release assigned
 *    to them — the same scope their own dashboard list uses.
 *
 * Everything else is a 404, including a signed-in label asking about an id that isn't theirs, so no
 * one learns which ids exist.
 */
async function coverFor(id: string): Promise<{ coverUrl: string } | { status: 401 | 404 }> {
  const user = await apiUser();
  if (!user) return { status: 401 };
  const pick = { coverUrl: true } as const;

  if (isLabelRole(user.role)) {
    const own = await prisma.release.findFirst({ where: { id, organizationId: user.organizationId }, select: pick });
    if (own?.coverUrl) return { coverUrl: own.coverUrl };
    const granted = await grantedRelease(user.id, id);
    return granted?.coverUrl ? { coverUrl: granted.coverUrl } : { status: 404 };
  }

  const assigned = await prisma.release.findFirst({
    where: { id, organizationId: user.organizationId, OR: [{ artistId: user.id }, { artistProfile: { userId: user.id } }] },
    select: pick,
  });
  return assigned?.coverUrl ? { coverUrl: assigned.coverUrl } : { status: 404 };
}

function contentType(buf: Buffer) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[8] === 0x57 && buf[9] === 0x45) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  return "image/jpeg";
}
