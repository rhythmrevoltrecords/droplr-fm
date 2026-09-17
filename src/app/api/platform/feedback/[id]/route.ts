import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { FEEDBACK_BODY_MAX, notifyUser } from "@/lib/feedback";
import { platformAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** POST { body?, status?: "open" | "closed" } — platform owner replies to a feedback conversation and/or closes it. */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const thread = await prisma.feedbackThread.findUnique({ where: { id }, include: { user: { select: { email: true, role: true } } } });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { body?: unknown; status?: unknown };
  const body = typeof b.body === "string" ? b.body.trim() : "";
  const status = b.status === "open" || b.status === "closed" ? b.status : undefined;
  if (!body && !status) return NextResponse.json({ error: "Write a reply or change the status" }, { status: 400 });
  if (body.length > FEEDBACK_BODY_MAX) return NextResponse.json({ error: `Keep it under ${FEEDBACK_BODY_MAX} characters` }, { status: 400 });

  const now = new Date();
  await prisma.$transaction([
    ...(body ? [prisma.feedbackMessage.create({ data: { threadId: thread.id, body, fromTeam: true, authorEmail: admin.email } })] : []),
    prisma.feedbackThread.update({
      where: { id: thread.id },
      data: { unreadByTeam: false, ...(body ? { lastMessageAt: now, unreadByUser: true } : {}), ...(status ? { status } : {}) },
    }),
  ]);
  if (body) after(() => notifyUser(thread, thread.user, body));
  console.info("[platform] feedback", { thread: thread.id, replied: !!body, status, by: admin.email });
  return NextResponse.json({ ok: true });
}
