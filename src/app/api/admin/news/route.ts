import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canSendNews, NEWS_BODY_MAX, NEWS_SUBJECT_MAX, newsAudienceCounts } from "@/lib/news";
import { isListenChoice } from "@/lib/platforms";

export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(1, "Give it a subject").max(NEWS_SUBJECT_MAX),
  body: z.string().trim().min(1, "Write something").max(NEWS_BODY_MAX),
  buttonLabel: z.string().trim().max(40).nullable().optional(),
  buttonUrl: z.string().trim().url("The button needs a full https:// link").nullable().optional(),
  filterCountry: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  filterListenOn: z.string().max(40).nullable().optional(),
  filterReleaseId: z.string().max(40).nullable().optional(),
});

/** GET /api/admin/news?country=&store=&release= → how many fans this would reach right now. */
export async function GET(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const country = /^[A-Z]{2}$/.test(sp.get("country") ?? "") ? sp.get("country") : null;
  const store = isListenChoice(sp.get("store")) ? sp.get("store") : null;
  const releaseId = sp.get("release") || null;
  // A release id from another label would leak its existence, so scope it first.
  const release = releaseId ? await prisma.release.findFirst({ where: { id: releaseId, organizationId: user.organizationId }, select: { id: true } }) : null;
  const { total, noTimezone } = await newsAudienceCounts(user.organizationId, { country, listenOn: store, releaseId: release?.id ?? null });
  return NextResponse.json({ recipients: total, noTimezone, timezone: user.organization.timezone });
}

export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: "Confirm your email address first." }, { status: 403 });
  if (!canSendNews(user.organization.plan)) return NextResponse.json({ error: "News emails are on the paid plans." }, { status: 402 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  const d = parsed.data;

  const release = d.filterReleaseId
    ? await prisma.release.findFirst({ where: { id: d.filterReleaseId, organizationId: user.organizationId }, select: { id: true } })
    : null;
  if (d.filterReleaseId && !release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

  const news = await prisma.newsEmail.create({
    data: {
      organizationId: user.organizationId,
      subject: d.subject,
      body: d.body,
      buttonLabel: d.buttonLabel?.trim() || null,
      buttonUrl: d.buttonUrl?.trim() || null,
      filterCountry: d.filterCountry ?? null,
      filterListenOn: isListenChoice(d.filterListenOn) ? d.filterListenOn : null,
      filterReleaseId: release?.id ?? null,
      createdById: user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: news.id });
}
