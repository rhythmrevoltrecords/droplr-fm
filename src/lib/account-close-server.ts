import type { CloseSummary } from "@/lib/account-close";
import { prisma } from "@/lib/db";
import { getStripe, stripeConfigured, stripeId } from "@/lib/stripe";
import { deleteStoredImages } from "@/lib/blobs";
import { queueDetach } from "@/lib/domains";

/**
 * Closing an account.
 *
 * The rule this file exists to enforce: **leaving is not a funnel**. There is one confirmation,
 * it says what actually breaks, and the fan list downloads on every plan including Free. droplr's
 * whole argument is that an acquisition or a shutdown leaves artists with a working redirect and no
 * data; a close-account flow that hides the export behind a paid plan would make that a slogan.
 *
 * On the export gate specifically: `csvExport` is false on Free, and this flow ignores it. That is
 * not a hole in the gate, because the gate was never hiding the data — every address is visible on
 * the Free fan list and always has been, and the paid part is the convenience of a file. At the
 * moment someone leaves, charging for the convenience is the behaviour droplr exists to argue with.
 */

/** What the person is about to lose, counted rather than described. */
export async function closeSummary(organizationId: string): Promise<CloseSummary> {
  // Fans are distinct emails across PreSave, not a table of their own — same shape fanSummary uses,
  // so the number here is the number on the fans page rather than a second, differently-wrong count.
  const [org, releases, fanRows, artists, links] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { customDomain: true, stripeSubscriptionId: true } }),
    prisma.release.count({ where: { organizationId } }),
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(DISTINCT lower(p.email)) AS total
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE r."organizationId" = ${organizationId} AND p.email IS NOT NULL`,
    prisma.artist.count({ where: { organizationId } }),
    prisma.releaseLink.count({ where: { release: { organizationId } } }),
  ]);
  const fans = Number(fanRows[0]?.total ?? 0);
  return {
    releases, fans, artists, links,
    customDomain: org?.customDomain ?? null,
    subscription: Boolean(org?.stripeSubscriptionId),
  };
}

/**
 * Cancel the Stripe subscription **now**, not at period end.
 *
 * At period end would be the kinder-sounding default and the wrong one here: the account is about
 * to stop existing, so a subscription outliving it bills a customer whose data we deleted, and the
 * webhook that would normally reconcile it has nothing left to write to.
 *
 * A failure here must not stop the deletion. Someone who asked to leave does not get told "no"
 * because Stripe timed out — it is logged, and an orphan subscription is a thing a human can fix,
 * whereas a half-deleted account is not.
 */
async function cancelSubscription(subscriptionId: string | null): Promise<"cancelled" | "none" | "failed"> {
  if (!subscriptionId || !stripeConfigured()) return "none";
  try {
    await getStripe().subscriptions.cancel(subscriptionId);
    return "cancelled";
  } catch (e) {
    console.error("[account-close] could not cancel subscription", subscriptionId, e);
    return "failed";
  }
}

/**
 * Delete the organisation and everything hanging off it.
 *
 * Every org-scoped model cascades from Organization except `WaitlistFeature`, which carries an
 * `organizationId` with no foreign key behind it — so it would quietly survive the delete and leave
 * rows pointing at an organisation that no longer exists. It is removed by hand, first, inside the
 * same transaction. **If another model is ever given an organizationId without a relation, it
 * belongs in this list**; `test:security` asserts the list is complete.
 */
export async function closeAccount(organizationId: string): Promise<{ subscription: "cancelled" | "none" | "failed" }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeSubscriptionId: true, customDomain: true },
  });
  const subscription = await cancelSubscription(stripeId(org?.stripeSubscriptionId));
  // Read before the rows go: afterwards nothing records which stored images were this account's.
  const images = await storedImageKeys(organizationId);

  await prisma.$transaction([
    prisma.waitlistFeature.deleteMany({ where: { organizationId } }),
    prisma.organization.delete({ where: { id: organizationId } }),
  ]);

  // The privacy policy says an account's data goes when it closes. Database rows cascade; the
  // pictures droplr stored (covers, artist and press photos, bio images and video stills) live in
  // Netlify Blobs, which nothing cascades to, and kept being served at /api/cover/… after the
  // account was gone. deleteStoredImages also purges the edge copies. Best-effort and after the
  // delete: the account is gone either way.
  // Only images no other account still points at: an image address is a plain URL field, so
  // anyone can paste another account's public cover address into their own release. Without this
  // check, closing that account would delete the other account's picture.
  await deleteStoredImages(await unreferenced(images));
  // A connected domain would otherwise stay attached to droplr's site with nothing behind it.
  if (org?.customDomain) await queueDetach(org.customDomain).catch((e) => console.error("[close] detach", e instanceof Error ? e.message : e));

  return { subscription };
}

/** The key of an image droplr stored, from its public address, or null for anything else. */
export function storedImageKey(url: string | null | undefined): string | null {
  const m = /\/api\/cover\/([A-Za-z0-9._-]+)$/.exec(url ?? "");
  return m ? m[1] : null;
}

/**
 * The keys no remaining row points at. Run after the delete. If the check itself fails, nothing is
 * deleted: a stray blob costs cents, someone else's missing cover is a broken release.
 */
export async function unreferenced(keys: string[]): Promise<string[]> {
  if (!keys.length) return [];
  try {
    const rows = await prisma.$queryRaw<{ k: string }[]>`
      WITH refs(u) AS (
        SELECT "logoUrl" FROM "Organization"
        UNION ALL SELECT "coverUrl" FROM "Release"
        UNION ALL SELECT "backgroundUrl" FROM "Release"
        UNION ALL SELECT "backgroundSourceUrl" FROM "Release"
        UNION ALL SELECT "iconUrl" FROM "ReleaseLink"
        UNION ALL SELECT "photoUrl" FROM "Artist"
        UNION ALL SELECT unnest("pressPhotoUrls") FROM "Artist"
        UNION ALL SELECT "imageUrl" FROM "BioPage"
        UNION ALL SELECT "backgroundUrl" FROM "BioPage"
        UNION ALL SELECT "backgroundSourceUrl" FROM "BioPage"
        UNION ALL SELECT "iconUrl" FROM "BioLink"
      )
      SELECT DISTINCT k FROM unnest(${keys}::text[]) AS k
      JOIN refs ON refs.u IS NOT NULL AND position('/api/cover/' || k IN refs.u) > 0`;
    const kept = new Set(rows.map((r) => r.k));
    return keys.filter((k) => !kept.has(k));
  } catch (e) {
    console.error("[close] image reference check", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Every stored-image key an account's rows point at. */
async function storedImageKeys(organizationId: string): Promise<string[]> {
  const [org, releases, links, artists, bios, bioLinks] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { logoUrl: true } }),
    prisma.release.findMany({ where: { organizationId }, select: { coverUrl: true, backgroundUrl: true, backgroundSourceUrl: true } }),
    prisma.releaseLink.findMany({ where: { release: { organizationId } }, select: { iconUrl: true } }),
    prisma.artist.findMany({ where: { organizationId }, select: { photoUrl: true, pressPhotoUrls: true } }),
    prisma.bioPage.findMany({ where: { organizationId }, select: { imageUrl: true, backgroundUrl: true, backgroundSourceUrl: true } }),
    prisma.bioLink.findMany({ where: { bioPage: { organizationId } }, select: { iconUrl: true } }),
  ]);
  const urls = [
    org?.logoUrl,
    ...releases.flatMap((r) => [r.coverUrl, r.backgroundUrl, r.backgroundSourceUrl]),
    ...links.map((l) => l.iconUrl),
    ...artists.flatMap((a) => [a.photoUrl, ...a.pressPhotoUrls]),
    ...bios.flatMap((b) => [b.imageUrl, b.backgroundUrl, b.backgroundSourceUrl]),
    ...bioLinks.map((l) => l.iconUrl),
  ];
  return [...new Set(urls.map(storedImageKey).filter((k): k is string => !!k))];
}
