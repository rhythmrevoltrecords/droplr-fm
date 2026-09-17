// Shared by the referrals Netlify function and the app. Relative imports only: bundled by Netlify outside Next.
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { sendPush, teamUserIds } from "./push";
import { getStripe, stripeConfigured } from "./stripe";

/** Free months one account can earn from referrals in any rolling 12 months. */
export const REFERRAL_CAP = 3;
export const REFERRAL_WINDOW_DAYS = 365;
/** The referred account must have been paying this long before the reward is earned (refund window). */
export const REFERRAL_QUALIFY_DAYS = 30;
export const REFERRAL_COOKIE = "dfm_ref";
const DAY = 86_400_000;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
export const isReferralCode = (c: unknown): c is string => typeof c === "string" && /^[a-hjkmnp-z2-9]{8}$/.test(c);

export const referralLink = (code: string) => `${SITE_URL}/join/${code}`;

/** This account's share code, created the first time it's needed. */
export async function referralCodeFor(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { referralCode: true } });
  if (org?.referralCode) return org.referralCode;
  for (let i = 0; i < 5; i++) {
    const bytes = randomBytes(8);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const done = await prisma.organization.updateMany({ where: { id: orgId, referralCode: null }, data: { referralCode: code } }).catch(() => null);
    if (done?.count) return code;
    const again = await prisma.organization.findUnique({ where: { id: orgId }, select: { referralCode: true } });
    if (again?.referralCode) return again.referralCode;
  }
  throw new Error("Couldn't create a referral code");
}

/** Called at sign-up only. Unknown codes and self-referrals are ignored silently. */
export async function attachReferral(referredOrgId: string, code: unknown) {
  if (!isReferralCode(code)) return null;
  const referrer = await prisma.organization.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === referredOrgId) return null;
  return prisma.referral.create({ data: { referrerOrgId: referrer.id, referredOrgId } }).catch(() => null);
}

export async function earnedInWindow(referrerOrgId: string, now = new Date()) {
  return prisma.referral.count({ where: { referrerOrgId, status: { in: ["earned", "applied"] }, earnedAt: { gte: new Date(now.getTime() - REFERRAL_WINDOW_DAYS * DAY) } } });
}

type StripeLike = Pick<Stripe, "subscriptions" | "invoices" | "coupons">;
const couponIdOf = (d: string | Stripe.Discount | Stripe.DeletedDiscount) => {
  if (typeof d === "string") return null;
  const c = d.source?.coupon ?? (d as unknown as { coupon?: string | Stripe.Coupon | null }).coupon ?? null;
  return c;
};
const isReferralDiscount = (d: string | Stripe.Discount | Stripe.DeletedDiscount) => {
  const c = couponIdOf(d);
  return !!c && typeof c !== "string" && !!c.metadata?.droplr_referral;
};

/** One free billing period's worth, as a percentage so it works in whatever currency the subscription is in. */
export function freeMonthPercent(price: { recurring?: { interval?: string; interval_count?: number } | null } | null | undefined): number | null {
  const r = price?.recurring;
  if (!r?.interval) return null;
  const months = r.interval === "year" ? 12 * (r.interval_count ?? 1) : r.interval === "month" ? r.interval_count ?? 1 : null;
  if (!months) return null;
  return Math.floor((100 / months) * 100) / 100; // monthly 100, yearly 8.33
}

async function qualifies(stripe: StripeLike, subscriptionId: string, now: Date): Promise<{ ok: boolean; reason: string }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.status !== "active") return { ok: false, reason: `subscription ${sub.status}` };
  if (sub.start_date * 1000 > now.getTime() - REFERRAL_QUALIFY_DAYS * DAY) return { ok: false, reason: `paying < ${REFERRAL_QUALIFY_DAYS} days` };
  const paid = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 5 });
  if (!paid.data.some((i) => (i.amount_paid ?? 0) > 0)) return { ok: false, reason: "no paid invoice yet" };
  return { ok: true, reason: "" };
}

/**
 * Daily job. 1) pending/capped referrals whose referred account has paid 30+ days → earned (or capped at 3 a year).
 * 2) earned rewards → a one-invoice percent-off coupon on the referrer's subscription, one reward per invoice.
 */
