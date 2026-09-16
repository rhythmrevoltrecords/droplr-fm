import { sha256 } from "./crypto";
import { prisma } from "./db";

/**
 * DB-backed sliding-window limiter (works across Netlify function instances).
 * Records the attempt and returns true when it's within the limit.
 */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.authThrottle.count({ where: { key, createdAt: { gte: since } } });
  if (count >= limit) return false;
  await prisma.authThrottle.create({ data: { key } });
  // Opportunistic cleanup of anything older than a day (~1% of calls).
  if (Math.random() < 0.01) await prisma.authThrottle.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } }).catch(() => {});
  return true;
}

/** Count without recording (e.g. only failed logins are recorded). */
export async function over(key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = await prisma.authThrottle.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  return count >= limit;
}

export async function record(key: string) {
  await prisma.authThrottle.create({ data: { key } });
}

export async function clear(key: string) {
  await prisma.authThrottle.deleteMany({ where: { key } });
}

/** Keys never contain raw emails or IPs. */
export const emailKey = (scope: string, email: string) => `${scope}:email:${sha256(email.trim().toLowerCase()).slice(0, 32)}`;
export const ipKey = (scope: string, ip: string | null) => `${scope}:ip:${sha256(`${ip ?? "unknown"}|${process.env.JWT_SECRET ?? ""}`).slice(0, 32)}`;
