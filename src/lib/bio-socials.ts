import { SOCIAL_KEYS, SOCIAL_LABELS, readSocialLinks, type SocialKey } from "./artist-fields";

/**
 * The row of social icons under the name on a bio page and under the artist on a release page.
 *
 * Read from the artist profile's socialLinks, never copied onto the page. The profile is where the
 * press kit gets its socials too, so an artist who changes a handle changes it once and both follow.
 * A second, per-page copy would be the thing everyone forgets to update.
 *
 * A tap goes through droplr's own redirect (/api/b/social/<pageId>/<key>) so it is counted like
 * every other button. That route never takes a URL from the request: it looks the address up on the
 * same profile this file reads, so it cannot be used to bounce someone to an arbitrary site.
 *
 * Pure: no prisma. Resolving which profile a page uses is lib/bio-socials-server.
 */

export type BioSocial = { key: SocialKey; label: string; url: string };

/** Only https addresses that parse. The profile form already insists on that; this re-checks on the way out. */
const safe = (u: string) => /^https:\/\//i.test(u) && URL.canParse(u);

/** Profile socials -> the icons, in one fixed order so every page looks the same shape. */
export function bioSocials(socialLinks: unknown): BioSocial[] {
  const links = readSocialLinks(socialLinks);
  return SOCIAL_KEYS.filter((k) => !!links[k] && safe(links[k]!)).map((k) => ({ key: k, label: SOCIAL_LABELS[k], url: links[k]! }));
}

/** The address a tap on one icon goes to, or null when that page has no such icon. */
export function socialTarget(socialLinks: unknown, key: string): string | null {
  return bioSocials(socialLinks).find((s) => s.key === key)?.url ?? null;
}

/** Only "on" shows the row. See the column comment in schema.prisma. */
export const showSocials = (page: { socialIcons: string | null }) => page.socialIcons === "on";

/** The counted redirect for one icon on a bio page. */
export const socialHref = (pageId: string, key: SocialKey) => `/api/b/social/${pageId}/${key}`;

/** The counted redirect for one icon on a release page (pre-save or smart link). */
export const releaseSocialHref = (releaseId: string, key: SocialKey) => `/api/r/social/${releaseId}/${key}`;

/**
 * What a social icon tap stores in ClickEvent.platform. Prefixed, not the bare key, because a tap on
 * a link button that was later deleted ALSO ends up with no bioLinkId (SetNull) and its platform
 * still says "instagram" -- without the prefix the stats would credit it to the icon.
 */
export const ICON_PLATFORM_PREFIX = "icon:";
export const iconPlatform = (key: SocialKey) => `${ICON_PLATFORM_PREFIX}${key}`;

/**
 * For the editor's preview: the icons each "This page is for" choice would show. "" is the page's
 * default -- an artist account's own (first non-alumni) profile, and nothing for a label's own
 * page -- which must agree with socialSource, the one the public page uses.
 */
export function socialsFor(artists: { id: string; socialLinks: unknown }[], orgKind: string | null | undefined): Record<string, BioSocial[]> {
  const out: Record<string, BioSocial[]> = { "": orgKind === "artist" && artists[0] ? bioSocials(artists[0].socialLinks) : [] };
  for (const a of artists) out[a.id] = bioSocials(a.socialLinks);
  return out;
}
