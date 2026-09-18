import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canSendNews, NEWS_BODY_MAX, NEWS_SUBJECT_MAX } from "@/lib/news";
import { isListenChoice } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/** Label user + a news email in their org. 404 either way, so another label learns nothing. */
async function own(id: string) {
  const user = await apiUser("label");
  if (!user) return { error: "Unauthorised", status: 401 as const };
  const news = await prisma.newsEmail.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!news) return { error: "Not found", status: 404 as const };
  return { user, news };
}

const schema = z.object({
  subject: z.string().trim().min(1).max(NEWS_SUBJECT_MAX).optional(),
  body: z.string().trim().min(1).max(NEWS_BODY_MAX).optional(),
  buttonLabel: z.string().trim().max(40).nullable().optional(),
  buttonUrl: z.string().trim().url().nullable().optional(),
  filterCountry: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  filterListenOn: z.string().max(40).nullable().optional(),
  filterReleaseId: z.string().max(40).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await own((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });
  const { user, news } = got;
  if (!canSendNews(user.organization.plan)) return NextResponse.json({ error: "News emails are on the paid plans." }, { status: 402 });
  // Once it's out the door the wording is part of the record: no editing after sending starts.
  if (news.status !== "draft" && news.status !== "scheduled") return NextResponse.json({ error: "This email has already been sent." }, { status: 409 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  const d = parsed.data;

  let releaseId: string | null | undefined = undefined;
  if (d.filterReleaseId !== undefined) {
    if (d.filterReleaseId === null || d.filterReleaseId === "") releaseId = null;
    else {
      const rel = await prisma.release.findFirst({ where: { id: d.filterReleaseId, organizationId: user.organizationId }, select: { id: true } });
      if (!rel) return NextResponse.json({ error: "Release not found" }, { status: 404 });
      releaseId = rel.id;
    }
  }

  await prisma.newsEmail.update({
    where: { id: news.id },
    data: {
      ...(d.subject !== undefined && { subject: d.subject }),
      ...(d.body !== undefined && { body: d.body }),
      ...(d.buttonLabel !== undefined && { buttonLabel: d.buttonLabel?.trim() || null }),
      ...(d.buttonUrl !== undefined && { buttonUrl: d.buttonUrl?.trim() || null }),
      ...(d.filterCountry !== undefined && { filterCountry: d.filterCountry }),
      ...(d.filterListenOn !== undefined && { filterListenOn: isListenChoice(d.filterListenOn) ? d.filterListenOn : null }),
      ...(releaseId !== undefined && { filterReleaseId: releaseId }),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await own((await ctx.params).id);
  if ("error" in got) return NextResponse.json({ error: got.error }, { status: got.status });
  // A sent email is a record of what fans were told. Keep it.
  if (got.news.status === "sending" || got.news.status === "sent") {
    return NextResponse.json({ error: "Sent emails are kept as a record." }, { status: 409 });
  }
  await prisma.newsEmail.delete({ where: { id: got.news.id } });
  return NextResponse.json({ ok: true });
}
