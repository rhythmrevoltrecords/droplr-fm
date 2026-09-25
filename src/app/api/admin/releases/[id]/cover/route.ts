import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { fetchPublicImage } from "@/lib/color";
import { prisma } from "@/lib/db";

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
  const user = await apiUser("label");
  if (!user) return new NextResponse("Unauthorised", { status: 401, headers: SAFE_HEADERS });
  const release = await prisma.release.findFirst({
    where: { id: (await ctx.params).id, organizationId: user.organizationId },
    select: { coverUrl: true },
  });
  // 404 either way, so another label learns nothing about which ids exist.
  if (!release?.coverUrl) return new NextResponse("Not found", { status: 404, headers: SAFE_HEADERS });

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

function contentType(buf: Buffer) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[8] === 0x57 && buf[9] === 0x45) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  return "image/jpeg";
}
