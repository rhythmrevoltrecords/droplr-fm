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
  const [org, releases, fanRows, artists, links, agreements, statements] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { customDomain: true, stripeSubscriptionId: true } }),
    prisma.release.count({ where: { organizationId } }),
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(DISTINCT lower(p.email)) AS total
      FROM "PreSave" p JOIN "Release" r ON r.id = p."releaseId"
      WHERE r."organizationId" = ${organizationId} AND p.email IS NOT NULL`,
    prisma.artist.count({ where: { organizationId } }),
    prisma.releaseLink.count({ where: { release: { organizationId } } }),
    prisma.agreement.count({ where: { organizationId } }),
    prisma.statementImport.count({ where: { organizationId } }),
  ]);
  const fans = Number(fanRows[0]?.total ?? 0);
  return {
    releases, fans, artists, links, agreements, statements,
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

  // A connected domain would otherwise stay attached to droplr's site with nothing behind it. First,
  // because it is quick and must happen even if the image clean-up below runs out of time.
  if (org?.customDomain) await queueDetach(org.customDomain).catch((e) => console.error("[close] detach", e instanceof Error ? e.message : e));

  // The privacy policy says an account's data goes when it closes. Database rows cascade; the
  // pictures droplr stored (covers, artist and press photos, bio images and video stills) live in
  // Netlify Blobs, which nothing cascades to, and kept being served at /api/cover/… after the
  // account was gone. deleteStoredImages also purges the edge copies. Best-effort and after the
  // delete: the account is gone either way.
  // Only images no other account still points at: an image address is a plain URL field, so
  // anyone can paste another account's public cover address into their own release. Without this
  // check, closing that account would delete the other account's picture.
  const gone = await unreferenced(images);
  if (images.length && !gone.length) console.warn("[close] no images deleted", { images: images.length });
  await deleteStoredImages(gone);

  return { subscription };
}

/** The key of an image droplr stored, from its public address, or null for anything else. */
export function storedImageKey(url: string | null | undefined): string | null {
  const m = /\/api\/cover\/([A-Za-z0-9._-]+)$/.exec(url ?? "");
  return m ? m[1] : null;
}

/**
 * Tables that cannot hold an account's content: logs, tokens, fan records, events. Everything else
 * is searched, so a content table added later is covered without anyone remembering to list it.
 * Adding a table here makes the close faster; leaving one out only makes it slower.
 */
const NOT_CONTENT = new Set([
  "_prisma_migrations", "AuthThrottle", "ClickEvent", "ClipRender", "ConsentEvent", "ContestEntry", "ContestVote", "DomainDetach",
  "EmailVerificationToken", "EspConnection", "FanContact", "GateUnlock", "Invite", "NewsConfirmRequest", "NewsEmailDelivery",
  "PageView", "PasswordResetToken", "PlatformMessageSeen", "AgreementRelease", "PreSave", "SplitParty", "SplitSendLog", "SplitSheet", "StatementAllocation", "StatementImport", "StatementLine", "PromoStepAssign", "PromoStepReminder", "PromoTaskDone", "PushSubscription",
  "Referral", "RevokedSession", "SignupInvite", "User", "waitlist_features",
]);

/**
 * The keys no remaining row points at. Run after the delete. If the check fails or runs out of
 * time, nothing is deleted: a stray blob costs cents, someone else's missing cover is a broken release.
 *
 * Every text, JSON and text-array column of every content table is searched, not just the image
 * fields: an image address pasted into a download link, a news email button, a social link or a
 * bio button is still another account using that image. One pass per table pulls out every
 * `/api/cover/<key>` it holds (percent-escapes decoded, as the image route decodes them), so the
 * cost is one scan per table however many images the account had. Id and foreign-key columns
 * are skipped: they hold ids, never addresses.
 */
export async function unreferenced(keys: string[], timeoutMs = 8000): Promise<string[]> {
  if (!keys.length) return [];
  try {
    const cols = await prisma.$queryRaw<{ t: string; c: string }[]>`
      SELECT table_name::text AS t, column_name::text AS c FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (data_type IN ('text', 'character varying', 'json', 'jsonb') OR udt_name IN ('_text', '_varchar'))`;
    const byTable = new Map<string, string[]>();
    for (const { t, c } of cols) {
      if (NOT_CONTENT.has(t) || c === "id" || /Id$/.test(c)) continue;
      byTable.set(t, [...(byTable.get(t) ?? []), c]);
    }
    const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
    const found = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Math.max(1000, Math.floor(timeoutMs))}`);
        const seen = new Set<string>();
        for (const [table, columns] of byTable) {
          // ::text on every column: plain for text, the JSON source for json/jsonb, {a,b} for arrays.
          const joined = `concat_ws(' ', ${columns.map((c) => `${q(c)}::text`).join(", ")})`;
          const rows = await tx.$queryRawUnsafe<{ k: string }[]>(
            `SELECT DISTINCT m[1] AS k FROM ${q(table)}, LATERAL regexp_matches(${joined}, '/api/cover/([A-Za-z0-9._%-]+)', 'g') AS m`,
          );
          for (const r of rows) seen.add(r.k);
        }
        return seen;
      },
      { timeout: timeoutMs + 2000 },
    );
    // A key counts as used if any match starts with it: an address ending a sentence ("…/KEY.jpg.")
    // is captured with the full stop. Erring this way keeps an image; the other way deletes one.
    const used: string[] = [];
    for (const k of found) {
      try { used.push(decodeURIComponent(k)); } catch { used.push(k); }
    }
    return keys.filter((k) => !used.some((u) => u.startsWith(k)));
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
