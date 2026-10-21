import { z } from "zod";
import { BIO_SUBSCRIBE_TEXT_MAX } from "./bio-subscribe";
import { BIO_FONT_IDS, BIO_THEME_IDS } from "./bio-themes";
import { SITE_URL } from "./env";
import { linkCustomDomain } from "./plans";

export function bioPublicUrl(org: { customDomain: string | null; plan: string | null; planUpdatedAt?: Date | null; customDomainLiveAt: Date | null }, slug: string) {
  const domain = linkCustomDomain(org);
  return domain ? `https://${domain}/b/${slug}` : `${SITE_URL}/b/${slug}`;
}

/**
 * How many bio pages an account may have.
 *
 * An artist is one person with one page: a second one splits their own audience between two links
 * and neither ends up being the one in their bio. A label runs a roster, so it needs one per
 * artist plus its own. Not a plan limit — this is about what the account IS, so it does not move
 * when someone upgrades, and nobody can buy their way into a confusing page.
 */
export const bioPageLimit = (orgKind: string | null | undefined) => (orgKind === "artist" ? 1 : Infinity);

export const BIO_PAGE_LIMIT_MESSAGE =
  "Your account already has a bio link. Edit that one rather than making a second — two links to the same artist just splits who sees what.";

export const bioSchema = z.object({
  title: z.string().min(1).max(100),
  slug: z.string().min(1).max(60),
  bio: z.string().max(280).nullable().optional(),
  imageUrl: z.string().url(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
  backgroundUrl: z.string().url().nullable().optional().or(z.literal("")),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
  buttonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
  /** Only "on" is stored; the label's own permission is checked server-side at render. */
  labelBadge: z.enum(["on"]).nullable().optional().or(z.literal("")),
  artistProfileId: z.string().cuid().nullable().optional().or(z.literal("")),
  /** Only "on" is stored; null means off, which is the default. */
  releaseBlock: z.enum(["on"]).nullable().optional().or(z.literal("")),
  /** Only "on" is stored; null means the page does not ask for email addresses. */
  subscribe: z.enum(["on"]).nullable().optional().or(z.literal("")),
  subscribeText: z.string().max(BIO_SUBSCRIBE_TEXT_MAX).nullable().optional().or(z.literal("")),
  /** Comma-separated section keys. Reconciled on the way in, so a junk value cannot be stored. */
  sectionOrder: z.string().max(200).nullable().optional().or(z.literal("")),
  theme: z.enum(BIO_THEME_IDS as unknown as [string, ...string[]]).nullable().optional(),
  font: z.enum(BIO_FONT_IDS as unknown as [string, ...string[]]).nullable().optional(),
  /** Only "on" is stored; null means not listed in the gallery, which is the default for every page. */
  gallery: z.enum(["on"]).nullable().optional().or(z.literal("")),
  isPublic: z.boolean().optional(),
});
