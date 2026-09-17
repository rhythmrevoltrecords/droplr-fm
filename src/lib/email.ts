import { signToken } from "./crypto";
import { SITE_URL } from "./env";
import { BRAND, button, esc, eyebrow, h1, layout, p, platformLogoUrl, platformRow, rgba, safeHex, safeHttps } from "./email-design";

type SendArgs = { to: string; subject: string; html: string; text: string; fromName?: string | null; replyTo?: string | null; headers?: Record<string, string> };

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

/** Resend batch API: up to 100 emails per call. */
export async function sendBatch(messages: SendArgs[]) {
  if (!emailConfigured()) throw new Error("RESEND_API_KEY / RESEND_FROM_EMAIL not set");
  const from = process.env.RESEND_FROM_EMAIL!;
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      messages.map((m) => ({
        from: m.fromName ? `${m.fromName.replace(/[<>"]/g, "")} <${from}>` : from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        reply_to: m.replyTo || undefined,
        headers: m.headers,
      })),
    ),
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "2");
    const err = new Error("Resend rate limited") as Error & { retryAfter?: number };
    err.retryAfter = retry;
    throw err;
  }
  if (!res.ok) throw Object.assign(new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
  return res.json();
}

/** The release-day email, sent as the artist / label (their name, logo and accent colour; droplr only in the footer on Free). */
export async function releaseDayEmail(args: {
  preSaveId: string;
  releaseId: string;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  publicUrl: string; // absolute smart link URL (custom domain aware)
  linkBase: string; // absolute origin that serves /api/r
  platforms: string[];
  orgName: string;
  spotifyArtistId?: string | null;
  logoUrl?: string | null;
  /** The platform the fan picked when they pre-saved: first and highlighted. */
  leadPlatform?: string | null;
  showBranding?: boolean;
}) {
  const pst = await signToken({ ps: args.preSaveId }, "60d", "pst");
  const unsub = await signToken({ ps: args.preSaveId, act: "unsub" }, "365d", "unsub");
  return renderReleaseDayEmail({ ...args, pst, unsub });
}

/** Pure render (no signing) so the platform console can preview it with sample data. */
export function renderReleaseDayEmail(args: Parameters<typeof releaseDayEmail>[0] & { pst: string; unsub: string }) {
  const utm = "utm_source=release_email&utm_medium=email&utm_campaign=presave";
  const accent = safeHex(args.accentColor);
  const cover = safeHttps(args.coverUrl);
  const track = (p: string) => `${args.linkBase}/api/r/${encodeURIComponent(args.releaseId)}/${encodeURIComponent(p)}?${utm}&pst=${args.pst}`;
  const rows = args.platforms.slice(0, 5).map((p, i) => platformRow(track(p), p, accent, i === 0 && !!args.leadPlatform && p === args.leadPlatform)).join("");
  const allLink = `${args.publicUrl}?${utm}&pst=${args.pst}`;
  const unsubUrl = `${SITE_URL}/api/unsubscribe?t=${args.unsub}`;
  const subject = `${args.title} by ${args.artistName} is out now`;
  const follow = args.spotifyArtistId && /^[A-Za-z0-9]{22}$/.test(args.spotifyArtistId);

  const body = `
${cover ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 22px">
<img src="${esc(cover)}" width="260" height="260" alt="${esc(args.title)} cover" style="display:block;width:260px;max-width:100%;height:auto;border-radius:16px;border:0;box-shadow:0 18px 50px ${rgba(accent, 0.45)}"/></td></tr></table>` : ""}
<div style="text-align:center">
${eyebrow("Out now", accent)}
${h1(args.title)}
${p(esc(args.artistName), `color:${BRAND.muted};font-size:16px;margin-bottom:22px`)}
${p("You pre-saved this one. It just dropped: listen or save it now.", `color:${BRAND.text};margin-bottom:18px`)}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td align="center">${button(allLink, "All platforms", accent)}</td></tr></table>
${follow ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td align="center">
<a href="${esc(track("spotifyFollow"))}" style="display:inline-block;padding:10px 16px;border:1px solid ${rgba("#1ED760", 0.35)};border-radius:999px;color:#1ED760;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none">
<img src="${platformLogoUrl("spotify")}" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;vertical-align:-3px;margin-right:6px;border:0"/>Follow ${esc(args.artistName)} on Spotify</a></td></tr></table>` : ""}`;

  const footer = `Sent by ${esc(args.orgName)} because you asked to be emailed when this release came out.<br/>
<a href="${esc(unsubUrl)}" style="color:${BRAND.muted};text-decoration:underline">Unsubscribe</a>${args.showBranding ? `<br/><br/><a href="https://droplr.fm" style="color:${BRAND.faint};text-decoration:none">Pre-saves by <strong style="color:${BRAND.muted}">droplr.fm</strong></a>` : ""}`;

  const html = layout({ preheader: `${args.artistName} just released ${args.title}. Your pre-save is ready.`, accent, brand: { name: args.orgName, logoUrl: args.logoUrl }, body, footer });
  const text = `${subject}\n\nYou pre-saved this one. Listen or save it now: ${allLink}\n\nSent by ${args.orgName} because you asked to be emailed on release day.\nUnsubscribe: ${unsubUrl}`;
  return { subject, html, text, headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
