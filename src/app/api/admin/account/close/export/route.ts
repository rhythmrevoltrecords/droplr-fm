import { NextResponse } from "next/server";
import { toCsv } from "@/lib/analytics";
import { apiUser } from "@/lib/auth";
import { fanExportRows } from "@/lib/fans";

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

  // Unfiltered on purpose: this is the whole list, pre-save fans and contacts together.
  const rows = await fanExportRows(user.organizationId, {});
  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${user.organization.slug}-fans-final.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