export async function runReferralChecks(opts: { deadline?: number; now?: Date; stripe?: StripeLike } = {}) {
  const now = opts.now ?? new Date();
  const deadline = opts.deadline ?? Date.now() + 25_000;
  const out = { checked: 0, earned: 0, capped: 0, applied: 0, errors: 0 };
  if (!opts.stripe && !stripeConfigured()) return { ...out, skipped: "stripe not configured" };
  const stripe = opts.stripe ?? getStripe();

  // 1) Qualify. Recheck at most once a day each.
  const due = await prisma.referral.findMany({
    where: { status: { in: ["pending", "capped"] }, OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - 20 * 3600_000) } }] },
    orderBy: { checkedAt: { sort: "asc", nulls: "first" } },
    take: 50,
    include: { referred: { select: { stripeSubscriptionId: true, createdAt: true } } },
  });
  for (const r of due) {
    if (Date.now() > deadline) break;
    out.checked++;
    try {
      let status = r.status;
      let note: string | null = null;
      if (r.status === "pending") {
        if (!r.referred.stripeSubscriptionId) note = "not subscribed yet";
        else {
          const q = await qualifies(stripe, r.referred.stripeSubscriptionId, now);
          if (q.ok) status = "qualified";
          else note = q.reason;
        }
      }
      if (status === "qualified" || r.status === "capped") {
        const full = (await earnedInWindow(r.referrerOrgId, now)) >= REFERRAL_CAP;
        status = full ? "capped" : "earned";
        note = full ? `already earned ${REFERRAL_CAP} in 12 months` : null;
      }
      await prisma.referral.update({ where: { id: r.id }, data: { status, note, checkedAt: now, ...(status === "earned" ? { earnedAt: now } : {}) } });
      if (status === "earned") {
        out.earned++;
        await sendPush(await teamUserIds(r.referrerOrgId), "referrals", { title: "You earned a free month", body: "Someone you referred has been on a paid plan for 30 days. It comes off your next bill.", url: "/admin/referrals", tag: `referral-${r.id}` }).catch(() => {});
      }
      if (status === "capped" && r.status !== "capped") out.capped++;
    } catch (err) {
      out.errors++;
      await prisma.referral.update({ where: { id: r.id }, data: { checkedAt: now, note: `check failed: ${err instanceof Error ? err.message.slice(0, 180) : "error"}` } }).catch(() => {});
    }
  }

  // 2) Apply: oldest earned reward per referrer that has a live subscription.
  const earned = await prisma.referral.findMany({
    where: { status: "earned", referrer: { stripeSubscriptionId: { not: null } } },
    orderBy: { earnedAt: "asc" },
    take: 100,
    include: { referrer: { select: { id: true, stripeSubscriptionId: true } } },
  });
  const seen = new Set<string>();
  for (const r of earned) {
    if (Date.now() > deadline) break;
    if (seen.has(r.referrerOrgId)) continue; // one per referrer per run: the next waits for this invoice
    seen.add(r.referrerOrgId);
    const subId = r.referrer.stripeSubscriptionId!;
    try {
      const sub = await stripe.subscriptions.retrieve(subId, { expand: ["discounts.source.coupon"] });
      if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
      const existing = (sub.discounts ?? []) as (string | Stripe.Discount)[];
      // Last free month not used yet? Match by coupon metadata, or by the coupon ids we issued (if Stripe didn't expand them).
      const ours = new Set((await prisma.referral.findMany({ where: { referrerOrgId: r.referrerOrgId, stripeCouponId: { not: null } }, select: { stripeCouponId: true } })).map((x) => x.stripeCouponId));
      if (existing.some((d) => isReferralDiscount(d) || (typeof couponIdOf(d) === "string" && ours.has(couponIdOf(d) as string)))) continue;
      const percent = freeMonthPercent(sub.items.data[0]?.price);
      if (!percent) {
        await prisma.referral.update({ where: { id: r.id }, data: { note: "unsupported billing interval" } });
        continue;
      }
      const coupon = await stripe.coupons.create({ percent_off: percent, duration: "once", max_redemptions: 1, name: "Referral reward: 1 free month", metadata: { droplr_referral: r.id } });
      await stripe.subscriptions.update(subId, {
        discounts: [...existing.map((d) => ({ discount: typeof d === "string" ? d : d.id })), { coupon: coupon.id }],
        proration_behavior: "none",
      });
      await prisma.referral.update({ where: { id: r.id }, data: { status: "applied", appliedAt: now, stripeCouponId: coupon.id, note: null } });
      out.applied++;
    } catch (err) {
      out.errors++;
      await prisma.referral.update({ where: { id: r.id }, data: { note: `apply failed: ${err instanceof Error ? err.message.slice(0, 180) : "error"}` } }).catch(() => {});
    }
  }
  return out;
}
