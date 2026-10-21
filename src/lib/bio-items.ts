import { z } from "zod";
import { youTubeId } from "./youtube-id";

export { youTubeEmbedUrl, youTubeId, youTubeWatchUrl } from "./youtube-id";

/**
 * Merch and video blocks on a bio page.
 *
 * Both are stored as BioLink rows with a `section`, not as tables of their own, for one reason: a
 * tap on a merch card or a "Watch on YouTube" goes through the same counted redirect as every other
 * button (/api/b/<id>) and lands in the same "what they tapped" panel. A separate table would have
 * needed its own redirect, its own ClickEvent column and its own stats query, and would have been
 * the one thing on the page whose taps nobody could see.
 *
 * The rule every write path holds: A ROW ONLY EVER CHANGES INSIDE ITS OWN SECTION. The links editor
 * replaces the whole list it is given, so before sections existed "delete everything not in this
 * list" was correct. With sections it would delete every merch item the moment someone saved their
 * links. `sectionWhere` is the one place that scope is written down.
 *
 * Pure: no prisma, no network. The YouTube lookups live in bio-items-server.
 */

export const BIO_ITEM_SECTIONS = ["merch", "video"] as const;
export type BioItemSection = (typeof BIO_ITEM_SECTIONS)[number];

/** The `section` query value a write was sent with -> what the column holds. null = link buttons. */
export function parseSection(raw: string | null | undefined): BioItemSection | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  return (BIO_ITEM_SECTIONS as readonly string[]).includes(raw) ? (raw as BioItemSection) : undefined;
}

/**
 * The Prisma filter for "rows in this block". `null` is the link buttons, and has to be written
 * as `section: null` -- leaving the key out would match every section, which is the bug.
 */
export const sectionWhere = (section: BioItemSection | null) => ({ section });

/**
 * How many of each a page holds. A bio page is opened on a phone in an in-app browser: four videos
 * is already a long scroll, and eight products is a shop, which is what the "Shop" link is for.
 */
export const BIO_ITEM_LIMIT: Record<BioItemSection, number> = { merch: 8, video: 4 };

export const BIO_ITEM_NAME_MAX = 60;

/** What the editor sends for a merch item. The image is required: a product card with no picture is a link. */
export const merchItemSchema = z.object({
  id: z.string().max(40).nullable().optional(),
  name: z.string().trim().min(1, "Every item needs a name").max(BIO_ITEM_NAME_MAX),
  url: z.string().trim().refine((u) => /^https:\/\//i.test(u) && URL.canParse(u), "Every item needs a full shop address (https://…)"),
  imageUrl: z.string().url("Every item needs a picture"),
  visible: z.boolean(),
});

/** What the editor sends for a video. Title and picture are looked up, not typed. */
export const videoItemSchema = z.object({
  id: z.string().max(40).nullable().optional(),
  url: z.string().trim().refine((u) => youTubeId(u) !== null, "That isn't a YouTube video link. Copy it from Share on the video."),
  visible: z.boolean(),
});

export const merchPayloadSchema = z.object({ items: z.array(merchItemSchema).max(BIO_ITEM_LIMIT.merch, `Up to ${BIO_ITEM_LIMIT.merch} items`) });
export const videoPayloadSchema = z.object({ items: z.array(videoItemSchema).max(BIO_ITEM_LIMIT.video, `Up to ${BIO_ITEM_LIMIT.video} videos`) });

/** A row as the public page gets it. */
export type BioItem = { id: string; name: string; url: string; imageUrl: string | null };

/**
 * Rows -> what a block shows. Hidden rows out, order kept. A video whose stored URL no longer
 * parses is dropped rather than rendered as a broken player.
 */
export function visibleItems(
  rows: { id: string; label: string | null; url: string; iconUrl: string | null; isActive: boolean; section: string | null }[],
  section: BioItemSection,
): BioItem[] {
  return rows
    .filter((r) => r.section === section && r.isActive)
    .filter((r) => section !== "video" || youTubeId(r.url) !== null)
    .map((r) => ({ id: r.id, name: r.label ?? "", url: r.url, imageUrl: r.iconUrl }));
}

/**
 * Is this an image droplr stored itself? Merch pictures must be: any other address would have
 * every fan's browser fetch from a server nobody here chose. `/uploads/` is the local-dev fallback
 * in lib/blobs and is only ever produced off Netlify.
 */
export function isOwnImage(url: string, siteUrl: string): boolean {
  return url.startsWith(`${siteUrl}/api/cover/`) || url.startsWith(`${siteUrl}/uploads/`);
}

/** A stored row as the editor gets it back. */
export const itemOut = (l: { id: string; label: string | null; url: string; iconUrl: string | null; isActive: boolean }) =>
  ({ id: l.id, name: l.label ?? "", url: l.url, imageUrl: l.iconUrl, visible: l.isActive });
