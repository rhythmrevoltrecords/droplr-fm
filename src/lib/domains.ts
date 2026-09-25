import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { prisma } from "./db";
import { attachDomain, detachDomain, friendlyNetlifyError, isProtectedDomain, NetlifyError, netlifyConfigured, provisionCertificate } from "./netlify";
import { activeCustomDomain, CUSTOM_DOMAIN_GRACE_DAYS } from "./plans";
import { allow } from "./throttle";

/**
 * Self-serve custom domains.
 *   1. Label saves presave.label.com → gets a TXT token.
 *   2. TXT _droplr.presave.label.com = droplr-verify=<token> proves they control the DNS.
 *   3. droplr adds the domain as an alias on the Netlify site (so nobody can park someone else's domain on droplr).
 *   4. Their CNAME/A record points at Netlify; once https://domain/api/domain-check answers as droplr, it's live.
 * Public links only use the domain while it's live; until then (or if it breaks) they use droplr.fm.
 */

export const TXT_PREFIX = "_droplr";
export const NETLIFY_TARGET = process.env.NETLIFY_SITE_HOST || "droplr-fm.netlify.app";
export const NETLIFY_APEX_IP = "75.2.60.5";
export const NETLIFY_APEX_ALIAS = "apex-loadbalancer.netlify.com";
/** A live domain has to fail this many checks in a row before links fall back to droplr.fm. */
const LIVE_FAILURES_BEFORE_DEMOTE = 3;
/** A paused domain (plan lapsed, grace over) keeps redirecting to droplr.fm this long, then the alias is released. */
export const PAUSED_DETACH_DAYS = 90;

/**
 * How many custom hostnames one Netlify site can hold.
 *
 * Netlify documents no explicit cap, but the real ceiling is Let's Encrypt: a certificate carries at
 * most 100 SAN entries, and Netlify puts a site's domain aliases on one certificate. Past that,
 * issuance fails — so the limit shows up as "this domain won't go live" for whoever is unlucky
 * enough to be number 101, not as an error when the alias is added.
 *
 * Only paid tiers can connect a custom domain (PLAN_LIMITS.customDomain), so this is a ceiling on
 * paying customers, not on accounts. It is a good problem — around 90 customers on the domain tiers
 * is real revenue — but it arrives quietly, which is why the cron counts and warns.
 */
export const ALIAS_BUDGET = 90;
/** Start saying so with twenty slots left, not on the day it breaks. */
export const ALIAS_WARN_AT = 70;
/**
 * A domain the label moved off keeps redirecting to the new one this long, then the alias is released.
 * Longer than the paused window on purpose: a rename is deliberate, and the links it has to keep alive are
 * the ones already printed on cards, pinned in a bio or sitting in someone's saved messages.
 */
export const DOMAIN_REDIRECT_DAYS = 365;
/** How many old domains one account can hold aliases for. Renames are rare; hoarding aliases is not free. */
export const MAX_PREVIOUS_DOMAINS = 3;

export const newDomainToken = () => randomBytes(12).toString("hex");

/** Hostname rules on top of the basic regex: real TLD, label lengths, not droplr's own hosts. */
export function domainProblem(domain: string): string | null {
  if (domain.length > 253) return "That domain is too long";
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return "Enter a hostname like listen.yourlabel.com";
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1])) return "Enter a hostname like listen.yourlabel.com";
  if (isProtectedDomain(domain)) return "Use your own domain";
  return null;
}

/**
 * Words that describe one moment in a release's life, in a domain that has to carry every link forever.
 * Not an error — plenty of labels use presave.* knowingly — but worth saying once, before it's on printed cards.
 */
const RELEASE_STATE_WORDS = ["presave", "pre-save", "preorder", "pre-order", "outnow", "out-now", "newmusic", "comingsoon"];

export function domainAdvice(domain: string): string | null {
  const { root, sub } = splitDomain(domain.toLowerCase());
  const word = RELEASE_STATE_WORDS.find((w) => sub.includes(w));
  if (!word) return null;
  return `Heads up: "${word}" is a moment, and this domain is every link you ever share — a fan opening it a year from now still sees ${domain} for a track that's been out since. listen.${root} or music.${root} reads right at both ends. You can change it later and links on the old domain keep redirecting for a year, but the tidier time is now.`;
}

