/**
 * The public gallery of live bio pages, droplr.fm/b.
 *
 * Three rules, each of which is the reason for something in the code:
 *
 * 1. OPT-IN, PER PAGE. A page is listed only when its owner ticked the box (`gallery = "on"`).
 *    It puts their name and picture on droplr's own marketing page, which is theirs to decide.
 *    Nothing ever sets the column but that tick, and it starts NULL on every page, new or old.
 *
 * 2. ONLY WHAT IS ALREADY PUBLIC. Unticking Public takes a page out without touching `gallery`, so
 *    re-publishing restores the owner's earlier choice rather than overriding it. The card shows
 *    nothing the page itself doesn't: picture, name, bio line, address. No view or tap counts --
 *    a number on a public page is a number someone gets asked about.
 *
 * 3. NEVER DROPLR'S OWN. Accounts named in PLATFORM_INTERNAL_ORG_SLUGS are left out. A gallery is
 *    social proof; the founder's own label in it is proof of nothing, and a visitor who worked
 *    that out would stop believing the rest of the page.
 *
 * Pure: the query lives in bio-gallery-server.
 */

/** Below this many listed pages the gallery is not indexed. An almost-empty room is not a page to send Google to. */
export const GALLERY_INDEX_MIN = 3;

/** How many the page shows. Newest-listed first. */
export const GALLERY_LIMIT = 60;

export type GalleryRow = {
  slug: string;
  title: string;
  bio: string | null;
  imageUrl: string;
  accentColor: string | null;
  gallery: string | null;
  isPublic: boolean;
  /** Visible link buttons. A page with none says "Links coming soon", which is not a page to show off. */
  activeLinks: number;
  orgSlug: string;
};

/**
 * `ownImage` is lib/bio-items isOwnImage, passed in to keep this file free of env. A page whose
 * picture is hosted somewhere else is left out: on droplr's own marketing page that picture would
 * have every visitor's browser fetch from a server nobody here chose. Uploading it fixes that.
 */
export function galleryEligible(r: GalleryRow, internal: readonly string[], ownImage: (url: string) => boolean): boolean {
  return r.gallery === "on" && r.isPublic && r.activeLinks > 0 && !internal.includes(r.orgSlug.toLowerCase()) && ownImage(r.imageUrl);
}

/** The bio line on a card: one line's worth, never the whole 280. */
export function galleryBlurb(bio: string | null): string | null {
  const one = (bio ?? "").replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > 90 ? `${one.slice(0, 89).trimEnd()}…` : one;
}
