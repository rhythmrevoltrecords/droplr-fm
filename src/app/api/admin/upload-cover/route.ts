import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { COVER_TYPE_ERROR, storeImage } from "@/lib/blobs";
import { accentFromBuffer } from "@/lib/color";
import { IMAGE_VALIDATION_ERRORS, isImagePurpose, processUpload, UPLOAD_MAX_BYTES, UPLOAD_TOO_BIG } from "@/lib/images";

// Messages processUpload throws on purpose; anything else is an internal error and stays in the logs.
const VALIDATION = new Set<string>([COVER_TYPE_ERROR, ...IMAGE_VALIDATION_ERRORS]);

export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const purpose = form?.get("purpose") || "cover";
  if (!isImagePurpose(purpose)) return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  if (file.size > UPLOAD_MAX_BYTES) return NextResponse.json({ error: UPLOAD_TOO_BIG }, { status: 400 });
  try {
    // Always re-encode server side: the crop dialog is a convenience, clients can post anything.
    const img = await processUpload(Buffer.from(await file.arrayBuffer()), purpose);
    const accentColor = await accentFromBuffer(img.buffer);
    const url = await storeImage(img.buffer, img.type, img.ext);
    return NextResponse.json({ url, accentColor, width: img.width, height: img.height });
  } catch (e) {
    const msg = (e as Error)?.message;
    if (VALIDATION.has(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[upload-cover]", e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
