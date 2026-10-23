// Relative imports only: the release-day job is bundled by Netlify's esbuild outside Next.
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { INDEXNOW_ENDPOINT, indexNowBatches, validIndexNowKey } from "./indexnow";
import { publicReleaseUrl } from "./release-url";
import { bioPublicUrl } from "./bio";
import { seoIndexable } from "./seo";

/**
 * Send changed public URLs to IndexNow. Never throws and never blocks a response: callers run it
 * inside after(). A failure costs nothing but the speed-up — the sitemaps still list the page.
 *
 * Off on deploy previews (seoIndexable), so a preview build can't announce preview URLs, and off
 * entirely until INDEXNOW_KEY is set.
 */
/** Whether pinging is on at all. Callers check it before doing any lookups, so an unset key costs nothing. */
export function indexNowOn(): boolean {
  return !!validIndexNowKey(process.env.INDEXNOW_KEY) && seoIndexable();
}

export async function pingIndexNow(urls: (string | null | undefined)[]): Promise<void> {
  const key = validIndexNowKey(process.env.INDEXNOW_KEY);
  if (!key || !seoIndexable()) return;
  for (const batch of indexNowBatches(urls, key)) {
    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(5000),
      });
      // 200 and 202 are both success. 422/403 mean the key file couldn't be read on that host.
      if (res.status !== 200 && res.status !== 202) console.error(`[indexnow] ${batch.host}: HTTP ${res.status}`);
    } catch (e) {
      console.error(`[indexnow] ${batch.host}:`, e instanceof Error ? e.message : e);
    }
  }
}

const orgFields = { slug: true, customDomain: true, plan: true, planUpdatedAt: true, customDomainLiveAt: true } as const;

/**
 * The address to announce for a release: only when it is one search engines are already told about
 * in /sitemap-releases.xml — public AND live. Never a private page, and never an upcoming one: an
 * address announced to IndexNow is shared with Bing, Yandex, Seznam and Naver, and a pre-release
 * slug ("ototo-x-secret-collab") is the artist's to reveal. null otherwise, and on any error.
 *
 * Callers announce the address from BEFORE a change as well as after: a page that was listed and
 * then moved, went private or was deleted gets recrawled and dropped. One that was never listed is
 * never mentioned, before or after.
 */
export async function releaseAddress(id: string): Promise<string | null> {
  try {
    const r = await prisma.release.findUnique({ where: { id }, select: { slug: true, isPublic: true, status: true, organization: { select: orgFields } } });
    return r && r.isPublic && r.status === "live" ? publicReleaseUrl(r.organization, r.slug, SITE_URL) : null;
  } catch {
    return null;
  }
}

/** Same rule for a bio page, which has no release day: public is listed (see /sitemap-bio.xml). */
export async function bioAddress(id: string): Promise<string | null> {
  try {
    const p = await prisma.bioPage.findUnique({ where: { id }, select: { slug: true, isPublic: true, organization: { select: orgFields } } });
    return p && p.isPublic ? bioPublicUrl(p.organization, p.slug) : null;
  } catch {
    return null;
  }
}
