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
  /** Featured: full size on the page instead of a tile that opens it. */
  highlight: z.boolean().optional(),
});

/**
 * How the merch block sits on the page. Two separate choices, because they answer two questions:
 * whether the merch is on the page at all until a fan asks for it, and what it looks like once it is.
 *
 * The default is the tidy one -- one "Merch" button, tiles inside -- so a page with eight products
 * is still a page of links first. NULL in both columns means that default.
 */
export const MERCH_SHOWS = ["button", "page"] as const;
export const MERCH_LAYOUTS = ["tiles", "carousel"] as const;
export type MerchDisplay = { show: (typeof MERCH_SHOWS)[number]; layout: (typeof MERCH_LAYOUTS)[number] };
export const DEFAULT_MERCH_DISPLAY: MerchDisplay = { show: "button", layout: "tiles" };

/** Stored columns -> what the page does. Anything unrecognised is the default, never nothing. */
export function merchDisplayOf(page: { merchShow: string | null; merchLayout: string | null }): MerchDisplay {
  return {
    show: page.merchShow === "page" ? "page" : "button",
    layout: page.merchLayout === "carousel" ? "carousel" : "tiles",
  };
}

/** What goes in the columns: NULL for each default, so a page that never chose follows the default. */
export function storedMerchDisplay(d: MerchDisplay): { merchShow: string | null; merchLayout: string | null } {
  return { merchShow: d.show === "page" ? "page" : null, merchLayout: d.layout === "carousel" ? "carousel" : null };
}

const merchDisplaySchema = z.object({ show: z.enum(MERCH_SHOWS), layout: z.enum(MERCH_LAYOUTS) });

export const merchPayloadSchema = z.object({ items: z.array(merchItemSchema).max(BIO_ITEM_LIMIT.merch, `Up to ${BIO_ITEM_LIMIT.merch} items`), display: merchDisplaySchema.optional() });
export const videoPayloadSchema = z.object({ items: z.array(videoItemSchema).max(BIO_ITEM_LIMIT.video, `Up to ${BIO_ITEM_LIMIT.video} videos`) });

/** A row as the public page gets it. */
export type BioItem = { id: string; name: string; url: string; imageUrl: string | null; highlight: boolean };

/**
 * Rows -> what a block shows. Hidden rows out, order kept. A video whose stored URL no longer
 * parses is dropped rather than rendered as a broken player.
 */
export function visibleItems(
  rows: { id: string; label: string | null; url: string; iconUrl: string | null; isActive: boolean; section: string | null; highlight?: string | null }[],
  section: BioItemSection,
): BioItem[] {
  return rows
    .filter((r) => r.section === section && r.isActive)
    .filter((r) => section !== "video" || youTubeId(r.url) !== null)
    // Only a video can be featured. A stray value on a merch row means nothing.
    .map((r) => ({ id: r.id, name: r.label ?? "", url: r.url, imageUrl: r.iconUrl, highlight: section === "video" && r.highlight === "on" }));
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
export const itemOut = (l: { id: string; label: string | null; url: string; iconUrl: string | null; isActive: boolean; highlight?: string | null }) =>
  ({ id: l.id, name: l.label ?? "", url: l.url, imageUrl: l.iconUrl, visible: l.isActive, highlight: l.highlight === "on" });
