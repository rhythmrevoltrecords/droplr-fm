import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/analytics";
import { apiUser } from "@/lib/auth";
import { fanExportRows } from "@/lib/fans";
import { isListenChoice } from "@/lib/platforms";
import { planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Fan list CSV (same filters as the page). news_opt_in is the column that says who can get
 * non-release email, and `source` says whether the address came from a pre-save, a bio page or
 * an import. The paid gate stays: what it buys is the file, not the data — every address is
 * visible on the Free fan list and always has been.
 */
export async function GET(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!planOf(user.organization.plan).csvExport) return NextResponse.json({ error: "Export is on paid plans" }, { status: 402 });
  const sp = req.nextUrl.searchParams;
  const store = sp.get("store");
  const country = sp.get("country") ?? "";
  const rows = await fanExportRows(user.organizationId, {
    q: sp.get("q")?.trim().slice(0, 100) || undefined,
    news: sp.get("news") === "1",
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
    listenOn: isListenChoice(store) ? store : undefined,
  });
  const csv = toCsv(rows);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${user.organization.slug}-fans.csv"`, "Cache-Control": "no-store, private" } });
}
