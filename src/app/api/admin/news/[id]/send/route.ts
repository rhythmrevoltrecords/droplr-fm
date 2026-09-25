import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emailConfigured, sendBatch } from "@/lib/email";
import { canSendNews, newsAudienceCount, newsEmailFor, processNewsEmail, snapshotAudience } from "@/lib/news";
import { planOf } from "@/lib/plans";
import { allow, ipKey } from "@/lib/throttle";
import { clientIp } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["send", "schedule", "cancel", "test"]),
  // Wall-clock in the label's own timezone, e.g. "2026-09-25T09:00".
  scheduledForLocal: z.string().min(10).max(40).optional(),
  /**
   * instant: that one moment for everybody. local: that same clock time in each fan's own zone, on that
   * day — the release-day behaviour. Only meaningful with "schedule"; "send now" is always one moment.
   */
  sendMode: z.enum(["instant", "local"]).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const org = user.organization;
  const news = await prisma.newsEmail.findFirst({ where: { id: (await ctx.params).id, organizationId: org.id } });
  if (!news) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { action } = parsed.data;

  if (action === "cancel") {
    if (news.status !== "scheduled") return NextResponse.json({ error: "Only a scheduled email can be cancelled." }, { status: 409 });
    await prisma.newsEmail.update({ where: { id: news.id }, data: { status: "draft", scheduledFor: null } });
    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (!canSendNews(org.plan)) return NextResponse.json({ error: "News emails are on the paid plans." }, { status: 402 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: "Confirm your email address first." }, { status: 403 });
  if (!emailConfigured()) return NextResponse.json({ error: "Email sending isn't configured yet." }, { status: 503 });

  // A test goes to the logged-in user's own address, never to a fan.
  if (action === "test") {
    if (!(await allow(ipKey("news-test", clientIp(req.headers)), 20, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many test emails. Try again later." }, { status: 429 });
    }
    // Signed with this email's own id so the unsubscribe link in the test is inert for fans.
    const tpl = await newsEmailFor({
      preSaveId: `test-${news.id}`,
      subject: news.subject,
      body: news.body,
      buttonLabel: news.buttonLabel,
      buttonUrl: news.buttonUrl,
      orgName: org.emailFromName || org.name,
      logoUrl: org.logoUrl,
      accentColor: org.accentColor,
      showBranding: !planOf(org.plan).removeBranding,
    });
    await sendBatch([{ to: user.email, fromName: org.emailFromName || org.name, replyTo: org.emailReplyTo, ...tpl, subject: `[Test] ${tpl.subject}` }]);
    return NextResponse.json({ ok: true, to: user.email });
  }

  if (news.status !== "draft") return NextResponse.json({ error: "This email is already scheduled or sent." }, { status: 409 });

  const recipients = await newsAudienceCount(org.id, { country: news.filterCountry, listenOn: news.filterListenOn, releaseId: news.filterReleaseId });
  if (!recipients) return NextResponse.json({ error: "Nobody matches that audience yet." }, { status: 400 });

  let scheduledFor: Date | null = null;
  // "Send now" is one moment by definition, so local mode only applies to a scheduled send.
  const sendMode = action === "schedule" && parsed.data.sendMode === "local" ? "local" : "instant";
  let localHour: number | null = null;
  if (action === "schedule") {
    const raw = parsed.data.scheduledForLocal;
    if (!raw) return NextResponse.json({ error: "Pick a date and time." }, { status: 400 });
    const { zonedLocalToDate } = await import("@/lib/time");
    try {
      scheduledFor = zonedLocalToDate(raw, org.timezone); // throws on a malformed string
    } catch {
      return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });
    }
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });
    if (scheduledFor.getTime() < Date.now() - 60_000) return NextResponse.json({ error: "That time has already passed." }, { status: 400 });
    if (sendMode === "local") {
      // The hour they typed is the hour every fan sees on their own clock.
      const hh = Number(raw.slice(11, 13));
      if (!Number.isInteger(hh) || hh < 0 || hh > 23) return NextResponse.json({ error: "Pick an hour for the local-time send." }, { status: 400 });
      localHour = hh;
    }
  }
  if (sendMode !== "local") localHour = null;

  await prisma.newsEmail.update({ where: { id: news.id }, data: { status: "scheduled", scheduledFor, sendMode, localHour } });
  const frozen = await snapshotAudience(news.id);

  // "Send now" starts immediately in the background; the cron picks up anything left over,
  // so closing the tab can't strand a half-sent email.
  if (action === "send") {
    after(async () => {
      await processNewsEmail(news.id, Date.now() + 20_000).catch((e) => console.error("[news] send", e));
    });
  }

  return NextResponse.json({ ok: true, status: "scheduled", recipients: frozen, scheduledFor, sendMode });
}
