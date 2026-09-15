import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/analytics";
import { apiUser, isLabelRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";

/** CSV export. Label users: any release in org. Artists: presaves for their own releases only. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const release = await prisma.release.findFirst({
    where: { id: params.id, organizationId: user.organizationId, ...(isLabelRole(user.role) ? {} : { artistId: user.id }) },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!planOf(user.organization.plan).csvExport) return NextResponse.json({ error: "CSV export is on Pro and above" }, { status: 402 });

  const type = req.nextUrl.searchParams.get("type") === "clicks" && isLabelRole(user.role) ? "clicks" : "presaves";
  let csv: string;
  if (type === "clicks") {
    const rows = await prisma.clickEvent.findMany({ where: { releaseId: release.id }, orderBy: { createdAt: "desc" }, take: 100_000 });
    csv = toCsv(rows.map((r) => ({ createdAt: r.createdAt, platform: r.platform, source: r.source, utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign, country: r.country, deviceType: r.deviceType, referrer: r.referrer, fromReleaseEmail: r.convertedToPreSave })));
  } else {
    const rows = await prisma.preSave.findMany({ where: { releaseId: release.id }, orderBy: { createdAt: "desc" } });
    csv = toCsv(rows.map((r) => ({ createdAt: r.createdAt, email: r.emailConsent ? r.email : "", consent: r.emailConsent, platform: r.platform, status: r.status, source: r.source, country: r.country, emailSentAt: r.emailSentAt, clickedAt: r.clickedAt, completedAt: r.completedAt })));
  }
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${release.slug}-${type}.csv"` },
  });
}
