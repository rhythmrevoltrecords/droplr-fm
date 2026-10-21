/**
 * Merch and video blocks on a bio page, the gallery's rules, and the 21 Oct walkthrough fixes.
 *
 * Pure functions plus source assertions. No database, no server, no network. The database half --
 * that a save in one block can never delete another block's rows, cross-tenant, and the gallery
 * actually listing and unlisting -- is section 99 of test-security.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIO_ITEM_LIMIT,
  DEFAULT_MERCH_DISPLAY,
  merchDisplayOf,
  storedMerchDisplay,
  isOwnImage,
  merchPayloadSchema,
  parseSection,
  sectionWhere,
  videoPayloadSchema,
  visibleItems,
} from "../src/lib/bio-items";
import { youTubeEmbedUrl, youTubeId, youTubeWatchUrl } from "../src/lib/youtube-id";
import { GALLERY_INDEX_MIN, galleryBlurb, galleryEligible, type GalleryRow } from "../src/lib/bio-gallery";
import { missingFields, missingLine } from "../src/lib/bio-form-check";
import { tourSteps } from "../src/lib/tour";
import { BIO_SECTIONS, sectionOrder } from "../src/lib/bio-sections";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- YouTube ids ----------------------------------------------------------------------------

const ID = "pgSIW6lZ0Lo";
for (const u of [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?v=${ID}&t=42s`,
  `https://m.youtube.com/watch?v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}&si=abc`,
  `https://youtu.be/${ID}`,
  `https://youtu.be/${ID}?si=xyz`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/live/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `  https://youtu.be/${ID}  `,
]) check(`reads the id out of ${u.trim()}`, youTubeId(u) === ID, String(youTubeId(u)));

for (const u of [
  `https://www.youtube.com.evil.example/watch?v=${ID}`,
  `https://evil.example/watch?v=${ID}`,
  `https://evilyoutube.com/watch?v=${ID}`,
  `https://notyoutube.com/embed/${ID}`,
  `https://notyoutu.be/${ID}`,
  `javascript:alert(1)//youtu.be/${ID}`,
  `https://www.youtube.com/watch?v=${ID}x`,
  `https://www.youtube.com/watch?v=short`,
  `https://youtu.be/${ID.slice(0, 10)}`,
  `https://www.youtube.com/watch?v=abc"onload="x`,
  `https://www.youtube.com/channel/UC1234567890`,
  `https://www.youtube.com/playlist?list=PL123`,
  `https://vimeo.com/123456`,
  `ftp://youtu.be/${ID}`,
  "",
  "not a url",
]) check(`refuses ${JSON.stringify(u)}`, youTubeId(u) === null, String(youTubeId(u)));

check("the player address is built from the id alone", youTubeEmbedUrl(ID).startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`));
check("the watch address is rebuilt, not the pasted text", youTubeWatchUrl(ID) === `https://www.youtube.com/watch?v=${ID}`);

// ---- sections -------------------------------------------------------------------------------

check("no section means the link buttons", parseSection(null) === null && parseSection(undefined) === null && parseSection("") === null);
check("merch and video are sections", parseSection("merch") === "merch" && parseSection("video") === "video");
for (const junk of ["MERCH", "links", "gallery", "merch ", "__proto__"]) check(`"${junk}" is refused, not treated as links`, parseSection(junk) === undefined);

// The one that matters. `{ section: undefined }` would be dropped by Prisma and match every block,
// which is exactly how saving the links would delete the merch.
const linksScope = sectionWhere(null);
check("the links scope names section explicitly", Object.prototype.hasOwnProperty.call(linksScope, "section") && linksScope.section === null);
check("a block's scope is that block", sectionWhere("merch").section === "merch" && sectionWhere("video").section === "video");

const route = code(read("src/app/api/admin/bio/[id]/links/route.ts"));
const deletes = [...route.matchAll(/deleteMany\(\{\s*where:\s*\{([^}]*)\}/g)].map((m) => m[1]);
check("the save route has a delete per kind of save", deletes.length === 2, `${deletes.length}`);
check("every delete in the save route is scoped to one block", deletes.every((w) => /sectionWhere\(/.test(w)), deletes.join(" | "));
check("the page's existing rows are read for one block only", /links:\s*\{\s*where:\s*sectionWhere\(section\)/.test(route));
check("a new link row is created in no block", /section:\s*null,\s*bioPageId/.test(route));

// ---- what the editor may send --------------------------------------------------------------

const own = "http://localhost:8888/api/cover/a.webp";
const good = { name: "Tour tee", url: "https://shop.example/tee", imageUrl: own, visible: true };
check("a normal merch item is accepted", merchPayloadSchema.safeParse({ items: [good] }).success);
check("merch needs a name", !merchPayloadSchema.safeParse({ items: [{ ...good, name: "  " }] }).success);
check("merch needs a picture", !merchPayloadSchema.safeParse({ items: [{ ...good, imageUrl: "" }] }).success);
check("merch needs an https shop address", !merchPayloadSchema.safeParse({ items: [{ ...good, url: "http://shop.example" }] }).success);
check("merch refuses a javascript: address", !merchPayloadSchema.safeParse({ items: [{ ...good, url: "javascript:alert(1)" }] }).success);
check(`merch stops at ${BIO_ITEM_LIMIT.merch}`, merchPayloadSchema.safeParse({ items: Array(BIO_ITEM_LIMIT.merch).fill(good) }).success && !merchPayloadSchema.safeParse({ items: Array(BIO_ITEM_LIMIT.merch + 1).fill(good) }).success);
const vid = { url: `https://youtu.be/${ID}`, visible: true };
check("a YouTube link is accepted", videoPayloadSchema.safeParse({ items: [vid] }).success);
check("anything else is refused with a reason", (() => { const r = videoPayloadSchema.safeParse({ items: [{ ...vid, url: "https://vimeo.com/1" }] }); return !r.success && /YouTube/.test(r.error.issues[0].message); })());
check(`videos stop at ${BIO_ITEM_LIMIT.video}`, videoPayloadSchema.safeParse({ items: Array(BIO_ITEM_LIMIT.video).fill(vid) }).success && !videoPayloadSchema.safeParse({ items: Array(BIO_ITEM_LIMIT.video + 1).fill(vid) }).success);

const site = "https://droplr.fm";
check("an image droplr stored is its own", isOwnImage(`${site}/api/cover/x.webp`, site));
for (const u of ["https://droplr.fm.evil.example/api/cover/x.webp", "https://evil.example/https://droplr.fm/api/cover/x", "https://droplr.fm/api/coverx.webp", "https://droplr.fm/api/b/abc", "https://i.ytimg.com/vi/x/hq.jpg"]) {
  check(`${u} is not droplr's`, !isOwnImage(u, site));
}

// ---- what the public page shows -----------------------------------------------------------

const rows = [
  { id: "1", label: "Tee", url: "https://s/1", iconUrl: own, isActive: true, section: "merch" },
  { id: "2", label: "Hidden", url: "https://s/2", iconUrl: own, isActive: false, section: "merch" },
  { id: "3", label: "Insta", url: "https://instagram.com/x", iconUrl: null, isActive: true, section: null },
  { id: "4", label: "Clip", url: youTubeWatchUrl(ID), iconUrl: null, isActive: true, section: "video" },
  { id: "5", label: "Broken", url: "https://www.youtube.com/watch?v=nope", iconUrl: null, isActive: true, section: "video" },
];
check("merch shows visible merch only", JSON.stringify(visibleItems(rows, "merch").map((r) => r.id)) === '["1"]');
check("a link button never shows up as merch", !visibleItems(rows, "merch").some((r) => r.id === "3"));
check("a video whose address no longer parses is dropped, not rendered broken", JSON.stringify(visibleItems(rows, "video").map((r) => r.id)) === '["4"]');
check("\"Links coming soon\" only when the page has nothing at all", /page\.links\.length === 0 && page\.merch\.length === 0 && page\.videos\.length === 0/.test(code(read("src/components/public/bio-view.tsx"))));
check("silent on a page with no merch or videos", visibleItems(rows.filter((r) => r.section === null), "merch").length === 0 && visibleItems([], "video").length === 0);

check("video and merch are orderable sections", BIO_SECTIONS.includes("video") && BIO_SECTIONS.includes("merch"));
check("a page saved before they existed still gets them", sectionOrder("subscribe,release,links,catalogue").includes("video") && sectionOrder("subscribe,release,links,catalogue").includes("merch"));
check("…without moving what it already had", sectionOrder("subscribe,release,links,catalogue").filter((s) => !["video", "merch"].includes(s)).join(",") === "subscribe,release,links,catalogue");
check("the default order keeps the four old blocks where they were", BIO_SECTIONS.filter((s) => !["video", "merch"].includes(s)).join(",") === "release,links,subscribe,catalogue");

const view = code(read("src/components/public/bio-view.tsx"));
check("the view renders the merch block only when it has items", /section === "merch" && page\.merch\.length > 0/.test(view));
check("the view renders the video block only when it has items", /section === "video" && page\.videos\.length > 0/.test(view));
check("merch taps go through the counted redirect", view.includes("`/api/b/${m.id}`"));
check("merch and videos are required on BioViewData", /\n\s*merch: BioItem\[\];/.test(read("src/components/public/bio-view.tsx")) && /\n\s*videos: BioItem\[\];/.test(read("src/components/public/bio-view.tsx")));

const card = read("src/components/public/bio-video.tsx");
const cardImports = [...card.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
check("the public video card imports only react and lib/youtube-id", cardImports.every((i) => i === "react" || i === "@/lib/youtube-id"), cardImports.join(", "));
check("lib/youtube-id imports nothing", !/^import /m.test(read("src/lib/youtube-id.ts")));
check("the player is only mounted after play", /playing \? \(\s*<iframe/.test(card));
check("the iframe src is built by youTubeEmbedUrl, never from the stored text", /src=\{youTubeEmbedUrl\(vid\)\}/.test(card) && !/src=\{url\}/.test(card));
check("nothing on the card loads from Google before play", !/ytimg|youtube\.com\/vi/.test(code(card)));
check("the still is copied to droplr, not linked", /i\.ytimg\.com/.test(read("src/lib/bio-items-server.ts")) && /storeImage\(/.test(read("src/lib/bio-items-server.ts")));
check("the bio route hands merch and videos to the view", /merch: visibleItems\(page\.links, "merch"\)/.test(read("src/components/public/bio-route.tsx")) && /videos: visibleItems\(page\.links, "video"\)/.test(read("src/components/public/bio-route.tsx")));
check("the bio route keeps merch and videos out of the link buttons", /page\.links\.filter\(\(l\) => l\.section === null\)/.test(read("src/components/public/bio-route.tsx")));
check("the links editor is only ever handed link buttons", /initial=\{buttons\.map/.test(read("src/app/admin/bio/[id]/page.tsx")));

// ---- how merch and videos sit on the page (22 Oct) -------------------------------------------

check("merch defaults to one button with tiles inside", JSON.stringify(merchDisplayOf({ merchShow: null, merchLayout: null })) === JSON.stringify({ show: "button", layout: "tiles" }) && DEFAULT_MERCH_DISPLAY.show === "button");
check("on-the-page and carousel are read back", JSON.stringify(merchDisplayOf({ merchShow: "page", merchLayout: "carousel" })) === JSON.stringify({ show: "page", layout: "carousel" }));
check("junk falls back to the default, never to nothing", JSON.stringify(merchDisplayOf({ merchShow: "PAGE", merchLayout: "slider" })) === JSON.stringify(DEFAULT_MERCH_DISPLAY));
check("the default is stored as NULL in both columns", JSON.stringify(storedMerchDisplay(DEFAULT_MERCH_DISPLAY)) === JSON.stringify({ merchShow: null, merchLayout: null }));
for (const show of ["button", "page"] as const) for (const layout of ["tiles", "carousel"] as const) {
  check(`${show}/${layout} survives a save and a read`, JSON.stringify(merchDisplayOf(storedMerchDisplay({ show, layout }))) === JSON.stringify({ show, layout }));
}
check("a display the editor can't send is refused", !merchPayloadSchema.safeParse({ items: [], display: { show: "popup", layout: "tiles" } }).success && merchPayloadSchema.safeParse({ items: [], display: { show: "page", layout: "carousel" } }).success);
check("saving merch without a display is still fine", merchPayloadSchema.safeParse({ items: [] }).success);
check("a video can be featured", videoPayloadSchema.safeParse({ items: [{ url: `https://youtu.be/${ID}`, visible: true, highlight: true }] }).success);
const vrows = [
  { id: "a", label: "Big", url: youTubeWatchUrl(ID), iconUrl: null, isActive: true, section: "video", highlight: "on" },
  { id: "b", label: "Tile", url: youTubeWatchUrl(ID), iconUrl: null, isActive: true, section: "video", highlight: null },
  { id: "c", label: "Odd", url: youTubeWatchUrl(ID), iconUrl: null, isActive: true, section: "video", highlight: "yes" },
  { id: "d", label: "Tee", url: "https://s/1", iconUrl: own, isActive: true, section: "merch", highlight: "on" },
];
check("featured is read from the row", visibleItems(vrows, "video").map((v) => v.highlight).join() === "true,false,false");
check("only a video can be featured", visibleItems(vrows, "merch").every((m) => !m.highlight));
{
  const v = code(read("src/components/public/bio-view.tsx"));
  check("an ordinary video is a tile that opens (details), a featured one is the full card", /v\.highlight \? \(\s*<BioVideo/.test(v) && /<details className="group">[\s\S]*?<summary[\s\S]*?<BioVideo/.test(v));
  check("merch behind a button is a details that holds the items", /page\.merchDisplay\.show === "button" \? \(\s*<details/.test(v));
  check("the carousel is a scroll-snap row", /layout === "carousel"[\s\S]{0,400}snap-x snap-mandatory/.test(v));
  check("tiles are two to a row", /grid grid-cols-2/.test(v));
  check("merchDisplay is required on BioViewData", /\n\s*merchDisplay: MerchDisplay;/.test(read("src/components/public/bio-view.tsx")));
  check("the bio route resolves it through merchDisplayOf", /merchDisplay: merchDisplayOf\(page\)/.test(read("src/components/public/bio-route.tsx")));
  const r = code(read("src/app/api/admin/bio/[id]/links/route.ts"));
  check("the merch look is written to this page only, in the same transaction", /prisma\.bioPage\.update\(\{ where: \{ id: page\.id \}, data: display \}\)/.test(r));
}

// ---- the gallery ----------------------------------------------------------------------------

const yes = () => true;
const row = (p: Partial<GalleryRow> = {}): GalleryRow => ({ slug: "a", title: "A", bio: null, imageUrl: "x", accentColor: null, gallery: "on", isPublic: true, activeLinks: 2, orgSlug: "someone", ...p });
check("a ticked, public page with links is listed", galleryEligible(row(), [], yes));
check("not ticked: not listed", !galleryEligible(row({ gallery: null }), [], yes));
check("any other value is not a tick", !galleryEligible(row({ gallery: "yes" }), [], yes) && !galleryEligible(row({ gallery: "" }), [], yes));
check("private: not listed, whatever the tick says", !galleryEligible(row({ isPublic: false }), [], yes));
check("no links yet: not listed", !galleryEligible(row({ activeLinks: 0 }), [], yes));
check("droplr's own accounts are never listed", !galleryEligible(row({ orgSlug: "rhythm-revolt-records" }), ["rhythm-revolt-records"], yes));
check("…whatever the case", !galleryEligible(row({ orgSlug: "Rhythm-Revolt-Records" }), ["rhythm-revolt-records"], yes));
check("a picture hosted elsewhere keeps a page out", !galleryEligible(row({ imageUrl: "https://tracker.example/p.jpg" }), [], (u) => isOwnImage(u, site)) && galleryEligible(row({ imageUrl: `${site}/api/cover/a.webp` }), [], (u) => isOwnImage(u, site)));
check("a blurb is one short line", (galleryBlurb("a\n\nb   c") === "a b c") && (galleryBlurb("x".repeat(200))?.length ?? 0) <= 90 && galleryBlurb("  ") === null);
check("the gallery isn't indexed while it's nearly empty", GALLERY_INDEX_MIN >= 2);

const gpage = code(read("src/app/b/page.tsx"));
check("the gallery is read per request, never baked at build", /export const dynamic = "force-dynamic"/.test(gpage));
check("the gallery has an honest empty state", /Nobody has listed their page yet/.test(read("src/app/b/page.tsx")));
check("the gallery card never mentions views or taps", !/views|clicks|taps/.test(gpage.replace(/robots[^\n]*/g, "")));
const gserver = code(read("src/lib/bio-gallery-server.ts"));
check("the gallery query narrows to ticked public pages", /gallery: "on", isPublic: true/.test(gserver));
check("…and still runs every row through galleryEligible", /galleryEligible\(/.test(gserver));
check("…with droplr's own-image rule", /isOwnImage\(u, SITE_URL\)/.test(gserver));
check("the gallery is read once per request", /cache\(async function galleryPages/.test(gserver));
check("the gallery never selects counts", !/views: true|clicks: true/.test(gserver));
const patch = code(read("src/app/api/admin/bio/[id]/route.ts"));
check("re-saving a listed page doesn't restamp it", /d\.gallery && g\.page\.gallery !== "on"/.test(patch));
check("terms say the gallery is opt-in and where", /Show it in the gallery/.test(read("src/app/legal/terms/page.tsx")) && /droplr\.fm\/b/.test(read("src/app/legal/terms/page.tsx")));
check("privacy names videos on a bio page", /Videos on a bio page/.test(read("src/app/legal/privacy/page.tsx")));

// ---- 21 Oct walkthrough: findings 1-3 -------------------------------------------------------

for (const kind of ["artist", "label"] as const) {
  const steps = tourSteps(kind);
  const bio = steps.findIndex((s) => s.href === "/admin/bio");
  check(`the ${kind} tour has a bio page step`, bio >= 0);
  check(`…right after the profile`, bio === 1 && steps[0].href === "/admin/artists", `at ${bio}`);
  check(`…aimed at the bio nav item`, steps[bio]?.target === "nav-bio");
  check(`the ${kind} tour still ends on its CTA`, !!steps[steps.length - 1].cta);
}
const layout = read("src/app/admin/layout.tsx");
check("the Bio links nav item carries the tour hook", /\{ href: "\/admin\/bio", label: "Bio links", tour: "nav-bio" \}/.test(layout));
// Every tour target has to exist somewhere, or the ring floats over nothing.
const sources = ["src/app/admin/layout.tsx", "src/app/dashboard/layout.tsx", "src/components/admin/create-link-modal.tsx", "src/components/feedback/feedback-forms.tsx", "src/app/admin/artists/page.tsx", "src/app/admin/artists/[id]/page.tsx"].map(read).join("\n");
for (const kind of ["artist", "label", "artistLogin"] as const) {
  for (const s of tourSteps(kind)) {
    if (!s.target) continue;
    check(`tour target "${s.target}" exists`, sources.includes(`tour: "${s.target}"`) || sources.includes(`data-tour="${s.target}"`));
  }
}

check("a full form needs nothing", missingFields({ title: "OTOTO", slug: "ototo", imageUrl: "https://x/y.jpg" }).length === 0 && missingLine([]) === "");
check("an empty form names all three", missingLine(missingFields({ title: "", slug: "", imageUrl: "" })) === "Still needs a name, a page address and an image.", missingLine(missingFields({ title: "", slug: "", imageUrl: "" })));
check("one missing reads as one", missingLine(missingFields({ title: "A", slug: "a", imageUrl: "" })) === "Still needs an image.");
check("whitespace is not a name", missingFields({ title: "   ", slug: "a", imageUrl: "x" }).join() === "name");
const form = code(read("src/components/admin/bio-form.tsx"));
check("the Create button follows the same rule as the sentence", /disabled=\{busy \|\| missing\.length > 0\}/.test(form));
check("the sentence is shown beside it", /missingLine\(missing\)/.test(form));
check("no placeholder is the artist's own name any more", !/placeholder="OTOTO"|placeholder="ototo"/.test(form));
const fresh = code(read("src/app/admin/bio/new/page.tsx"));
check("a new page starts with the account's name", /initial=\{\{ title, slug: slugify\(title\)/.test(fresh));
check("an artist account's photo is used when there is one", /own\?\.photoUrl/.test(fresh));
check("the photo isn't handed to the client beyond id and name", /artists=\{artists\.map\(\(a\) => \(\{ id: a\.id, name: a\.name \}\)\)\}/.test(fresh));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
