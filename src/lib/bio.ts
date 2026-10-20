import { z } from "zod";
import { BIO_FONT_IDS, BIO_THEME_IDS } from "./bio-themes";
import { SITE_URL } from "./env";
import { linkCustomDomain } from "./plans";

export function bioPublicUrl(org: { customDomain: string | null; plan: string | null; planUpdatedAt?: Date | null; customDomainLiveAt: Date | null }, slug: string) {
  const domain = linkCustomDomain(org);
  return domain ? `https://${domain}/b/${slug}` : `${SITE_URL}/b/${slug}`;
}

export const bioSchema = z.object({
  title: z.string().min(1).max(100),
  slug: z.string().min(1).max(60),
  bio: z.string().max(280).nullable().optional(),
  imageUrl: z.string().url(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
  backgroundUrl: z.string().url().nullable().optional().or(z.literal("")),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
  /** Only "on" is stored; the label's own permission is checked server-side at render. */
  labelBadge: z.enum(["on"]).nullable().optional().or(z.literal("")),
  artistProfileId: z.string().cuid().nullable().optional().or(z.literal("")),
  /** Only "on" is stored; null means off, which is the default. */
  releaseBlock: z.enum(["on"]).nullable().optional().or(z.literal("")),
  theme: z.enum(BIO_THEME_IDS as unknown as [string, ...string[]]).nullable().optional(),
  font: z.enum(BIO_FONT_IDS as unknown as [string, ...string[]]).nullable().optional(),
  isPublic: z.boolean().optional(),
});