// Common two-part public suffixes, so presave.label.com.au → host "presave" on label.com.au.
const TWO_PART_SUFFIXES = new Set([
  "com.au", "net.au", "org.au", "edu.au", "asn.au", "id.au", "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "co.nz", "net.nz", "org.nz",
  "co.za", "com.br", "com.mx", "co.jp", "com.sg", "com.hk", "co.in", "com.ar", "com.tr", "co.kr", "com.my", "com.ph", "co.id",
]);

export function splitDomain(domain: string) {
  const parts = domain.split(".");
  const rootLen = TWO_PART_SUFFIXES.has(parts.slice(-2).join(".")) ? 3 : 2;
  const root = parts.slice(-rootLen).join(".");
  const sub = parts.slice(0, -rootLen).join(".");
  return { root, sub, apex: sub === "" };
}

type SetupOrg = {
  plan: string | null;
  planUpdatedAt?: Date | null;
  customDomain: string | null;
  customDomainToken: string | null;
  customDomainVerifiedAt: Date | null;
  customDomainAttachedAt: Date | null;
  customDomainLiveAt: Date | null;
  customDomainCheckedAt: Date | null;
  customDomainError: string | null;
};

export type DomainState = "verify" | "connecting" | "live" | "paused";

export function domainSetupView(org: SetupOrg) {
  const domain = org.customDomain;
  if (!domain) return null;
  const { root, sub, apex } = splitDomain(domain);
  const state: DomainState = !activeCustomDomain(org) ? "paused" : !org.customDomainVerifiedAt ? "verify" : org.customDomainLiveAt ? "live" : "connecting";
  return {
    domain,
    root,
    state,
    automatic: netlifyConfigured(),
    txt: { type: "TXT", host: sub ? `${TXT_PREFIX}.${sub}` : TXT_PREFIX, fqdn: `${TXT_PREFIX}.${domain}`, value: `droplr-verify=${org.customDomainToken ?? ""}` },
    point: apex
      ? [
          { type: "A", host: "@", fqdn: domain, value: NETLIFY_APEX_IP },
          { type: "ALIAS / ANAME (if supported, instead of A)", host: "@", fqdn: domain, value: NETLIFY_APEX_ALIAS },
        ]
      : [{ type: "CNAME", host: sub, fqdn: domain, value: NETLIFY_TARGET }],
    apex,
    verifiedAt: org.customDomainVerifiedAt?.toISOString() ?? null,
    liveAt: org.customDomainLiveAt?.toISOString() ?? null,
    checkedAt: org.customDomainCheckedAt?.toISOString() ?? null,
    error: org.customDomainError,
    advice: domainAdvice(domain),
  };
}
export type DomainSetupView = NonNullable<ReturnType<typeof domainSetupView>>;

// --- DNS / HTTPS probes -------------------------------------------------------------------------------------------

