/**
 * YouTube ids and the two addresses built from them. Its own file, with no imports, because the
 * public video card is a client component on every bio page and pulling zod in with it (via
 * lib/bio-items) would ship a validation library to every fan to parse one string.
 */

/**
 * A YouTube video id out of anything an artist is likely to paste, or null.
 *
 * Returns only the id, never the URL: the embed address is BUILT from the id, so nothing the
 * artist typed is ever interpolated into an iframe src. Ids are 11 characters of [A-Za-z0-9_-];
 * refusing anything else is what keeps a crafted path out of the player URL.
 */
export function youTubeId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  let id: string | null | undefined;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** The address a video row stores and "Watch on YouTube" goes to. Rebuilt, never the pasted text. */
export const youTubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/**
 * The player, loaded only after the fan presses play.
 *
 * youtube-nocookie is Google's reduced-tracking address, which the privacy page already names.
 * autoplay=1 because the press IS the request to play; without it the fan presses twice.
 */
export const youTubeEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
