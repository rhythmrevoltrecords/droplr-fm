import { NextResponse } from "next/server";
import { readCover } from "@/lib/blobs";

export async function GET(_: Request, { params }: { params: { key: string } }) {
  if (!/^[\w.-]+$/.test(params.key)) return new NextResponse("Bad key", { status: 400 });
  try {
    const blob = await readCover(params.key);
    if (!blob) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(blob.data, { headers: { "Content-Type": blob.contentType, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Blobs unavailable", { status: 404 });
  }
}
