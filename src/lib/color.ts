import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateIp } from "./private-ip";
import { untrustedGet } from "./untrusted-get";

const FALLBACK = "#6D28D9";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export { isPrivateIp };

/** Only public https hosts: cover URLs are user-supplied, so this must not reach internal services. */
export async function publicHttpsUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
  return url;
}

/** Download an image from a public https URL (no redirects, size-capped). null if not allowed or not an image. */
export async function fetchPublicImage(imageUrl: string): Promise<Buffer | null> {
  try {
    const url = await publicHttpsUrl(imageUrl);
    if (!url) return null;
    // No redirects (a public host could otherwise bounce us to an internal address after the check),
    // and no decompression: see lib/untrusted-get for why this isn't fetch().
    const res = await untrustedGet(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 5000, accept: "image/*" });
    if (!res || res.status < 200 || res.status >= 300 || !res.contentType.startsWith("image/")) return null;
    return res.body;
  } catch {
    return null;
  }
}

/** Extract a dark-friendly accent colour from cover art. Falls back to a neutral violet. */
export async function extractAccentColor(imageUrl: string): Promise<string> {
  const buf = await fetchPublicImage(imageUrl);
  if (!buf) return FALLBACK;
  try {
    return await accentFromBuffer(buf);
  } catch {
    return FALLBACK;
  }
}

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/**
 * Dominant vivid colour via sharp (libvips): 48x48 thumbnail, hue histogram weighted by saturation × value,
 * then nudged into a range that reads well as an accent on the dark UI.
 */
export async function accentFromBuffer(buf: Buffer): Promise<string> {
  try {
    const { default: sharp } = await import("sharp");
    // limitInputPixels guards against decompression bombs.
    const { data, info } = await sharp(buf, { limitInputPixels: 64_000_000 })
      .resize(48, 48, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const BUCKETS = 12;
    const weight = new Array<number>(BUCKETS).fill(0);
    const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0]);
    for (let i = 0; i + 2 < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const v = max / 255;
      const s = max === 0 ? 0 : (max - min) / max;
      if (v < 0.15 || (v > 0.95 && s < 0.1) || s < 0.2) continue; // too dark, near white, or grey
      const d = max - min;
      let h = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const bucket = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
      const w = s * v;
      weight[bucket] += w;
      sum[bucket][0] += r * w; sum[bucket][1] += g * w; sum[bucket][2] += b * w;
    }

    const best = weight.indexOf(Math.max(...weight));
    if (!(weight[best] > 0)) return FALLBACK;
    const [h, s, l] = rgbToHsl(sum[best][0] / weight[best], sum[best][1] / weight[best], sum[best][2] / weight[best]);
    const [r, g, b] = hslToRgb(h, Math.max(s, 0.45), Math.min(0.6, Math.max(0.35, l)));
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return FALLBACK;
  }
}
