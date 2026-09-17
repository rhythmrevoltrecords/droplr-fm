import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pushConfigured, sendPush } from "@/lib/push";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** POST → send a test notification to every device on your login. */
export async function POST() {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Notifications aren't switched on for this site yet" }, { status: 503 });
  if (!(await allow(`push-test:user:${user.id}`, 10, 3600_000))) return NextResponse.json({ error: "That's enough tests for an hour" }, { status: 429 });
  if (!(await prisma.pushSubscription.count({ where: { userId: user.id } }))) return NextResponse.json({ error: "No devices yet. Turn on notifications first." }, { status: 400 });
  // A test ignores preferences: it's the one notification you asked for.
  const { sent } = await sendPush([user.id], "milestones", { title: "droplr.fm notifications are on", body: "You'll hear about pre-save milestones, releases going live and replies here.", url: "/admin/settings/account", artistUrl: "/dashboard/account", tag: "test" }, { ignorePrefs: true });
  return NextResponse.json({ ok: true, sent });
}
