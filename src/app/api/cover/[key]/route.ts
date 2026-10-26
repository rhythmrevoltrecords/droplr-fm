import { NextResponse } from "next/server";
import { COVER_TYPES, coverCacheTag, readCover } from "@/lib/blobs";

// Even if something slipped into the store, the browser must never render it as a document.
const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
};

export async function GET(_: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  if (!/^[\w.-]+$/.test(params.key)) return new NextResponse("Bad key", { status: 400, headers: SAFE_HEADERS });
  try {
    const blob = await readCover(params.key);
    // Storage didn't answer in time: say so, and let nothing cache it. A real image must never be
    // remembered as missing because storage was slow for a moment.
    if (blob === "timeout") return new NextResponse("Storage is slow, try again", { status: 503, headers: { ...SAFE_HEADERS, "Cache-Control": "no-store", "Retry-After": "5" } });
    // Genuinely missing (a strong read, so not "uploaded a moment ago"): cached for a minute at the
    // edge, so a page still pointing at a deleted image doesn't run a function for every visitor.
    if (!blob) return new NextResponse("Not found", { status: 404, headers: { ...SAFE_HEADERS, "Cache-Control": "public, max-age=60", "Netlify-Cache-Tag": coverCacheTag(params.key) } });
    // Older uploads trusted the browser's file.type: only serve the image types we allow.
    if (!(COVER_TYPES as readonly string[]).includes(blob.contentType)) return new NextResponse("Not found", { status: 404, headers: SAFE_HEADERS });
    return new NextResponse(blob.data, { headers: { ...SAFE_HEADERS, "Content-Type": blob.contentType, "Cache-Control": "public, max-age=31536000, immutable", "Netlify-Cache-Tag": coverCacheTag(params.key) } });
  } catch {
    return new NextResponse("Blobs unavailable", { status: 404, headers: SAFE_HEADERS });
  }
}
