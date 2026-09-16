import { z } from "zod";
import { SITE_URL } from "./env";

export function bioPublicUrl(org: { customDomain: string | null }, slug: string) {
  return org.customDomain ? `https://${org.customDomain}/b/${slug}` : `${SITE_URL}/b/${slug}`;
}

export const bioSchema = z.object({
  title: z.string().min(1).max(100),
  slug: z.string().min(1).max(60),
  bio: z.string().max(280).nullable().optional(),
  imageUrl: z.string().url(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
  isPublic: z.boolean().optional(),
});
