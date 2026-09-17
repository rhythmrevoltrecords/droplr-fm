// Shared HTML for every email droplr sends. Table layout + inline styles only: Gmail, Outlook and Apple Mail
// ignore <style> blocks, flexbox, SVG and CSS variables. Relative imports only (bundled by Netlify functions too).
import { SITE_URL } from "./env";
import { PLATFORM_LOGOS } from "./platform-logos";
import { platformMeta } from "./platforms";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const BRAND = { violet: "#8B5CF6", violetDeep: "#6D28D9", bg: "#0B0A10", card: "#14121C", line: "#262233", text: "#F4F4F5", muted: "#A1A1AA", faint: "#71717A" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Only a plain #rrggbb reaches a style attribute. */
export const safeHex = (c: string | null | undefined, fallback = BRAND.violet) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);
/** Only https URLs reach an src/href attribute. */
export const safeHttps = (u: string | null | undefined) => (u && (/^https:\/\//i.test(u) || /^http:\/\/localhost[:/]/i.test(u)) ? u : null);

/** #rrggbb + alpha → rgba() (for glows on the dark card). */
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Hosted PNG of a platform mark (emails can't use SVG). Null when the platform has no mark. */
export function platformLogoUrl(platform: string, base = SITE_URL) {
  const key = platform === "spotifyFollow" ? "spotify" : platform;
  return PLATFORM_LOGOS[key as keyof typeof PLATFORM_LOGOS] ? `${base}/platforms/${key}.png` : null;
}

export function button(href: string, label: string, color = BRAND.violet) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td style="border-radius:12px;background:${color}">
<a href="${esc(href)}" style="display:inline-block;padding:14px 26px;border-radius:12px;background:${color};color:#ffffff;font:600 15px/1 ${FONT};text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

/** A store row: logo tile, "Play on Spotify", arrow. `lead` = the fan's own pick, outlined in the accent colour. */
export function platformRow(href: string, platform: string, accent: string, lead = false) {
  const m = platformMeta(platform);
  const logo = platformLogoUrl(platform);
  const tile = logo
    ? `<img src="${logo}" width="22" height="22" alt="" style="display:block;width:22px;height:22px;border:0"/>`
    : `<span style="display:block;width:22px;height:22px;line-height:22px;text-align:center;color:${safeHex(m.color, "#ffffff")};font:700 13px/22px ${FONT}">${esc(m.monogram)}</span>`;
  const border = lead ? accent : BRAND.line;
  return `<tr><td style="padding:5px 0">
<a href="${esc(href)}" style="display:block;text-decoration:none;border:1px solid ${border};border-radius:14px;background:${lead ? rgba(accent, 0.1) : "#1A1724"}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" style="padding:11px 0 11px 12px"><div style="width:34px;height:34px;border-radius:9px;background:${rgba(safeHex(m.color, "#ffffff"), 0.14)};text-align:center"><div style="padding:6px">${tile}</div></div></td>
<td style="padding:11px 10px;color:${BRAND.text};font:600 15px/1.2 ${FONT}">${esc(m.action)} on ${esc(m.name)}${lead ? `<div style="margin-top:3px;color:${BRAND.muted};font:400 12px/1.2 ${FONT}">Your pick</div>` : ""}</td>
<td width="36" align="right" style="padding:11px 14px 11px 0;color:${lead ? accent : BRAND.faint};font:600 18px/1 ${FONT}">&rsaquo;</td>
</tr></table></a></td></tr>`;
}

/**
 * Card layout. `brand`: "droplr" puts the droplr.fm wordmark on top (account emails);
 * { name, logoUrl } puts the artist / label on top (fan emails, sent as them).
 */
export function layout(opts: { preheader: string; accent?: string; brand: "droplr" | { name: string; logoUrl?: string | null }; body: string; footer: string }) {
  const accent = safeHex(opts.accent);
  const head =
    opts.brand === "droplr"
      ? `<img src="${SITE_URL}/logo/wordmark-white-360.png" width="120" height="37" alt="droplr.fm" style="display:block;width:120px;height:37px;border:0"/>`
      : (() => {
          const logo = safeHttps(opts.brand.logoUrl);
          return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo ? `<td style="padding-right:10px"><img src="${esc(logo)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border-radius:8px;object-fit:cover;border:0"/></td>` : ""}<td style="color:${BRAND.text};font:700 15px/1.2 ${FONT}">${esc(opts.brand.name)}</td></tr></table>`;
        })();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title></title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};background-image:radial-gradient(ellipse 80% 45% at 50% 0%,${rgba(accent, 0.35)},rgba(0,0,0,0) 70%)">
<tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 6px 18px">${head}</td></tr>
<tr><td style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:22px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:4px;line-height:4px;font-size:0;background:${accent};background-image:linear-gradient(90deg,${accent},${rgba(accent, 0.25)})">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 30px;color:${BRAND.text};font:400 15px/1.6 ${FONT}">${opts.body}</td></tr>
</table></td></tr>
<tr><td style="padding:18px 10px 0;color:${BRAND.faint};font:400 12px/1.6 ${FONT};text-align:center">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export const p = (html: string, style = "") => `<p style="margin:0 0 16px;${style}">${html}</p>`;
export const h1 = (text: string) => `<h1 style="margin:0 0 12px;color:${BRAND.text};font:700 24px/1.25 ${FONT};letter-spacing:-0.01em">${esc(text)}</h1>`;
export const eyebrow = (text: string, color: string) => `<p style="margin:0 0 8px;color:${color};font:700 12px/1 ${FONT};letter-spacing:0.14em;text-transform:uppercase">${esc(text)}</p>`;
export const quote = (body: string, accent = BRAND.violet) =>
  `<div style="margin:0 0 20px;padding:14px 16px;border-left:3px solid ${accent};background:#1C1928;border-radius:10px;color:${BRAND.text};white-space:pre-wrap">${esc(body.length > 1200 ? `${body.slice(0, 1200)}…` : body)}</div>`;
export const muted = (html: string) => `<p style="margin:16px 0 0;color:${BRAND.muted};font:400 13px/1.55 ${FONT}">${html}</p>`;
