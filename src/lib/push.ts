// Web Push (VAPID) for the installable dashboard app. Relative imports only: also bundled into Netlify functions.
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (secret), VAPID_SUBJECT (mailto: or https: contact).
import webpush from "web-push";
import { prisma } from "./db";

export type PushKind = "milestones" | "releaseLive" | "promoPlan" | "feedback" | "referrals";
export const PUSH_KINDS: { key: PushKind; label: string; hint: string }[] = [
  { key: "milestones", label: "Pre-save milestones", hint: "25, 50, 100, 250… pre-saves on a release" },
  { key: "releaseLive", label: "Release is live", hint: "When a release unlocks and release-day emails start" },
  { key: "promoPlan", label: "Promo plan reminders", hint: "When a step on a release plan comes due" },
  { key: "feedback", label: "Feedback replies", hint: "When the droplr.fm team answers your feedback" },
  { key: "referrals", label: "Free month earned", hint: "When someone you referred qualifies" },
];
export type PushPrefs = Partial<Record<PushKind, boolean>>;
export const wants = (prefs: unknown, kind: PushKind) => ((prefs ?? {}) as PushPrefs)[kind] !== false;

export const PRESAVE_MILESTONES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

export function pushConfigured() {
  return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

/**
 * Push services only. web-push POSTs to the endpoint the browser gave us, so an unchecked endpoint would let
 * anyone make droplr send requests to arbitrary URLs (SSRF). These are the services browsers actually use.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];
export function isPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.port && !u.username && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
export const isKey = (k: unknown, min: number, max: number): k is string => typeof k === "string" && k.length >= min && k.length <= max && B64URL.test(k);

/** "iPhone", "Android", "Mac · Chrome"… for the device list. */
export function deviceLabel(ua: string | null) {
  if (!ua) return "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br && !/iPhone|iPad/.test(os) ? `${os} · ${br}` : os;
}

/** `url` opens for owners/admins; roster artist logins open `artistUrl` (default /dashboard). */
export type PushMessage = { title: string; body: string; url: string; artistUrl?: string; tag?: string };
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
let testSender: Sender | null = null;
/** Tests only: capture instead of calling push services. */
export function setPushSenderForTests(s: Sender | null) {
  testSender = s;
}

function sender(): Sender | null {
  if (testSender) return testSender;
  if (!pushConfigured()) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@droplr.fm", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 24 * 3600, urgency: "normal" });
}

/** Best-effort fan-out. Dead subscriptions (404/410) are removed; others are dropped after 5 failures in a row. */
export async function sendPush(userIds: string[], kind: PushKind, msg: PushMessage, opts: { ignorePrefs?: boolean } = {}) {
  const send = sender();
  if (!send || !userIds.length) return { sent: 0 };
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, role: true, pushPrefs: true, pushSubscriptions: true } });
  const local = (u: string | undefined, fallback: string) => (u && u.startsWith("/") && !u.startsWith("//") ? u : fallback);
  const payloadFor = (role: string) => JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag, url: role === "artist" ? local(msg.artistUrl, "/dashboard") : local(msg.url, "/admin") });
  let sent = 0;
  await Promise.all(
    users.filter((u) => opts.ignorePrefs || wants(u.pushPrefs, kind)).flatMap((u) =>
      u.pushSubscriptions.map(async (s) => {
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadFor(u.role));
          sent++;
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: 0, lastSentAt: new Date() } }).catch(() => {});
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410 || s.failures >= 4) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          else await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => {});
          if (code !== 404 && code !== 410) console.error("[push]", code ?? err);
        }
      }),
    ),
  );
  return { sent };
}

/** Owners and admins of an account (who run releases). */
export async function teamUserIds(organizationId: string) {
  return (await prisma.user.findMany({ where: { organizationId, role: { in: ["owner", "admin"] } }, select: { id: true } })).map((u) => u.id);
}

/** After a pre-save: push once when a release crosses 25, 50, 100… to the team and the release's artist login. */
export async function notifyPresaveMilestone(releaseId: string) {
  if (!testSender && !pushConfigured()) return;
  const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { id: true, title: true, organizationId: true, artistId: true, presaveMilestoneNotified: true } });
  if (!release) return;
  const count = await prisma.preSave.count({ where: { releaseId } });
  const reached = [...PRESAVE_MILESTONES].reverse().find((m) => count >= m);
  if (!reached || reached <= release.presaveMilestoneNotified) return;
  // Claim it atomically so two pre-saves at once don't both push.
  const claimed = await prisma.release.updateMany({ where: { id: release.id, presaveMilestoneNotified: { lt: reached } }, data: { presaveMilestoneNotified: reached } });
  if (!claimed.count) return;
  const team = await teamUserIds(release.organizationId);
  await sendPush([...team, ...(release.artistId ? [release.artistId] : [])], "milestones", {
    title: `${reached.toLocaleString("en-AU")} pre-saves 🎉`,
    body: `${release.title} just passed ${reached.toLocaleString("en-AU")} pre-saves. Share the milestone graphic while it's hot.`,
    url: `/admin/releases/${release.id}?tab=share`,
    tag: `milestone-${release.id}`,
  });
}
