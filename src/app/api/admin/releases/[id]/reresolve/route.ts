import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { reResolveRelease } from "@/lib/presave-processor";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const g = await labelRelease(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const added = await reResolveRelease(g.release.id);
  return NextResponse.json({ added, note: added ? undefined : "Odesli found nothing new (common before release day)." });
}
