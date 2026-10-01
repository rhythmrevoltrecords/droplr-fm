import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { readCover } from "./blobs";
import { fetchPublicImage } from "./color";
import { SITE_URL } from "./env";
import { formatInTz, zonedDay } from "./time";

/**
 * Instagram-ready release graphics (story 9:16, post 4:5): countdown, out now, pre-save milestone.
 * Rendered with next/og. Covers are converted to JPEG first (WebP isn't supported by the renderer).
 */
export const SHARE_FORMATS = { story: { width: 1080, height: 1920 }, post: { width: 1080, height: 1350 } } as const;
export type ShareFormat = keyof typeof SHARE_FORMATS;
export type ShareKind = "countdown" | "out" | "milestone" | "lyric";
export const MILESTONES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

/**
 * Fonts and covers are cached for the life of the process, because one page of this tab asks for
 * up to eight images at once and every one of them used to re-read both fonts off disk and
 * re-fetch + re-encode the same artwork. Eight identical 1000x1000 sharp passes is where the
 * "graphics take a long time to show up" went.
 */
const fontCache = new Map<string, Promise<Buffer | null>>();

function font(file: string) {
  let hit = fontCache.get(file);
  if (!hit) {
    hit = readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file)).catch(() => null);
    fontCache.set(file, hit);
  }
  return hit;
}

// Keyed by cover URL. Small on purpose: this exists to serve one page of one release, not to be
// a cache layer. A changed cover is a changed URL, so a stale entry is not reachable.
const coverCache = new Map<string, Promise<string | null>>();
const COVER_CACHE_MAX = 8;

function coverDataUri(coverUrl: string) {
  let hit = coverCache.get(coverUrl);
  if (!hit) {
    hit = renderCoverDataUri(coverUrl);
    coverCache.set(coverUrl, hit);
    // Don't let a long-lived container accumulate base64 artwork for every release it ever served.
    if (coverCache.size > COVER_CACHE_MAX) coverCache.delete(coverCache.keys().next().value!);
    // A failed fetch must not be remembered, or one blip breaks the tab until the next cold start.
    void hit.then((v) => { if (v === null) coverCache.delete(coverUrl); });
  }
  return hit;
}

/**
 * The organisation's own logo, for the top line. `fit: "inside"` rather than the cover's "cover":
 * a logo is usually wider than it is tall, and cropping an artist's own mark to a square is worse
 * than leaving it off. PNG, not JPEG, so a transparent background stays transparent on the dark
 * frame instead of arriving as a white box.
 */
const logoCache = new Map<string, Promise<string | null>>();

