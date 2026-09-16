import { hashIp } from "./crypto";

export const ANON_COOKIE = "dfm_anon";
export const SRC_COOKIE = "dfm_src";

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|linkedin|skype|curl|wget|python|headless|lighthouse/i;

/** Fan-supplied strings (utm_*, referrer, source) are stored and exported: keep them short. */
export const capText = (v: string | null | undefined, max = 200) => (v ? v.slice(0, max) : v ?? null);

export function isBot(ua: string | null) {
  return !ua || BOT_RE.test(ua);
}

export function deviceType(ua: string | null) {
  if (!ua) return "unknown";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Netlify: x-nf-geo is base64 JSON {country:{code}}; Cloudflare: cf-ipcountry */
export function countryFrom(headers: Headers) {
  const nf = headers.get("x-nf-geo");
  if (nf) {
    try {
      const json = JSON.parse(Buffer.from(nf, "base64").toString("utf8"));
      if (json?.country?.code) return String(json.country.code);
    } catch {
      try {
        const json = JSON.parse(nf);
        if (json?.country?.code) return String(json.country.code);
      } catch {}
    }
  }
  const cc = headers.get("x-country") || headers.get("cf-ipcountry");
  return cc && cc !== "XX" ? cc : null;
}

export function clientIp(headers: Headers) {
  return headers.get("x-nf-client-connection-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function referrerHost(ref: string | null) {
  if (!ref) return null;
  try {
    return new URL(ref).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Source attribution priority: variant.source > utm_source > referrer host > "direct" */
export function resolveSource(opts: { variantSource?: string | null; utmSource?: string | null; referrer?: string | null; selfHosts?: string[] }) {
  if (opts.variantSource) return opts.variantSource;
  if (opts.utmSource) return capText(opts.utmSource)!;
  const host = referrerHost(opts.referrer ?? null);
  if (host && !(opts.selfHosts ?? []).some((h) => host === h)) {
    if (/instagram/.test(host)) return "instagram";
    if (/tiktok/.test(host)) return "tiktok";
    if (/facebook|fb\./.test(host)) return "facebook";
    if (/t\.co|twitter|x\.com/.test(host)) return "x";
    if (/youtube/.test(host)) return "youtube";
    if (/google/.test(host)) return "google";
    return host;
  }
  return "direct";
}

export function requestMeta(headers: Headers) {
  const ua = headers.get("user-agent");
  return {
    ua,
    bot: isBot(ua),
    deviceType: deviceType(ua),
    country: countryFrom(headers),
    ipHash: hashIp(clientIp(headers)),
    referrer: capText(headers.get("referer")),
  };
}
