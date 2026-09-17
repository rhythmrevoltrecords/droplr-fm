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
export type ShareKind = "countdown" | "out" | "milestone";
export const MILESTONES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

async function font(file: string) {
  try {
    return await readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));
  } catch {
    return null;
  }
}

async function coverDataUri(coverUrl: string) {
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
  milestone?: number;
  showBranding: boolean;
}) {
  const size = SHARE_FORMATS[opts.format];
  const story = opts.format === "story";
  const accent = opts.accentColor && /^#[0-9a-f]{6}$/i.test(opts.accentColor) ? opts.accentColor : "#8b5cf6";
  const [bold, medium, cover] = await Promise.all([font("Geist-Bold.ttf"), font("Geist-Medium.ttf"), coverDataUri(opts.coverUrl)]);
  const fonts = [
    ...(bold ? [{ name: "Geist", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(medium ? [{ name: "Geist", data: medium, weight: 500 as const, style: "normal" as const }] : []),
  ];

  const dateLabel = formatInTz(opts.releaseDate, opts.timezone, { weekday: "long", day: "numeric", month: "long" });
  const days = daysUntil(opts.releaseDate, opts.timezone);
  const eyebrow = opts.kind === "out" ? "Out now" : opts.kind === "milestone" ? "Thank you" : days <= 0 ? "Out today" : `Out ${dateLabel}`;
  const badge =
    opts.kind === "out" ? "Listen now" :
    opts.kind === "milestone" ? `${(opts.milestone ?? 0).toLocaleString("en-AU")} pre-saves` :
    days <= 0 ? "Out today" : days === 1 ? "Out tomorrow" : `${days} days to go`;
  const cta = opts.kind === "out" ? "Link in bio" : "Pre-save now";
  const coverSize = story ? 820 : 640;
  const titleSize = opts.title.length > 34 ? (story ? 64 : 54) : opts.title.length > 20 ? (story ? 80 : 66) : story ? 96 : 80;

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
        <div style={{ display: "flex", fontSize: story ? 34 : 28, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>{opts.labelName}</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={cover} width={coverSize} height={coverSize} style={{ borderRadius: 36, boxShadow: `0 40px 120px ${rgba(accent, 0.45)}` }} />
          ) : (
            <div style={{ width: coverSize, height: coverSize, borderRadius: 36, display: "flex", backgroundImage: `linear-gradient(135deg, ${rgba(accent, 0.9)}, rgba(20,20,26,1))` }} />
          )}
          <div style={{ display: "flex", marginTop: story ? 64 : 44, fontSize: story ? 34 : 28, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}>{eyebrow}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: titleSize, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.03em", textAlign: "center", maxWidth: size.width - 160, justifyContent: "center" }}>{opts.title}</div>
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
