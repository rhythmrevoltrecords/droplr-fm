import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { labelRelease } from "@/lib/admin-guard";
import { SITE_URL } from "@/lib/env";
import { disableReport, enableReport, reportUrlPath } from "@/lib/report";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["enable", "rotate", "disable"]) });

/**
 * Turn the shareable report on or off for one release.
 * "rotate" issues a new token, which kills the old link — the way you take back a report
 * you sent to the wrong person.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await labelRelease((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (parsed.data.action === "disable") {
    await disableReport(got.release.id);
    return NextResponse.json({ ok: true, url: null });
  }
  const token = await enableReport(got.release.id);
  return NextResponse.json({ ok: true, url: `${SITE_URL}${reportUrlPath(token)}` });
}
