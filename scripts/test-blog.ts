/**
 * Pure checks for the news posts. No database, no server, no network.
 *
 * Same reason as test-guides.ts: the clock. A post shown before its video is public renders
 * YouTube's "Video unavailable" box on a page whose whole argument is that droplr tells you the
 * truth, so every assertion here uses a fixed fake clock and never `new Date()`.
 *
 * The second thing it guards is quieter. The articles are the point — the embed earns nothing in
 * search — so a post that somehow ships with a thin body is the failure nobody would notice.
 */
import { POSTS, findPost, livePosts, postDate, postEmbed, postThumb, postWatchUrl, type Post } from "../src/lib/blog";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const MINUTE = 60_000;
const at = (p: Post) => Date.parse(p.publishAt);
const words = (p: Post) =>
  p.body.reduce((n, b) => {
    if ("p" in b) return n + b.p.split(/\s+/).length;
    if ("h" in b) return n + b.h.split(/\s+/).length;
    if ("ul" in b) return n + b.ul.join(" ").split(/\s+/).length;
    if ("ol" in b) return n + b.ol.join(" ").split(/\s+/).length;
    if ("note" in b) return n + b.note.split(/\s+/).length;
    return n;
  }, 0);

// ---- config sanity -------------------------------------------------------

check("every slug is unique", new Set(POSTS.map((p) => p.slug)).size === POSTS.length);
check("every slug is url-safe", POSTS.every((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)),
  POSTS.filter((p) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)).map((p) => p.slug).join(", "));
check("every publishAt parses", POSTS.every((p) => Number.isFinite(at(p))));
check("every post has a title and a summary", POSTS.every((p) => p.title.trim() && p.summary.trim()));
check("every runtime looks like m:ss", POSTS.every((p) => /^\d{1,2}:\d{2}$/.test(p.runtime)));

// Brisbane is UTC+10 all year. A "helpful" +11 for daylight saving publishes an hour early.
check("every publishAt is written in Brisbane time (+10:00)", POSTS.every((p) => p.publishAt.endsWith("+10:00")));

// The id goes straight into an iframe src. It is author-written, not user input, but the check
// costs nothing and a typo here is a broken player on a public page.
check("every ID is 11 characters of the YouTube alphabet",
  POSTS.every((p) => /^[A-Za-z0-9_-]{11}$/.test(p.youTubeId)),
  POSTS.filter((p) => !/^[A-Za-z0-9_-]{11}$/.test(p.youTubeId)).map((p) => p.slug).join(", "));
check("no two posts point at the same video", new Set(POSTS.map((p) => p.youTubeId)).size === POSTS.length);

// ---- the article is the page --------------------------------------------

check("every post is a real article, not a caption", POSTS.every((p) => words(p) >= 400),
  POSTS.filter((p) => words(p) < 400).map((p) => `${p.slug}: ${words(p)} words`).join(", "));
check("every post has at least one heading", POSTS.every((p) => p.body.some((b) => "h" in b)));
check("every post cites its sources", POSTS.every((p) => p.sources.length > 0),
  POSTS.filter((p) => p.sources.length === 0).map((p) => p.slug).join(", "));
check("every source is an https link", POSTS.every((p) => p.sources.every((x) => x.url.startsWith("https://") && x.label.trim())));

// ---- the clock -----------------------------------------------------------

const first = [...POSTS].sort((a, b) => at(a) - at(b))[0];

check("nothing is live before the first post's moment", livePosts(new Date(at(first) - MINUTE)).length === 0);
check("the first post is live at its moment", livePosts(new Date(at(first))).some((p) => p.slug === first.slug));
check("a post is not reachable by slug a minute early", findPost(first.slug, new Date(at(first) - MINUTE)) === null);
check("a post is reachable by slug a minute after", findPost(first.slug, new Date(at(first) + MINUTE))?.slug === first.slug);
check("an unknown slug is null", findPost("not-a-post", new Date(at(first) + MINUTE)) === null);
check("everything is live well after the last post", livePosts(new Date(Date.parse("2030-01-01T00:00:00+10:00"))).length === POSTS.length);
check("live posts come back newest first", (() => {
  const live = livePosts(new Date(Date.parse("2030-01-01T00:00:00+10:00")));
  return live.every((p, i) => i === 0 || at(live[i - 1]) >= at(p));
})());

// The homepage strip and the index both render whatever livePosts gives them, so "silent on
// ordinary input" here means: before anything is published, they are handed nothing at all.
check("the section is empty rather than noisy before launch", livePosts(new Date(Date.parse("2020-01-01T00:00:00+10:00"))).length === 0);

// ---- URLs ----------------------------------------------------------------

const p0 = POSTS[0];
check("the player is the reduced-tracking host", postEmbed(p0).startsWith("https://www.youtube-nocookie.com/embed/"));
check("no embed URL points at youtube.com itself", POSTS.every((p) => !postEmbed(p).startsWith("https://www.youtube.com")));
check("the player asks for subtitles", postEmbed(p0).includes("cc_load_policy=1"));
check("the player suppresses related videos", postEmbed(p0).includes("rel=0"));
check("the still comes from the image CDN, not the player", postThumb(p0).startsWith("https://i.ytimg.com/vi/"));
check("the escape hatch is a plain youtu.be link", postWatchUrl(p0) === `https://youtu.be/${p0.youTubeId}`);
check("every URL carries the post's own ID", POSTS.every((p) => postEmbed(p).includes(p.youTubeId) && postThumb(p).includes(p.youTubeId)));

// ---- the printed date matches the schedule ------------------------------

// 8 October 2026 09:00 Brisbane is still 7 October in UTC. Formatting in the wrong zone prints
// the day before the video goes out, on the page that says when it went out.
check("the date prints in Brisbane, not UTC", postDate({ ...p0, publishAt: "2026-10-08T09:00:00+10:00" }) === "8 October 2026");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
