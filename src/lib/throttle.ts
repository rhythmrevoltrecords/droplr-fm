import { sha256 } from "./crypto";
import { prisma } from "./db";

/**
 * DB-backed sliding-window limiter (works across Netlify function instances).
 * Records the attempt and returns true when it's within the limit.
 */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await hit(key, limit, windowMs)).ok;
}

/**
 * Insert first, then count (the count includes this attempt). Count-then-insert let parallel requests
 * all see the same low count and all get through. Returns the row id so a caller can undo it.
 */
export async function hit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; id: string }> {
  const { id } = await prisma.authThrottle.create({ data: { key }, select: { id: true } });
  const count = await prisma.authThrottle.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  // Opportunistic cleanup of anything older than a day (~1% of calls).
  if (Math.random() < 0.01) await prisma.authThrottle.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } }).catch(() => {});
  return { ok: count <= limit, id };
}

/** Count without recording (e.g. only failed logins are recorded). */
export async function over(key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = await prisma.authThrottle.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  return count >= limit;
}

export async function record(key: string) {
  await prisma.authThrottle.create({ data: { key } });
}

/** Undo specific attempts recorded with hit(). */
export async function forget(ids: string[]) {
  await prisma.authThrottle.deleteMany({ where: { id: { in: ids } } });
}

export async function clear(key: string) {
  await prisma.authThrottle.deleteMany({ where: { key } });
}

/** Keys never contain raw emails or IPs. */
export const emailKey = (scope: string, email: string) => `${scope}:email:${sha256(email.trim().toLowerCase()).slice(0, 32)}`;
export const ipKey = (scope: string, ip: string | null) => `${scope}:ip:${sha256(`${ip ?? "unknown"}|${process.env.JWT_SECRET ?? ""}`).slice(0, 32)}`;
