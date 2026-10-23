import { zonedDay } from "./time";

/**
 * Structured data (schema.org JSON-LD) for droplr's public pages.
 *
 * A hidden label on the page that says what the page IS: a song by this artist, out on this day;
 * a musician's page; an article. Google uses it for richer results and AI search engines use it to
 * read a page without guessing. Every value here comes from a record droplr already holds, so it
 * is generated, never typed in, and moves when the record moves.
 *
 * Two rules every builder holds:
 *
 * 1. NOTHING THE PAGE DOESN'T ALREADY SHOW. The labels are public the moment they render, so a
 *    store link the page hides, or a social link the artist switched off, must not reach them.
 *    Callers pass the same filtered lists the page itself renders.
 * 2. THE SCRIPT TAG IS A TRUST BOUNDARY. Titles, artist names and bios are typed by users and land
 *    inside <script>. `jsonLdHtml` escapes `<`, `>`, `&` and the two JavaScript line separators,
 *    so a title like `</script><script>…` stays a string. Never render JSON-LD any other way.
 *
 * Pure: no prisma, no env, safe to import anywhere.
 */

type Json = Record<string, unknown>;

/** The only way JSON-LD reaches HTML. See rule 2. */
export function jsonLdHtml(data: Json | Json[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const https = (u: string | null | undefined): u is string => !!u && /^https:\/\//i.test(u);

/** Drop empty values so a missing ISRC is absent, not `"isrcCode": null`. */
function compact<T extends Json>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;
}

export type ReleaseForLd = {
  kind: string | null;
  title: string;
  artistName: string;
  coverUrl: string;
  releaseDate: Date;
  isrc: string | null;
  spotifyTrackId: string | null;
  spotifyAlbumId: string | null;
};

/**
 * A release page. One recording unless droplr only knows an album id, because that is what
 * almost every droplr release is: a single, with an ISRC. A download gate is still a recording,
 * just without a release day or store copies to point at.
 *
 * `storeUrls` are the links the page shows, already filtered, and empty while it is still a
 * countdown. No ISRC: no public page prints it, so rule 1 keeps it out. `labelName` only for a label
 * account: an artist's own account is not a record label.
 */
export function releaseJsonLd(r: ReleaseForLd, o: { url: string; timezone: string | null; storeUrls: string[]; labelName: string | null }): Json {
  const download = r.kind === "download";
  const album = !download && !r.isrc && !r.spotifyTrackId && !!r.spotifyAlbumId;
  return compact({
    "@context": "https://schema.org",
    "@type": album ? "MusicAlbum" : "MusicRecording",
    name: r.title,
    url: o.url,
    image: https(r.coverUrl) ? r.coverUrl : undefined,
    byArtist: { "@type": "MusicGroup", name: r.artistName },
    datePublished: download ? undefined : zonedDay(r.releaseDate, o.timezone),
    recordLabel: o.labelName ? { "@type": "Organization", name: o.labelName } : undefined,
    sameAs: download ? undefined : [...new Set(o.storeUrls.filter(https))],
  });
}

/**
 * A bio page: a profile page about a musician, or about a label when the page is the label's own.
 * `socialUrls` only when the page shows its icon row. An artist who switched the row off chose not
 * to publish those links from this page.
 */
export function bioJsonLd(p: { title: string; bio: string | null; imageUrl: string }, o: { url: string; isLabel: boolean; socialUrls: string[] }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: o.url,
    mainEntity: compact({
      "@type": o.isLabel ? "Organization" : "MusicGroup",
      name: p.title,
      description: p.bio ?? undefined,
      image: https(p.imageUrl) ? p.imageUrl : undefined,
      url: o.url,
      sameAs: [...new Set(o.socialUrls.filter(https))],
    }),
  };
}

/** droplr.fm itself, on the homepage. */
export function siteJsonLd(siteUrl: string): Json[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "droplr.fm",
      url: siteUrl,
      logo: `${siteUrl}/icon.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "droplr.fm",
      url: siteUrl,
    },
  ];
}

/**
 * A blog post or a guide. The author is droplr.fm, not a person: the posts carry no byline, and
 * rule 1 says the label can't name someone the page doesn't.
 */
export function articleJsonLd(a: { title: string; summary: string; url: string; published: string | null; image: string | null; siteUrl: string }): Json {
  return compact({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.summary,
    url: a.url,
    mainEntityOfPage: a.url,
    datePublished: a.published ?? undefined,
    image: https(a.image) ? a.image : undefined,
    author: { "@type": "Organization", name: "droplr.fm", url: a.siteUrl },
    publisher: { "@type": "Organization", name: "droplr.fm", url: a.siteUrl, logo: { "@type": "ImageObject", url: `${a.siteUrl}/icon.png` } },
  });
}

/** A free tool page. */
export function toolJsonLd(t: { name: string; description: string; url: string }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: t.name,
    description: t.description,
    url: t.url,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
  };
}
