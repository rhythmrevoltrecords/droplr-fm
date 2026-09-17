import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FEEDBACK_BODY_MAX, notifyTeam } from "@/lib/feedback";
import { planOf } from "@/lib/plans";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** POST { body } → reply on your own feedback conversation (reopens it if closed). */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Strictly the person who started it: not their team, not another label.
  const thread = await prisma.feedbackThread.findFirst({ where: { id, userId: user.id, organizationId: user.organizationId } });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { body?: unknown };
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (body.length < 1) return NextResponse.json({ error: "Write a message first" }, { status: 400 });
  if (body.length > FEEDBACK_BODY_MAX) return NextResponse.json({ error: `Keep it under ${FEEDBACK_BODY_MAX} characters` }, { status: 400 });
  if (!(await allow(`feedback-msg:user:${user.id}`, 60, 24 * 60 * 60 * 1000))) return NextResponse.json({ error: "Too many messages today. Try again tomorrow." }, { status: 429 });

  const now = new Date();
  await prisma.$transaction([
    prisma.feedbackMessage.create({ data: { threadId: thread.id, body, authorEmail: user.email } }),
    prisma.feedbackThread.update({ where: { id: thread.id }, data: { lastMessageAt: now, unreadByTeam: true, unreadByUser: false, status: "open" } }),
  ]);
  after(() => notifyTeam(thread, { email: user.email, orgName: user.organization.name, plan: planOf(user.organization.plan).name }, body, false));
  return NextResponse.json({ ok: true });
}
