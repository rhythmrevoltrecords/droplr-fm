import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { bioAddress, pingIndexNow, releaseAddress } from "@/lib/indexnow-server";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { blankToNull, linksPayloadSchema } from "@/lib/link-input";
import { isOwnImage, itemOut, merchPayloadSchema, storedMerchDisplay, parseSection, sectionWhere, videoPayloadSchema, youTubeId, youTubeWatchUrl, type BioItemSection } from "@/lib/bio-items";
import { copyThumbnail, lookUpVideo } from "@/lib/bio-items-server";

/**
 * Replace one block's rows on a bio page: the link buttons (no ?section), or ?section=merch|video.
 *
 * Same shape for all three: the editor sends the whole list, rows it still lists keep their id and
 * click count, rows it doesn't are deleted, order is the array order. Every one of those steps is
 * scoped to the block being saved -- see lib/bio-items for why that is the rule.
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const section = parseSection(req.nextUrl.searchParams.get("section"));
  if (section === undefined) return NextResponse.json({ error: "Unknown section" }, { status: 400 });

  const page = await prisma.bioPage.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { links: { where: sectionWhere(section), select: { id: true, url: true, label: true, iconUrl: true } } },
  });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);

  if (section === null) return saveLinks(page, body);
  return saveItems(page, section, body);
}

type Page = { id: string; links: { id: string; url: string; label: string | null; iconUrl: string | null }[] };

/** Ids the caller may keep: only rows already on this page AND in this block. */
function keepable(page: Page, ids: (string | null | undefined)[]) {
  const existing = new Set(page.links.map((l) => l.id));
  return new Set(ids.filter((id): id is string => !!id && existing.has(id)));
}

const issues = (e: { issues: { message: string }[] }) => [...new Set(e.issues.map((i) => i.message))].join("; ");

/** Same editor payload as release links; stored on BioLink (title→label, visible→isActive). Ids and click counts are kept. */
async function saveLinks(page: Page, body: unknown) {
  const parsed = linksPayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: issues(parsed.error) }, { status: 400 });
  const keep = keepable(page, parsed.data.links.map((l) => l.id));
  await prisma.$transaction([
    prisma.bioLink.deleteMany({ where: { bioPageId: page.id, ...sectionWhere(null), id: { notIn: [...keep] } } }),
    ...parsed.data.links.map((l, order) => {
      const data = { platform: l.platform, url: l.url, label: blankToNull(l.title), buttonText: blankToNull(l.buttonText), icon: blankToNull(l.icon), iconUrl: blankToNull(l.iconUrl), isActive: l.visible, order };
      return l.id && keep.has(l.id)
        ? prisma.bioLink.update({ where: { id: l.id }, data })
        : prisma.bioLink.create({ data: { ...data, section: null, bioPageId: page.id } });
    }),
  ]);
  const links = await prisma.bioLink.findMany({ where: { bioPageId: page.id, ...sectionWhere(null) }, orderBy: { order: "asc" } });
  after(async () => pingIndexNow([await bioAddress(page.id)]));
  return NextResponse.json({ ok: true, links: links.map((l) => ({ id: l.id, platform: l.platform, url: l.url, title: l.label, buttonText: l.buttonText, icon: l.icon, iconUrl: l.iconUrl, visible: l.isActive })) });
}

type Row = { id?: string | null; platform: string; url: string; label: string; iconUrl: string | null; isActive: boolean; highlight: string | null };

async function saveItems(page: Page, section: BioItemSection, body: unknown) {
  let rows: Row[];
  // The merch block's look is saved with its items, from the same card. Only ever written to
  // this page: `page` was found by id AND the caller's organisation.
  let display: ReturnType<typeof storedMerchDisplay> | null = null;
  if (section === "merch") {
    const parsed = merchPayloadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: issues(parsed.error) }, { status: 400 });
    // The picture has to be one droplr stored. Any other address would have every fan's browser
    // fetch an image from a server nobody here chose, which the privacy page does not cover.
    if (parsed.data.items.some((i) => !isOwnImage(i.imageUrl, SITE_URL))) {
      return NextResponse.json({ error: "Upload the picture here rather than linking to one." }, { status: 400 });
    }
    rows = parsed.data.items.map((i) => ({ id: i.id, platform: "custom", url: i.url, label: i.name, iconUrl: i.imageUrl, isActive: i.visible, highlight: null }));
    if (parsed.data.display) display = storedMerchDisplay(parsed.data.display);
  } else {
    const parsed = videoPayloadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: issues(parsed.error) }, { status: 400 });
    const ids = parsed.data.items.map((i) => youTubeId(i.url));
    if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "That video is on the list twice." }, { status: 400 });
    const sentIds = parsed.data.items.map((i) => i.id).filter((id): id is string => !!id);
    if (new Set(sentIds).size !== sentIds.length) return NextResponse.json({ error: "That video is on the list twice." }, { status: 400 });
    const claimed = new Set(sentIds);
    const byUrl = new Map(page.links.map((l) => [l.url, l]));
    // Looked up together, not one after another: four new videos in a row could otherwise outlive
    // the function's time limit, and a save that times out writes nothing and says nothing useful.
    const resolved = await Promise.all(parsed.data.items.map(async (i) => {
      const vid = youTubeId(i.url)!;
      const url = youTubeWatchUrl(vid);
      const known = byUrl.get(url);
      // Already on the page as this exact video: keep what was looked up. Its row id is reused only
      // when nothing else in this save claims it, or two rows would both update one and a video
      // would silently disappear.
      const id = i.id ?? (known && !claimed.has(known.id) ? known.id : null);
      if (known) {
        // A still that failed to copy last time is tried again rather than left empty for good.
        const iconUrl = known.iconUrl ?? (await copyThumbnail(vid));
        return { ok: true as const, row: { id, platform: "youtube", url, label: known.label ?? "Video", iconUrl, isActive: i.visible, highlight: i.highlight ? "on" : null } };
      }
      const found = await lookUpVideo(vid);
      if (!found.ok) return { ok: false as const, error: found.error };
      return { ok: true as const, row: { id: i.id, platform: "youtube", url, label: found.title, iconUrl: found.thumbnailUrl, isActive: i.visible, highlight: i.highlight ? "on" : null } };
    }));
    const bad = resolved.find((r) => !r.ok);
    if (bad && !bad.ok) return NextResponse.json({ error: bad.error }, { status: 400 });
    rows = resolved.map((r) => (r.ok ? r.row : null)!);
  }

  const keep = keepable(page, rows.map((r) => r.id));
  await prisma.$transaction([
    prisma.bioLink.deleteMany({ where: { bioPageId: page.id, ...sectionWhere(section), id: { notIn: [...keep] } } }),
    ...rows.map((r, order) => {
      const data = { platform: r.platform, url: r.url, label: r.label, iconUrl: r.iconUrl, isActive: r.isActive, highlight: r.highlight, order };
      return r.id && keep.has(r.id)
        ? prisma.bioLink.update({ where: { id: r.id }, data })
        : prisma.bioLink.create({ data: { ...data, section, bioPageId: page.id } });
    }),
    ...(display ? [prisma.bioPage.update({ where: { id: page.id }, data: display })] : []),
  ]);
  const saved = await prisma.bioLink.findMany({ where: { bioPageId: page.id, ...sectionWhere(section) }, orderBy: { order: "asc" } });
  after(async () => pingIndexNow([await bioAddress(page.id)]));
  return NextResponse.json({ ok: true, items: saved.map(itemOut) });
}
