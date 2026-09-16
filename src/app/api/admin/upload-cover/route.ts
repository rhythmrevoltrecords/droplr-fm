import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { COVER_TYPE_ERROR, sniffImage, uploadCover } from "@/lib/blobs";
import { accentFromBuffer } from "@/lib/color";

// Messages uploadCover throws on purpose; anything else is an internal error and stays in the logs.
const VALIDATION = new Set([COVER_TYPE_ERROR, "Cover must be under 8MB"]);

export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Cover must be under 8MB" }, { status: 400 });
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
    console.error("[upload-cover]", e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
