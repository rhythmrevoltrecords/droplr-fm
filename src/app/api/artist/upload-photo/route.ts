import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { COVER_TYPE_ERROR, storeImage } from "@/lib/blobs";
import { accentFromBuffer } from "@/lib/color";
import { IMAGE_VALIDATION_ERRORS, processUpload, UPLOAD_MAX_BYTES, UPLOAD_TOO_BIG } from "@/lib/images";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

// Mirrors /api/admin/upload-cover for artist logins (profile + press photos).
const VALIDATION = new Set<string>([COVER_TYPE_ERROR, ...IMAGE_VALIDATION_ERRORS]);

export async function POST(req: NextRequest) {
  const user = await apiUser("any");
  if (!user || user.role !== "artist") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!(await allow(ipKey("artist-upload", clientIp(req.headers)), 30, 60 * 60 * 1000))) return NextResponse.json({ error: "Too many uploads. Try again in an hour." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  // Artists only upload their profile photo and press photos.
  const rawPurpose = form?.get("purpose") || "avatar";
  if (rawPurpose !== "avatar" && rawPurpose !== "press") return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  if (file.size > UPLOAD_MAX_BYTES) return NextResponse.json({ error: UPLOAD_TOO_BIG }, { status: 400 });
  try {
    // Always re-encode server side: the crop dialog is a convenience, clients can post anything.
    const img = await processUpload(Buffer.from(await file.arrayBuffer()), rawPurpose);
    const accentColor = await accentFromBuffer(img.buffer);
    const url = await storeImage(img.buffer, img.type, img.ext);
    return NextResponse.json({ url, accentColor, width: img.width, height: img.height });
  } catch (e) {
    const msg = (e as Error)?.message;
    if (VALIDATION.has(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[artist upload-photo]", e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
