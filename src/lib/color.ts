import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const FALLBACK = "#6D28D9";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Private, loopback, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24 IETF protocol, 192.0.2/24 docs
      (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
      (a === 198 && b === 51 && c === 100) || // docs
      (a === 203 && b === 0 && c === 113) || // docs
      a >= 224 // multicast + reserved
    );
  }
  if (v === 6) {
    const bytes = ipv6Bytes(ip);
    if (!bytes) return true; // can't parse it: don't try to be clever
    const embedded = (o: number) => isPrivateIp(`${bytes[o]}.${bytes[o + 1]}.${bytes[o + 2]}.${bytes[o + 3]}`);
    const zero = (from: number, to: number) => bytes.slice(from, to).every((x) => x === 0);
    // ::ffff:a.b.c.d (IPv4-mapped): judge the IPv4 address.
    if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return embedded(12);
    // ::ffff:0:a.b.c.d (IPv4-translated, ::ffff:0:0/96): judge the IPv4 address.
    if (zero(0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && bytes[10] === 0 && bytes[11] === 0) return embedded(12);
    // ::/96 — unspecified, loopback and the deprecated IPv4-compatible form (::7f00:1 is 127.0.0.1).
    if (zero(0, 12)) return true;
    const w0 = (bytes[0] << 8) | bytes[1];
    const w1 = (bytes[2] << 8) | bytes[3];
    if (w0 === 0x0064 && w1 === 0xff9b) return zero(4, 12) ? embedded(12) : true; // NAT64 64:ff9b::/96 (and 64:ff9b:1::/48 local-use)
    if (w0 === 0x2002) return embedded(2); // 6to4 2002:a.b.c.d::/48
    if (w0 === 0x2001 && w1 === 0x0000) return true; // Teredo: the IPv4 inside is obfuscated
    if (w0 === 0x2001 && w1 === 0x0db8) return true; // documentation
    if (w0 === 0x0100 && zero(2, 8)) return true; // 100::/64 discard
    return (
      (w0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (w0 & 0xffc0) === 0xfe80 || // fe80::/10 link local
      (w0 & 0xffc0) === 0xfec0 || // fec0::/10 site local (deprecated, still routed by some stacks)
      (w0 & 0xff00) === 0xff00 // ff00::/8 multicast
    );
  }
  return true;
}

/** 16 bytes of an IPv6 address (handles "::" and a dotted IPv4 tail), or null if it doesn't parse. */
function ipv6Bytes(ip: string): number[] | null {
  let h = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const tail = h.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [p, q, r, t] = tail.slice(1).map(Number);
    h = h.slice(0, -tail[0].length) + `${((p << 8) | q).toString(16)}:${((r << 8) | t).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
  const words = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest].map((w) => parseInt(w, 16));
  if (words.length !== 8 || words.some((w) => Number.isNaN(w) || w < 0 || w > 0xffff)) return null;
  return words.flatMap((w) => [w >> 8, w & 0xff]);
}

/** Only public https hosts: cover URLs are user-supplied, so this must not reach internal services. */
async function publicHttpsUrl(raw: string): Promise<URL | null> {
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
    // No redirects: a public host could otherwise bounce us to an internal address after the check.
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
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
