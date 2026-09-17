import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Answered on every host: droplr's domain setup fetches https://<label domain>/api/domain-check to confirm it reaches droplr. */
export function GET(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return NextResponse.json({ service: "droplr.fm", host }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
