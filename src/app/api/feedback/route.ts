import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FEEDBACK_BODY_MAX, FEEDBACK_SUBJECT_MAX, feedbackBase, isFeedbackCategory, notifyTeam, safePage, subjectFrom } from "@/lib/feedback";
import { planOf } from "@/lib/plans";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** POST { category, subject?, body, page? } → start a feedback conversation with the droplr.fm team. */
export async function POST(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { category?: unknown; subject?: unknown; body?: unknown; page?: unknown };
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (body.length < 2) return NextResponse.json({ error: "Write a message first" }, { status: 400 });
  if (body.length > FEEDBACK_BODY_MAX) return NextResponse.json({ error: `Keep it under ${FEEDBACK_BODY_MAX} characters` }, { status: 400 });
  const subjectRaw = typeof b.subject === "string" ? b.subject.slice(0, FEEDBACK_SUBJECT_MAX * 2) : "";
  if (!(await allow(`feedback-new:user:${user.id}`, 10, 24 * 60 * 60 * 1000))) return NextResponse.json({ error: "That's a lot of feedback for one day. Reply on an existing conversation, or try again tomorrow." }, { status: 429 });

  const thread = await prisma.feedbackThread.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      category: isFeedbackCategory(b.category) ? b.category : "idea",
      subject: subjectFrom(subjectRaw, body),
      page: safePage(b.page),
      messages: { create: { body, authorEmail: user.email } },
    },
  });
  after(() => notifyTeam(thread, { email: user.email, orgName: user.organization.name, plan: planOf(user.organization.plan).name }, body, true));
  return NextResponse.json({ ok: true, id: thread.id, url: `${feedbackBase(user.role)}/${thread.id}` });
}
