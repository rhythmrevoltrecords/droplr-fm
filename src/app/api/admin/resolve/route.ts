import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { extractAccentColor } from "@/lib/color";
import { normaliseIsrc, normaliseUpc, resolveFromSpotifyUri, resolveStores } from "@/lib/odesli";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { getSpotifyCreds, parseSpotifyRef, spotifyUrl } from "@/lib/spotify";
import { slugify } from "@/lib/utils";

/**
 * Create-release prefill, no Odesli:
 *  1. Spotify link → title / artist / artwork (+ UPC/ISRC if Spotify returns external_ids)
 *  2. UPC → iTunes Lookup + Deezer album;  ISRC → iTunes + Deezer track (fills gaps)
 * DJ stores (Beatport, Traxsource, Bandcamp, Juno) are always added by hand.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; upc?: string; isrc?: string };

  const ref = body.url ? parseSpotifyRef(body.url) : null;
  if (body.url && (!ref || ref.type === "artist")) return NextResponse.json({ error: "That isn't a Spotify album or track link / URI" }, { status: 400 });
  let upc = normaliseUpc(body.upc);
  let isrc = normaliseIsrc(body.isrc);
  if (body.upc && !upc) return NextResponse.json({ error: "UPC should be 12–14 digits" }, { status: 400 });
  if (body.isrc && !isrc) return NextResponse.json({ error: "ISRC looks like AUXXX2600001 (12 characters)" }, { status: 400 });
  if (!ref && !upc && !isrc) return NextResponse.json({ error: "Paste a Spotify link, or enter a UPC or ISRC" }, { status: 400 });

  const notes: string[] = [];
  const creds = await getSpotifyCreds(user.organizationId).catch(() => null);
  const spotify = ref ? await resolveFromSpotifyUri(ref, creds) : null;
  if (ref && !spotify) notes.push("Spotify didn't return details (common for unreleased music). Fill them in below.");
  if (ref && spotify && !creds) notes.push("Spotify gave only the title and artwork. Connect your Spotify app in Integrations to also get the artist and UPC automatically.");
  upc ??= normaliseUpc(spotify?.upc);
  isrc ??= normaliseIsrc(spotify?.isrc);

  const stores = upc || isrc ? await resolveStores({ upc, isrc }) : null;
  const links: { platform: PlatformKey; url: string }[] = [];
  if (ref) links.push({ platform: "spotify", url: spotifyUrl(ref) });
  if (stores?.appleMusic) links.push({ platform: "appleMusic", url: stores.appleMusic });
  if (stores?.deezer) links.push({ platform: "deezer", url: stores.deezer });
  links.sort((a, b) => PLATFORMS[a.platform].weight - PLATFORMS[b.platform].weight);

  const title = spotify?.title ?? stores?.title ?? "";
  const artistName = spotify?.artist ?? stores?.artist ?? "";
  const coverUrl = stores?.artwork && !spotify?.artwork ? stores.artwork : spotify?.artwork ?? stores?.artwork ?? "";
  // Colour is extracted once here and saved with the release — pages only read it.
  const accentColor = coverUrl ? await extractAccentColor(coverUrl) : null;

  return NextResponse.json({
    appleFound: !!stores?.appleMusic,
    deezerFound: !!stores?.deezer,
    via: stores?.via ?? {},
    notes,
    title,
    artistName,
    coverUrl,
    accentColor,
    upc,
    isrc,
    spotifyUrl: ref ? spotifyUrl(ref) : null,
    spotifyAlbumId: ref?.type === "album" ? ref.id : spotify?.albumId ?? null,
    spotifyTrackId: ref?.type === "track" ? ref.id : null,
    spotifyArtistId: spotify?.artistId ?? null,
    suggestedSlug: slugify(`${artistName} ${title}`.trim()) || slugify(title),
    links,
  });
}
