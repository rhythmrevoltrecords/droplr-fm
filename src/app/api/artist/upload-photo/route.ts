import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { COVER_TYPE_ERROR, sniffImage, uploadCover } from "@/lib/blobs";
import { accentFromBuffer } from "@/lib/color";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

// Mirrors /api/admin/upload-cover for artist logins (profile + press photos).
const VALIDATION = new Set([COVER_TYPE_ERROR, "Cover must be under 8MB"]);

export async function POST(req: NextRequest) {
  const user = await apiUser("any");
  if (!user || user.role !== "artist") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!(await allow(ipKey("artist-upload", clientIp(req.headers)), 30, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many uploads. Try again in an hour." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Photo must be under 8MB" }, { status: 400 });
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    // Sniff before decoding: don't hand arbitrary bytes to the image decoder.
    if (!sniffImage(buf)) return NextResponse.json({ error: COVER_TYPE_ERROR }, { status: 400 });
    const accentColor = await accentFromBuffer(buf);
    const url = await uploadCover(file);
    return NextResponse.json({ url, accentColor });
  } catch (e) {
    const msg = (e as Error)?.message;
    if (VALIDATION.has(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[artist upload-photo]", e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
