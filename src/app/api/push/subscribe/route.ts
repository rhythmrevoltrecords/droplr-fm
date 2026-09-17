import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deviceLabel, isKey, isPushEndpoint, pushConfigured } from "@/lib/push";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

type Body = { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; replaces?: unknown; endpoint?: unknown };

/** POST { subscription: PushSubscriptionJSON, replaces? } → save this device for push. */
export async function POST(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Notifications aren't switched on for this site yet" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = b.subscription?.endpoint;
  const p256dh = b.subscription?.keys?.p256dh;
  const auth = b.subscription?.keys?.auth;
  if (!isPushEndpoint(endpoint) || !isKey(p256dh, 60, 120) || !isKey(auth, 16, 40)) return NextResponse.json({ error: "That doesn't look like a browser push subscription" }, { status: 400 });
  if (!(await allow(`push-sub:user:${user.id}`, 30, 24 * 3600_000))) return NextResponse.json({ error: "Too many devices added today" }, { status: 429 });
  if (isPushEndpoint(b.replaces) && b.replaces !== endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: b.replaces, userId: user.id } });
  // An endpoint belongs to one browser: if someone else logged in on it before, it moves to this login.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh, auth, label: deviceLabel(req.headers.get("user-agent")) },
    update: { userId: user.id, p256dh, auth, failures: 0, label: deviceLabel(req.headers.get("user-agent")) },
  });
  // Keep the list tidy: at most 10 devices per login.
  const all = await prisma.pushSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (all.length > 10) await prisma.pushSubscription.deleteMany({ where: { id: { in: all.slice(10).map((s) => s.id) } } });
  return NextResponse.json({ ok: true });
}

/** DELETE { endpoint } → stop push on that device (only your own). */
export async function DELETE(req: NextRequest) {
  const user = await apiUser("any");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (typeof b.endpoint !== "string") return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  const r = await prisma.pushSubscription.deleteMany({ where: { endpoint: b.endpoint, userId: user.id } });
  return NextResponse.json({ ok: true, removed: r.count });
}
