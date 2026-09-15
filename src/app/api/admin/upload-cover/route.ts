import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { uploadCover } from "@/lib/blobs";
import { accentFromBuffer } from "@/lib/color";

export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  try {
    const accentColor = await accentFromBuffer(Buffer.from(await file.arrayBuffer()));
    const url = await uploadCover(file);
    return NextResponse.json({ url, accentColor });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 400 });
  }
}
