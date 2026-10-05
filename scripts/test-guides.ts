/**
 * Pure checks for the in-app guide videos. No database, no server, no network.
 *
 * The whole point of this suite is the clock. A guide shown one minute early renders YouTube's
 * "Video unavailable" box inside the dashboard, which looks like a broken product rather than an
 * unreleased video — so every assertion here uses a fixed fake clock and never `new Date()`.
 */
import { GUIDES, guideEmbed, guideThumb, guideWatchUrl, liveGuide, liveGuides, type Guide } from "../src/lib/guides";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const MINUTE = 60_000;
const at = (g: Guide) => Date.parse(g.publishAt);

// ---- config sanity -------------------------------------------------------

check("every guide key is unique", new Set(GUIDES.map((g) => g.key)).size === GUIDES.length);
check("every publishAt parses", GUIDES.every((g) => Number.isFinite(at(g))));
check("every guide has a title and a blurb", GUIDES.every((g) => g.title.trim() && g.blurb.trim()));
check(
  "a runtime, where given, looks like m:ss",
  GUIDES.every((g) => g.runtime === undefined || /^\d{1,2}:\d{2}$/.test(g.runtime)),
  GUIDES.filter((g) => g.runtime !== undefined && !/^\d{1,2}:\d{2}$/.test(g.runtime)).map((g) => g.key).join(", "),
);
check(
  "every ID is 11 characters of the YouTube alphabet",
  GUIDES.every((g) => /^[A-Za-z0-9_-]{11}$/.test(g.youTubeId)),
  GUIDES.filter((g) => !/^[A-Za-z0-9_-]{11}$/.test(g.youTubeId)).map((g) => g.key).join(", "),
);
check("guides are listed in the order they go out", GUIDES.every((g, i) => i === 0 || at(GUIDES[i - 1]) <= at(g)));

// Brisbane is UTC+10 all year. If someone "helpfully" writes +11 for daylight saving, the video
// appears an hour early — which is exactly the failure this file exists to prevent.
check("every publishAt is written in Brisbane time (+10:00)", GUIDES.every((g) => g.publishAt.endsWith("+10:00")));
check(
  "every publishAt is 9am Brisbane",
  GUIDES.every((g) => g.publishAt.includes("T09:00:00")),
  GUIDES.filter((g) => !g.publishAt.includes("T09:00:00")).map((g) => g.key).join(", "),
);

// ---- the clock -----------------------------------------------------------

for (const g of GUIDES) {
  const before = new Date(at(g) - MINUTE);
  const after = new Date(at(g) + MINUTE);
  check(`${g.key}: hidden one minute before its moment`, liveGuide(g.key, before) === null);
  check(`${g.key}: shown one minute after`, liveGuide(g.key, after)?.key === g.key);
  check(`${g.key}: shown exactly on the boundary`, liveGuide(g.key, new Date(at(g)))?.key === g.key);
}

check("nothing is live the day before the first one", liveGuides(new Date(at(GUIDES[0]) - 86_400_000)).length === 0);
check("everything is live a year after the last one", liveGuides(new Date(at(GUIDES[GUIDES.length - 1]) + 365 * 86_400_000)).length === GUIDES.length);

// Each release adds exactly one card, never two, and never resets the count.
for (let i = 0; i < GUIDES.length; i++) {
  const justAfter = new Date(at(GUIDES[i]) + MINUTE);
  check(`${GUIDES[i].key}: exactly ${i + 1} guide(s) live just after it lands`, liveGuides(justAfter).length === i + 1, String(liveGuides(justAfter).length));
}

check("liveGuides returns them in config order", (() => {
  const all = liveGuides(new Date(at(GUIDES[GUIDES.length - 1]) + MINUTE));
  return all.map((g) => g.key).join(",") === GUIDES.map((g) => g.key).join(",");
})());

// ---- an unusable ID is never shown, however late it is -------------------

{
  // A guide whose video was pulled: the ID is blanked rather than the row deleted, so the config
  // keeps its history and the card simply stops existing.
  const saved = GUIDES[0].youTubeId;
  const longPast = new Date(at(GUIDES[0]) + 86_400_000);
  GUIDES[0].youTubeId = "";
  check("an empty ID is hidden even long after publishAt", liveGuide(GUIDES[0].key, longPast) === null);
  check("an empty ID is left out of liveGuides", !liveGuides(longPast).some((g) => g.key === GUIDES[0].key));
  GUIDES[0].youTubeId = "   ";
  check("a whitespace ID is hidden too", liveGuide(GUIDES[0].key, longPast) === null);
  GUIDES[0].youTubeId = "short";
  check("a malformed ID is hidden rather than rendered", liveGuide(GUIDES[0].key, longPast) === null);
  GUIDES[0].youTubeId = saved;
  check("the config is restored after the mutation checks", liveGuide(GUIDES[0].key, longPast)?.key === GUIDES[0].key);
}

// ---- URLs ----------------------------------------------------------------

const g0 = GUIDES[0];
check("the player is the no-cookie host", guideEmbed(g0).startsWith("https://www.youtube-nocookie.com/embed/"));
check("the player autoplays, since it only loads on a click", guideEmbed(g0).includes("autoplay=1"));
check("the player asks for subtitles", guideEmbed(g0).includes("cc_load_policy=1"));
check("the player suppresses related videos", guideEmbed(g0).includes("rel=0"));
check("the thumbnail comes from the image CDN, not the player", guideThumb(g0).startsWith("https://i.ytimg.com/vi/"));
check("no embed URL points at youtube.com itself", GUIDES.every((g) => !guideEmbed(g).startsWith("https://www.youtube.com")));
check("the escape hatch is a plain youtu.be link", guideWatchUrl(g0) === `https://youtu.be/${g0.youTubeId}`);
check("every URL carries the guide's own ID", GUIDES.every((g) => guideEmbed(g).includes(g.youTubeId) && guideThumb(g).includes(g.youTubeId)));

// ---- the surfaces each guide is placed on actually exist ----------------

for (const key of ["walkthrough", "checklist", "superfans", "bio-link", "tracking", "after-release"] as const) {
  check(`${key} is in the config`, GUIDES.some((g) => g.key === key));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
