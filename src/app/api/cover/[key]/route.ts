import { NextResponse } from "next/server";
import { COVER_TYPES, readCover } from "@/lib/blobs";

// Even if something slipped into the store, the browser must never render it as a document.
const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
};

export async function GET(_: Request, { params }: { params: { key: string } }) {
  if (!/^[\w.-]+$/.test(params.key)) return new NextResponse("Bad key", { status: 400, headers: SAFE_HEADERS });
  try {
    const blob = await readCover(params.key);
    if (!blob) return new NextResponse("Not found", { status: 404, headers: SAFE_HEADERS });
    // Older uploads trusted the browser's file.type: only serve the image types we allow.
    if (!(COVER_TYPES as readonly string[]).includes(blob.contentType)) return new NextResponse("Not found", { status: 404, headers: SAFE_HEADERS });
    return new NextResponse(blob.data, { headers: { ...SAFE_HEADERS, "Content-Type": blob.contentType, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Blobs unavailable", { status: 404, headers: SAFE_HEADERS });
  }
}
