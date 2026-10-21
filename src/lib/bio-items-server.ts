import "server-only";
import { storeImage } from "./blobs";
import { processUpload } from "./images";
import { youTubeWatchUrl } from "./bio-items";

/**
 * Looking a YouTube video up once, when the artist adds it, so the fan's browser never has to.
 *
 * The title comes from YouTube's oEmbed endpoint and the still is copied onto droplr's own image
 * store. A fan opening the page therefore makes no request to Google at all until they press play
 * -- not even for the picture. That is the same promise the self-hosted fonts already keep, and it
 * is what makes the click-to-play honest: a facade that fetches its thumbnail from i.ytimg.com has
 * already told Google the fan was here.
 *
 * Both URLs are BUILT from an 11-character id that lib/bio-items has already validated. Nothing
 * the artist typed reaches fetch(), so there is no user-supplied host to resolve and no SSRF path.
 */

export type VideoLookup =
  | { ok: true; title: string; thumbnailUrl: string | null }
  | { ok: false; error: string };

// Short on purpose. The save waits on these, all videos in parallel, inside a Netlify function
// with a hard time limit: a slow answer is turned into "I can't tell" well before that limit hits.
const LOOKUP_MS = 5000;
const STILL_MS = 3000;

async function get(url: string, ms: number): Promise<Response | null> {
  try {
    return await fetch(url, { redirect: "error", signal: AbortSignal.timeout(ms), cache: "no-store" });
  } catch {
    return null;
  }
}

/**
 * oEmbed's status codes are the answer to "can this be shown on someone else's page":
 * 401 = the owner switched embedding off, 400/404 = private, deleted or never existed.
 * Anything else (timeout, 5xx) is "I can't tell", and that is said rather than guessed at.
 */
export async function lookUpVideo(id: string): Promise<VideoLookup> {
  const res = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youTubeWatchUrl(id))}`, LOOKUP_MS);
  if (!res) return { ok: false, error: "YouTube didn't answer, so I can't tell if that video can be shown. Try again in a minute." };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "The owner of that video has turned off playing it on other sites, so it can't go on your page." };
  if (res.status === 400 || res.status === 404) return { ok: false, error: "YouTube can't find that video. It may be private or deleted." };
  if (!res.ok) return { ok: false, error: "YouTube didn't answer, so I can't tell if that video can be shown. Try again in a minute." };

  const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
  return { ok: true, title: title || "Video", thumbnailUrl: await copyThumbnail(id) };
}

/**
 * The still, re-encoded and stored by droplr. maxresdefault is 16:9 but missing on some uploads;
 * mqdefault is always there and also 16:9 (hqdefault is 4:3 with black bars baked in).
 *
 * Null when it can't be copied. The card then shows a plain panel with a play button: a missing
 * picture is a cosmetic loss, falling back to Google's servers would be a privacy one.
 */
export async function copyThumbnail(id: string): Promise<string | null> {
  // Both asked for at once, the better one kept: one round trip of waiting, not two.
  const [maxres, mq] = await Promise.all(["maxresdefault", "mqdefault"].map((n) => get(`https://i.ytimg.com/vi/${id}/${n}.jpg`, STILL_MS)));
  for (const res of [maxres, mq]) {
    if (!res?.ok) continue;
    try {
      const img = await processUpload(Buffer.from(await res.arrayBuffer()), "video");
      // YouTube serves a 120x90 grey placeholder with a 200 for a missing maxres on some ids.
      if (img.width < 300) continue;
      return await storeImage(img.buffer, img.type, img.ext);
    } catch (e) {
      console.warn("[bio-video] thumbnail", id, (e as Error)?.message);
      return null;
    }
  }
  return null;
}
