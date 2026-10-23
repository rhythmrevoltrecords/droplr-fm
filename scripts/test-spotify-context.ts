/**
 * "Play it inside a playlist" on the Spotify button, and slugs made from pasted links.
 *
 * What this defends:
 *  - the button only changes when a playlist is set AND the button is a track link; an album button
 *    is never turned into one song, and the settings say why instead of claiming it's on;
 *  - any playlist link a person is likely to paste is understood, and anything else is refused
 *    with a sentence, not stored;
 *  - only the Spotify button is affected, never another store's;
 *  - a pasted URL in a slug or title box becomes the track's name, not "https-soundcloud-com-…",
 *    while ordinary names slug exactly as before (so no existing address could change).
 *
 * Pure functions and source checks:
 *   npx tsx scripts/test-spotify-context.ts
 */
import { readFileSync } from "node:fs";
import { contextState, parsePlaylistId, spotifyListenUrl, trackIdFromUrl } from "../src/lib/spotify-context";
import { slugify } from "../src/lib/utils";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const P = "37i9dQZF1DXcBWIGoYBM5M";
const T = "4uLU6hMCjMI75M1A2tKUQC";
const A = "1DFixLWuPkv3KT3TnV35m3";

console.log("1. Playlist links");
check("a share link with ?si=", parsePlaylistId(`https://open.spotify.com/playlist/${P}?si=abc123`) === P);
check("an intl link", parsePlaylistId(`https://open.spotify.com/intl-de/playlist/${P}`) === P);
check("a spotify: URI", parsePlaylistId(`spotify:playlist:${P}`) === P);
check("the bare ID, with spaces around it", parsePlaylistId(`  ${P} `) === P);
check("an album or track link is not a playlist", parsePlaylistId(`https://open.spotify.com/album/${A}`) === null && parsePlaylistId(`https://open.spotify.com/track/${T}`) === null);
check("another site with the same path is not Spotify", parsePlaylistId(`https://evil.example/playlist/${P}`) === null && parsePlaylistId(`https://open.spotify.com.evil.example/playlist/${P}`) === null && parsePlaylistId(`https://evil.example/open.spotify.com/playlist/${P}`) === null && trackIdFromUrl(`https://evil.example/?x=https://open.spotify.com/track/${T}`) === null);
check("empty is empty", parsePlaylistId("") === null && parsePlaylistId(null) === null);

console.log("2. Where the button goes");
check("a track link is read", trackIdFromUrl(`https://open.spotify.com/track/${T}?si=x`) === T && trackIdFromUrl(`https://open.spotify.com/album/${A}`) === null);
const url = spotifyListenUrl({ linkUrl: `https://open.spotify.com/track/${T}?si=x`, playlistId: P });
check("track + playlist → the track inside the playlist", url === `https://open.spotify.com/track/${T}?context=spotify:playlist:${P}`, url);
const album = `https://open.spotify.com/album/${A}?si=y`;
check("an album button is never turned into one song", spotifyListenUrl({ linkUrl: album, playlistId: P }) === album);
check("no playlist, no change (the silent case)", spotifyListenUrl({ linkUrl: `https://open.spotify.com/track/${T}?si=x`, playlistId: null }) === `https://open.spotify.com/track/${T}?si=x`);
check("a corrupt stored ID changes nothing", spotifyListenUrl({ linkUrl: `https://open.spotify.com/track/${T}`, playlistId: "../../x" }) === `https://open.spotify.com/track/${T}`);

console.log("3. What the settings say");
check("on with a track link", contextState({ playlistId: P, linkUrl: `https://open.spotify.com/track/${T}` }) === "on");
check("an album link says it needs the track's link", contextState({ playlistId: P, linkUrl: album }) === "needs-track");
check("no Spotify button says so, instead of 'on'", contextState({ playlistId: P, linkUrl: null }) === "no-button");
check("off without a playlist", contextState({ playlistId: null, linkUrl: album }) === "off");

console.log("4. Wiring");
const redirect = src("src/app/api/r/[releaseId]/[platform]/route.ts");
check("only the Spotify button is rewritten", /if \(link\.platform === "spotify"\) return finish\(spotifyListenUrl\(\{ linkUrl: link\.url, playlistId: release\.spotifyPlaylist \}\)\);\s*return finish\(link\.url\);/.test(redirect));
check("the pre-save flow is untouched", redirect.indexOf("spotifyListenUrl(") > redirect.indexOf("// 4) Smart link redirect"));
const patch = src("src/app/api/admin/releases/[id]/route.ts");
check("the setting stores an ID, never what was typed", /data\.spotifyPlaylist = id;/.test(patch) && /const id = raw \? parsePlaylistId\(raw\) : null;/.test(patch));
check("something that isn't a playlist is refused with a sentence", /if \(raw && !id\) return NextResponse\.json\(\{ error: "That isn't a Spotify playlist link\./.test(patch));
check("the PATCH stays scoped to the caller's own release", /const g = await labelRelease\(params\.id\)/.test(patch));
const form = src("src/components/admin/release-settings-form.tsx");
check("the settings say when it can't work, and why", form.includes("Not working yet: the Spotify button links to the album") && form.includes("Not working yet: this release has no Spotify button"));
check("the settings never promise autoplay", form.includes("Whether it starts playing by itself is up to Spotify") && !/auto-?plays?\b(?! by)/i.test(form.replace("starts playing by itself", "")));
check("a download gate doesn't get the option", /spotifyLinkUrl !== "gate" &&/.test(form) && /release\.kind === "download" \? "gate"/.test(src("src/app/admin/releases/[id]/page.tsx")));
const sql = src("prisma/migrations/20261108000000_spotify_playlist_context/migration.sql");
check("the migration is idempotent", /ADD COLUMN IF NOT EXISTS "spotifyPlaylist" TEXT/.test(sql));
check("the column is in the schema", /spotifyPlaylist String\?/.test(src("prisma/schema.prisma")));

console.log("5. Slugs from pasted links");
check("a pasted SoundCloud link becomes the track name", slugify("https://soundcloud.com/nathanhillmusic/nathan-hill-hard-drive") === "nathan-hill-hard-drive");
check("…with a query string and trailing slash", slugify("https://soundcloud.com/a/my-track/?si=123&utm_source=x") === "my-track");
check("a www. link without https", slugify("www.example.com/releases/Big-Tune") === "big-tune");
check("a bare domain becomes its name", slugify("https://www.mylabel.com") === "mylabel");
check("ordinary names slug exactly as before", slugify("Ototo — Again (VIP)") === "ototo-again-vip" && slugify("Https Is A Song Title") === "https-is-a-song-title" && slugify("  Café del Mar ") === "cafe-del-mar");
check("an existing ugly slug typed back in is kept, not changed", slugify("https-soundcloud-com-nathanhillmusic-nathan-hill-hard-drive") === "https-soundcloud-com-nathanhillmusic-nathan-hill-hard-drive");
check("a broken link doesn't throw", typeof slugify("https://%E0%A4%A") === "string");
check("still capped at 60", slugify(`https://x.com/${"a".repeat(100)}`).length === 60);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
