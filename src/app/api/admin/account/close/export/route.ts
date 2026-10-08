import { NextResponse } from "next/server";
import { toCsv } from "@/lib/analytics";
import { apiUser } from "@/lib/auth";
import { listFans } from "@/lib/fans";

export const dynamic = "force-dynamic";

/**
 * The fan list, on the way out, on every plan including Free.
 *
 * `csvExport` is deliberately NOT checked here. The paid gate was never hiding the data — every
 * address is visible on the Free fan list and always has been — so what is paid for is the
 * convenience of a file, and charging for that at the moment someone leaves is the exact behaviour
 * droplr was built to argue with. Owner only, because closing the account is an owner's decision
 * and this is part of that flow.
 */
export async function GET() {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Only the account owner can do this" }, { status: 403 });

  const rows = await listFans(user.organizationId, {}, 50_000, 0);
  const csv = toCsv(rows.map((f) => ({
    email: f.email, news_opt_in: f.news, unsubscribed: f.unsubscribed, listens_on: f.listenOn ?? "", country: f.country ?? "", timezone: f.timezone ?? "",
    releases_pre_saved: f.releases, first_pre_save: f.firstSeen, last_pre_save: f.lastSeen, clicked_release_email: f.clicked,
  })));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${user.organization.slug}-fans-final.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
