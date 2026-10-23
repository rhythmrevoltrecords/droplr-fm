/**
 * "Play it inside this playlist": the Spotify button opens the track inside a playlist the artist
 * chose, so when the song ends Spotify carries on through that playlist (usually the artist's or
 * label's own) instead of stopping or drifting into radio.
 *
 * The whole feature is one URL: https://open.spotify.com/track/{track}?context=spotify:playlist:{id}.
 * It is the same link Feature.fm and the "auto-play" generators make. What it does NOT do is force
 * playback to start: whether the song begins on its own is up to Spotify and the listener's device,
 * and Spotify has no switch for that. droplr never claims otherwise.
 *
 * It needs the Spotify button itself to be a track link. An album link is left alone: turning an
 * EP's album button into one song would change what the artist chose to link to, so the settings
 * say "make the Spotify link the track's link" rather than doing it behind their back.
 *
 * Pure: no prisma, no env.
 */

const ID = /^[A-Za-z0-9]{22}$/;

/** A playlist ID from a share link (with or without ?si= or /intl-xx/), a spotify:playlist: URI, or the bare ID. */
export function parsePlaylistId(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (ID.test(s)) return s;
  const m =
    s.match(/^spotify:playlist:([A-Za-z0-9]{22})$/) ??
    s.match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return m ? m[1] : null;
}

/** The track ID in an open.spotify.com track link, or null for anything else (albums included). */
export function trackIdFromUrl(url: string | null | undefined): string | null {
  const m = (url ?? "").trim().match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return m ? m[1] : null;
}

export type ContextState = "off" | "on" | "no-button" | "needs-track";

/** Whether the playlist will actually be used, for the settings screen. */
export function contextState(o: { playlistId: string | null; linkUrl: string | null }): ContextState {
  if (!o.playlistId) return "off";
  if (!o.linkUrl) return "no-button";
  return trackIdFromUrl(o.linkUrl) ? "on" : "needs-track";
}

/** Where the Spotify button sends a fan. Unchanged unless a playlist is set and the button is a track link. */
export function spotifyListenUrl(o: { linkUrl: string; playlistId: string | null }): string {
  const playlist = o.playlistId && ID.test(o.playlistId) ? o.playlistId : null;
  const track = trackIdFromUrl(o.linkUrl);
  if (!playlist || !track) return o.linkUrl;
  return `https://open.spotify.com/track/${track}?context=spotify:playlist:${playlist}`;
}