function resolver() {
  // Public resolvers first: the platform's cached resolver can hold a "not found" for a while after a label adds a record.
  const r = new Resolver({ timeout: 3000, tries: 2 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}

async function withFallback<T>(fn: (r: Resolver) => Promise<T>): Promise<T> {
  try {
    return await fn(resolver());
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") throw e; // a real answer: no such record
    return fn(new Resolver({ timeout: 3000, tries: 1 })); // public DNS unreachable → system resolver
  }
}

export async function txtRecordFound(domain: string, token: string): Promise<{ found: boolean; seen: string[]; error?: string }> {
  try {
    const records = await withFallback((r) => r.resolveTxt(`${TXT_PREFIX}.${domain}`));
    const seen = records.map((chunks) => chunks.join(""));
    return { found: seen.some((v) => v.trim() === `droplr-verify=${token}`), seen };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return { found: false, seen: [] };
    return { found: false, seen: [], error: "Couldn't look up DNS right now. We'll try again shortly." };
  }
}

async function pointsAt(domain: string): Promise<{ netlify: boolean; found: string | null }> {
  try {
    const cn = await withFallback((r) => r.resolveCname(domain));
    if (cn.length) return { netlify: cn.some((c) => /\.netlify\.(app|com)\.?$/i.test(c)), found: `CNAME ${cn[0]}` };
  } catch {}
  try {
    const a = await withFallback((r) => r.resolve4(domain));
    if (a.length) return { netlify: a.includes(NETLIFY_APEX_IP), found: `A ${a.join(", ")}` };
  } catch {}
  return { netlify: false, found: null };
}

/** https://domain/api/domain-check must answer as droplr for this exact host. */
export async function probeDomain(domain: string): Promise<{ ok: boolean; tls: boolean; dns: boolean; status?: number }> {
  try {
    const res = await fetch(`https://${domain}/api/domain-check`, { redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return { ok: false, tls: false, dns: false, status: res.status };
    const j = (await res.json().catch(() => ({}))) as { service?: string; host?: string };
    return { ok: j.service === "droplr.fm" && j.host === domain, tls: false, dns: false, status: res.status };
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause;
    const code = cause?.code ?? "";
    return { ok: false, tls: /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code), dns: code === "ENOTFOUND" || code === "EAI_AGAIN" };
  }
}

// --- Netlify alias changes, serialised ---------------------------------------------------------------------------

/** Netlify's alias list is replaced wholesale on each update, so only one change runs at a time across all instances. */
async function withNetlifyLock<T>(fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('droplr:netlify-domain-aliases'))`;
      return fn();
    },
    { timeout: 45_000, maxWait: 20_000 },
  );
}

/**
 * The previousDomains list after a domain change. The one being left keeps redirecting only if it ever got as
 * far as a Netlify alias; a domain being re-claimed as the current one drops out; oldest past the cap falls off.
 */
export function nextPreviousDomains(current: string[], leaving: string | null, arriving: string | null, keepsRedirecting: boolean) {
  const kept = current.filter((x) => x !== leaving && x !== arriving);
  return [...new Set([...kept, ...(keepsRedirecting && leaving ? [leaving] : [])])].slice(-MAX_PREVIOUS_DOMAINS);
}

/** Drop a host from every account's previousDomains (it was released, or someone has proven they own it now). */
export async function forgetPreviousDomain(domain: string) {
  await prisma.$executeRaw`UPDATE "Organization" SET "previousDomains" = array_remove("previousDomains", ${domain}) WHERE ${domain} = ANY("previousDomains")`;
}

/**
 * Remember an alias to remove (domain changed or cleared). With no `after` it goes right away and the cron
 * retries failures; with one, the alias is held until then so the old domain keeps redirecting in the meantime.
 */
export async function queueDetach(domain: string, after?: Date) {
  await prisma.domainDetach.upsert({ where: { domain }, create: { domain, after }, update: { after: after ?? null, attempts: 0, lastError: null } });
  if (!after && netlifyConfigured()) await processDetaches(1, domain).catch(() => {});
}

export async function processDetaches(limit = 10, only?: string) {
  const rows = await prisma.domainDetach.findMany({
    where: { attempts: { lt: 50 }, OR: [{ after: null }, { after: { lte: new Date() } }], ...(only ? { domain: only } : {}) },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let done = 0;
  for (const row of rows) {
    // Another label (or the same one) has since claimed the domain: keep the alias.
    const inUse = await prisma.organization.findFirst({ where: { customDomain: row.domain }, select: { id: true } });
    if (inUse) {
      await prisma.domainDetach.delete({ where: { id: row.id } }).catch(() => {});
      continue;
    }
    try {
      await withNetlifyLock(() => detachDomain(row.domain));
      // The alias is gone, so the redirect can't work any more: stop claiming the host.
      await forgetPreviousDomain(row.domain);
      await prisma.domainDetach.delete({ where: { id: row.id } }).catch(() => {});
      done++;
    } catch (e) {
      await prisma.domainDetach.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: String((e as Error).message).slice(0, 300) } }).catch(() => {});
    }
  }
  return done;
}

/**
 * Custom hostnames currently held on the Netlify site.
 *
 * Two things consume a slot, and the second is easy to forget: a live domain, and every domain an
 * account has moved off, because those keep their alias for DOMAIN_REDIRECT_DAYS so the links
 * already shared on them keep redirecting. A label that renames twice costs three slots for a year.
 */
export async function aliasUsage() {
  const [attached, previous] = await Promise.all([
    prisma.organization.count({ where: { customDomainAttachedAt: { not: null } } }),
    prisma.organization.findMany({ where: { NOT: { previousDomains: { isEmpty: true } } }, select: { previousDomains: true } }),
  ]);
  const redirecting = previous.reduce((n, o) => n + o.previousDomains.length, 0);
  const used = attached + redirecting;
  return { used, attached, redirecting, budget: ALIAS_BUDGET, free: Math.max(0, ALIAS_BUDGET - used), warn: used >= ALIAS_WARN_AT };
}

// --- The check ----------------------------------------------------------------------------------------------------

const SETUP_SELECT = {
  id: true, plan: true, planUpdatedAt: true, customDomain: true, customDomainToken: true, customDomainVerifiedAt: true,
  customDomainAttachedAt: true, customDomainLiveAt: true, customDomainCheckedAt: true, customDomainError: true, customDomainFailures: true,
} as const;

/** Advance one label's domain as far as it can go right now. Safe to call repeatedly. */
export async function checkOrgDomain(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: SETUP_SELECT });
  if (!org?.customDomain) return null;
  const domain = org.customDomain;
  const now = new Date();
  const data: {
    customDomainCheckedAt: Date; customDomainError: string | null; customDomainVerifiedAt?: Date; customDomainAttachedAt?: Date;
    customDomainLiveAt?: Date | null; customDomainFailures?: number; customDomainToken?: string;
  } = { customDomainCheckedAt: now, customDomainError: null };

  const save = async () => {
    // Only write if the domain hasn't been changed underneath us.
    await prisma.organization.updateMany({ where: { id: org.id, customDomain: domain }, data });
    return domainSetupView({ ...org, ...data });
  };

  // 1. Ownership
  if (!org.customDomainVerifiedAt) {
    const token = org.customDomainToken ?? newDomainToken();
    if (!org.customDomainToken) data.customDomainToken = token;
    const txt = await txtRecordFound(domain, token);
    if (!txt.found) {
      data.customDomainError = txt.error
        ?? (txt.seen.length ? `Found a TXT record at ${TXT_PREFIX}.${domain}, but its value doesn't match. It should be droplr-verify=${token}.` : `No TXT record at ${TXT_PREFIX}.${domain} yet. DNS changes can take a few minutes to an hour to show up.`);
      return save();
    }
    data.customDomainVerifiedAt = now;
  }

  // 2. Plan (a paused domain stays attached so old links keep redirecting; nothing new is attached)
  if (!activeCustomDomain(org)) {
    data.customDomainError = "Custom domains are on Artist Pro and the label plans. Upgrade to switch this domain back on.";
    return save();
  }

  // 3. Attach the alias on Netlify
  if (!org.customDomainAttachedAt) {
    if (!netlifyConfigured()) {
      data.customDomainError = friendlyNetlifyError(new NetlifyError("not configured", 503));
      return save();
    }
    try {
      await withNetlifyLock(async () => {
        await attachDomain(domain);
        await prisma.domainDetach.deleteMany({ where: { domain } });
      });
      // TXT proved control of this host, so no other account gets to keep redirecting from it.
      await forgetPreviousDomain(domain);
      data.customDomainAttachedAt = now;
    } catch (e) {
      console.error("[domains] attach failed", { org: org.id, domain, error: (e as Error).message });
      data.customDomainError = friendlyNetlifyError(e);
      return save();
    }
  }

  // 4. Does HTTPS on the domain reach droplr?
  const probe = await probeDomain(domain);
  if (probe.ok) {
    data.customDomainLiveAt = org.customDomainLiveAt ?? now;
    data.customDomainFailures = 0;
    return save();
  }

  const dns = await pointsAt(domain);
  let problem: string;
  if (!dns.found && probe.dns) problem = `No DNS record for ${domain} yet. Add the ${splitDomain(domain).apex ? "A" : "CNAME"} record below.`;
  else if (probe.tls) problem = "DNS is set. The HTTPS certificate is still being issued; this usually takes a few minutes.";
  else if (dns.found && !dns.netlify) problem = `${domain} points at ${dns.found}, not droplr. Update the record below. On Cloudflare, set it to DNS only (grey cloud).`;
  else problem = probe.status ? `The domain answered with HTTP ${probe.status} instead of droplr. Check the record below.` : `Couldn't reach https://${domain} yet. DNS changes can take up to an hour.`;

  // Certificate not issued yet but DNS looks right: nudge Netlify, at most every 30 minutes per domain.
  if (probe.tls && netlifyConfigured() && (await allow(`domain-ssl:${domain}`, 1, 30 * 60_000))) {
    await provisionCertificate().catch((e) => console.warn("[domains] ssl provision", { domain, error: (e as Error).message }));
  }

  if (org.customDomainLiveAt) {
    const failures = org.customDomainFailures + 1;
    data.customDomainFailures = failures;
    if (failures >= LIVE_FAILURES_BEFORE_DEMOTE) {
      data.customDomainLiveAt = null;
      data.customDomainError = `${problem} New links use droplr.fm until this is fixed.`;
      console.warn("[domains] demoted", { org: org.id, domain, problem });
    } else data.customDomainError = null; // one blip isn't worth alarming the label
  } else data.customDomainError = problem;
  return save();
}