function logoDataUri(logoUrl: string) {
  let hit = logoCache.get(logoUrl);
  if (!hit) {
    hit = (async () => {
      try {
        const buf = await fetchPublicImage(logoUrl);
        if (!buf) return null;
        const png = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize(320, 160, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
        return `data:image/png;base64,${png.toString("base64")}`;
      } catch {
        return null;
      }
    })();
    logoCache.set(logoUrl, hit);
    if (logoCache.size > COVER_CACHE_MAX) logoCache.delete(logoCache.keys().next().value!);
    void hit.then((v) => { if (v === null) logoCache.delete(logoUrl); });
  }
  return hit;
}

async function renderCoverDataUri(coverUrl: string) {
  try {
    const own = coverUrl.startsWith(`${SITE_URL}/api/cover/`) ? coverUrl.slice(`${SITE_URL}/api/cover/`.length) : null;
    let buf: Buffer | null = null;
    if (own && /^[\w.-]+$/.test(own)) {
      const blob = await readCover(own).catch(() => null);
      if (blob) buf = Buffer.from(blob.data);
    }
    buf ??= await fetchPublicImage(coverUrl);
    if (!buf) return null;
    const jpg = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize(1000, 1000, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return null;
  }
}

function rgba(hex: string, a: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0x8b5cf6;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * A short key over everything that changes what the image looks like, including the label's own
 * calendar day (the countdown says "3 days to go", so yesterday's render is wrong today).
 *
 * This exists so the route can be cached hard instead of guessed at. The old header was
 * `max-age=300`, which is a staleness bug in both directions: edit the accent colour and the
 * browser serves the old graphic for five minutes from an unchanged URL, with nothing to click
 * that would force it. With the key in the URL, a changed release is a changed URL — fresh at
 * once — and an unchanged one is served from cache instantly instead of re-rasterising 1080x1920.
 */
export function shareVersion(r: {
  coverUrl: string;
  logoUrl: string | null;
  lyricLine: string | null;
  accentColor: string | null;
  orgAccentColor: string | null;
  title: string;
  artistName: string;
  slug: string;
  labelName: string;
  releaseDate: Date;
  timezone: string;
  showBranding: boolean;
  now?: Date;
}) {
  const parts = [
    r.coverUrl, r.logoUrl ?? "", r.lyricLine ?? "", r.accentColor ?? "", r.orgAccentColor ?? "", r.title, r.artistName, r.slug, r.labelName,
    r.releaseDate.toISOString(), r.timezone, r.showBranding ? "mark" : "clean",
    zonedDay(r.now ?? new Date(), r.timezone),
  ];
  return createHash("sha256").update(parts.join("\u0000")).digest("base64url").slice(0, 16);
}

/** Whole calendar days until release in the label's timezone. */
export function daysUntil(releaseDate: Date, tz: string, now = new Date()) {
  const a = Date.parse(`${zonedDay(now, tz)}T00:00:00Z`);
  const b = Date.parse(`${zonedDay(releaseDate, tz)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export async function renderShareImage(opts: {
  format: ShareFormat;
  kind: ShareKind;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  labelName: string;
  releaseDate: Date;
  timezone: string;
  url: string; // shown as text, e.g. presave.label.com/track
  /** The organisation's logo, drawn beside the name on the top line. Null when it hasn't set one. */
  logoUrl?: string | null;
  milestone?: number;
  /** The artist's own line, for kind "lyric". Always typed by them — never fetched from anywhere. */
  lyric?: string | null;
  showBranding: boolean;
}) {
  const size = SHARE_FORMATS[opts.format];
  const story = opts.format === "story";
  const accent = opts.accentColor && /^#[0-9a-f]{6}$/i.test(opts.accentColor) ? opts.accentColor : "#8b5cf6";
  const [bold, medium, cover, logo] = await Promise.all([
    font("Geist-Bold.ttf"), font("Geist-Medium.ttf"), coverDataUri(opts.coverUrl),
    opts.logoUrl ? logoDataUri(opts.logoUrl) : null,
  ]);
  const fonts = [
    ...(bold ? [{ name: "Geist", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(medium ? [{ name: "Geist", data: medium, weight: 500 as const, style: "normal" as const }] : []),
  ];

  const dateLabel = formatInTz(opts.releaseDate, opts.timezone, { weekday: "long", day: "numeric", month: "long" });
  const days = daysUntil(opts.releaseDate, opts.timezone);
  const eyebrow = opts.kind === "lyric" ? opts.title : opts.kind === "out" ? "Out now" : opts.kind === "milestone" ? "Thank you" : days <= 0 ? "Out today" : `Out ${dateLabel}`;
  const badge =
    // Not "Pre-save now": that is what the line under the pill already says, and the two sat on top
    // of each other reading the same words. The countdown's own badge is the right one here.
    opts.kind === "lyric" ? (days <= 0 ? "Listen now" : days === 1 ? "Out tomorrow" : `${days} days to go`) :
    opts.kind === "out" ? "Listen now" :
    opts.kind === "milestone" ? `${(opts.milestone ?? 0).toLocaleString("en-AU")} pre-saves` :
    days <= 0 ? "Out today" : days === 1 ? "Out tomorrow" : `${days} days to go`;
  const cta = opts.kind === "out" || (opts.kind === "lyric" && days <= 0) ? "Link in bio" : "Pre-save now";
  const lyric = opts.kind === "lyric" ? (opts.lyric ?? "").trim() : "";
  /**
   * The lyric card is the same composition with one substitution: the line takes the slot the title
   * holds on the other three, the title moves up to the eyebrow so the song is still named, and the
   * artwork shrinks to give the words room. Reusing the layout rather than writing a second one is
   * what keeps the four graphics looking like one set — and keeps the logo, the mark, the link and
   * the version key working without a second code path to remember.
   */
  const coverSize = opts.kind === "lyric" ? (story ? 420 : 360) : story ? 820 : 640;
  // A lyric is longer than a title and is the thing being read, so it steps down more gently.
  const headline = opts.kind === "lyric" ? `\u201C${lyric}\u201D` : opts.title;
  const titleSize =
    opts.kind === "lyric"
      ? headline.length > 90 ? (story ? 52 : 44) : headline.length > 55 ? (story ? 64 : 54) : headline.length > 30 ? (story ? 76 : 64) : story ? 88 : 74
      : opts.title.length > 34 ? (story ? 64 : 54) : opts.title.length > 20 ? (story ? 80 : 66) : story ? 96 : 80;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "space-between", padding: story ? "110px 90px 90px" : "70px 80px 60px",
          backgroundColor: "#09090c",
          backgroundImage: `radial-gradient(circle at 50% 22%, ${rgba(accent, 0.6)} 0%, ${rgba(accent, 0.18)} 42%, rgba(9,9,12,0) 72%)`,
          color: "#fff", fontFamily: fonts.length ? "Geist" : undefined,
        }}
      >
        {/* The name stays even when there is a logo: a mark nobody recognises yet is not a name. */}
        <div style={{ display: "flex", alignItems: "center", gap: story ? 22 : 18 }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={logo} height={story ? 56 : 46} style={{ objectFit: "contain" }} />
          )}
          <div style={{ display: "flex", fontSize: story ? 34 : 28, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>{opts.labelName}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={cover} width={coverSize} height={coverSize} style={{ borderRadius: 36, boxShadow: `0 40px 120px ${rgba(accent, 0.45)}` }} />
          ) : (
            <div style={{ width: coverSize, height: coverSize, borderRadius: 36, display: "flex", backgroundImage: `linear-gradient(135deg, ${rgba(accent, 0.9)}, rgba(20,20,26,1))` }} />
          )}
          <div style={{ display: "flex", marginTop: story ? 64 : 44, fontSize: story ? 34 : 28, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}>{eyebrow}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: titleSize, fontWeight: 700, lineHeight: opts.kind === "lyric" ? 1.18 : 1.04, letterSpacing: "-0.03em", textAlign: "center", maxWidth: size.width - 160, justifyContent: "center", wordBreak: "break-word" }}>{headline}</div>
          <div style={{ display: "flex", marginTop: 12, fontSize: story ? 48 : 40, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{opts.artistName}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", padding: story ? "22px 48px" : "18px 40px", borderRadius: 999, backgroundColor: "#fff", color: "#09090c", fontSize: story ? 44 : 36, fontWeight: 700 }}>{badge}</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: story ? 32 : 28, color: "rgba(255,255,255,0.75)" }}>{cta} · {opts.url}</div>
          {opts.showBranding && <div style={{ display: "flex", marginTop: 18, fontSize: 24, color: "rgba(255,255,255,0.45)" }}>made with droplr.fm</div>}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
