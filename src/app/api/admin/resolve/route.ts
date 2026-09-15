import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { extractAccentColor } from "@/lib/color";
import { resolveWithOdesli } from "@/lib/odesli";
import { PLATFORMS } from "@/lib/platforms";
import { fetchSpotifyMetadata, getSpotifyCreds, parseSpotifyRef, spotifyUrl } from "@/lib/spotify";
import { slugify } from "@/lib/utils";

/** Paste Spotify link → Odesli → (fallback) Spotify metadata → prefill. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { url } = (await req.json()) as { url: string };
  const ref = parseSpotifyRef(url ?? "");
  if (!ref || ref.type === "artist") return NextResponse.json({ error: "Paste a Spotify album or track link / URI" }, { status: 400 });
  const canonical = spotifyUrl(ref);

  const odesli = await resolveWithOdesli(canonical);
  const creds = await getSpotifyCreds(user.organizationId).catch(() => null);
  const spotify = await fetchSpotifyMetadata(ref, creds).catch(() => null);

  const title = odesli.title ?? spotify?.title ?? "";
  const artistName = odesli.artistName ?? spotify?.artistName ?? "";
  const coverUrl = spotify?.coverUrl ?? odesli.coverUrl ?? "";
  const accentColor = coverUrl ? await extractAccentColor(coverUrl) : null;

  let links = odesli.links;
  if (!links.some((l) => l.platform === "spotify")) links = [{ platform: "spotify", url: canonical }, ...links];
  links = links.sort((a, b) => PLATFORMS[a.platform].weight - PLATFORMS[b.platform].weight);

  return NextResponse.json({
    found: odesli.found,
    odesliStatus: odesli.status,
    title,
    artistName,
    coverUrl,
    accentColor,
    spotifyUrl: canonical,
    spotifyAlbumId: ref.type === "album" ? ref.id : spotify?.albumId ?? null,
    spotifyTrackId: ref.type === "track" ? ref.id : null,
    spotifyArtistId: spotify?.artistId ?? null,
    suggestedSlug: slugify(`${artistName} ${title}`.trim()) || slugify(title),
    links,
  });
}