// --- Cron ---------------------------------------------------------------------------------------------------------

/** Every 15 minutes: retry removals, advance pending domains, re-check live ones, release long-paused aliases. */
export async function runDomainChecks(deadlineMs = Date.now() + 22_000) {
  const out = { detached: 0, checked: 0, released: 0, aliases: { used: 0, attached: 0, redirecting: 0, budget: ALIAS_BUDGET, free: ALIAS_BUDGET, warn: false } };
  out.detached = await processDetaches(5);

  const ago = (ms: number) => new Date(Date.now() - ms);
  const due = await prisma.organization.findMany({
    where: {
      customDomain: { not: null },
      OR: [
        { customDomainVerifiedAt: null, OR: [{ customDomainCheckedAt: null }, { customDomainCheckedAt: { lt: ago(55 * 60_000) } }] },
        { customDomainVerifiedAt: { not: null }, customDomainLiveAt: null, OR: [{ customDomainCheckedAt: null }, { customDomainCheckedAt: { lt: ago(14 * 60_000) } }] },
        { customDomainLiveAt: { not: null }, OR: [{ customDomainCheckedAt: null }, { customDomainCheckedAt: { lt: ago(6 * 3600_000) } }] },
      ],
    },
    orderBy: { customDomainCheckedAt: { sort: "asc", nulls: "first" } },
    select: { id: true },
    take: 20,
  });
  for (let i = 0; i < due.length && Date.now() < deadlineMs; i += 4) {
    const batch = due.slice(i, i + 4);
    await Promise.all(batch.map((o) => checkOrgDomain(o.id).catch((e) => console.error("[domains] check", { org: o.id, error: (e as Error).message }))));
    out.checked += batch.length;
  }

  // Plan lapsed long ago: stop holding the alias. The domain stays saved (and verified), so upgrading reconnects it.
  if (netlifyConfigured() && Date.now() < deadlineMs) {
    const cutoff = ago((CUSTOM_DOMAIN_GRACE_DAYS + PAUSED_DETACH_DAYS) * 86_400_000);
    const stale = await prisma.organization.findMany({
      where: { customDomainAttachedAt: { not: null }, planUpdatedAt: { lt: cutoff } },
      select: { id: true, plan: true, planUpdatedAt: true, customDomain: true },
      take: 5,
    });
    for (const o of stale) {
      if (!o.customDomain || activeCustomDomain(o) || Date.now() > deadlineMs) continue;
      try {
        await withNetlifyLock(() => detachDomain(o.customDomain!));
        await prisma.organization.update({ where: { id: o.id }, data: { customDomainAttachedAt: null, customDomainLiveAt: null } });
        out.released++;
      } catch (e) {
        console.error("[domains] release paused alias", { org: o.id, error: (e as Error).message });
      }
    }
  }

  // Counted last, so it reflects anything this run released.
  out.aliases = await aliasUsage();
  if (out.aliases.warn) {
    console.warn("[domains] custom hostname budget", {
      ...out.aliases,
      note: "Netlify puts a site's aliases on one Let's Encrypt certificate, which holds 100 names. Move to Cloudflare for SaaS before this fills.",
    });
  }
  return out;
}
