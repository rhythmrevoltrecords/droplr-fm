import { signToken } from "./crypto";
import { SITE_URL } from "./env";
import { platformMeta } from "./platforms";

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
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
}) {
  const pst = await signToken({ ps: args.preSaveId }, "60d", "pst");
  const unsub = await signToken({ ps: args.preSaveId, act: "unsub" }, "365d", "unsub");
  const utm = "utm_source=release_email&utm_medium=email&utm_campaign=presave";
  // Interpolated into style attributes: only a plain hex colour is allowed through.
  const accent = args.accentColor && /^#[0-9a-fA-F]{6}$/.test(args.accentColor) ? args.accentColor : "#8B5CF6";
  // Cover URLs can come from label input or store lookups: https only, and escaped for the attribute.
  const cover = /^https:\/\//i.test(args.coverUrl) ? `<img src="${esc(args.coverUrl)}" width="220" height="220" alt="" style="border-radius:14px;display:block;margin:0 auto 20px;width:220px;height:220px;object-fit:cover"/>` : "";
  const buttons = args.platforms.slice(0, 5).map((p) => {
    const href = esc(`${args.linkBase}/api/r/${encodeURIComponent(args.releaseId)}/${encodeURIComponent(p)}?${utm}&pst=${pst}`);
    return `<tr><td style="padding:6px 0"><a href="${href}" style="display:block;background:#18181b;border:1px solid #27272a;color:#fafafa;text-decoration:none;padding:14px 18px;border-radius:12px;font:600 15px system-ui,sans-serif">${esc(platformMeta(p).action)} on ${esc(platformMeta(p).name)} →</a></td></tr>`;
  }).join("");
  const allLink = `${args.publicUrl}?${utm}&pst=${pst}`;
  const unsubUrl = `${SITE_URL}/api/unsubscribe?t=${unsub}`;
  const subject = `${args.title} by ${args.artistName} is out now`;

  const html = `<!doctype html><html><body style="margin:0;background:#09090b;padding:24px 12px">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#0f0f12;border-radius:20px;overflow:hidden;border:1px solid #1f1f23">
<tr><td style="background:${accent};height:6px"></td></tr>
<tr><td style="padding:28px 24px 8px;text-align:center">
${cover}
<p style="margin:0;color:#a1a1aa;font:500 12px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase">Out now</p>
<h1 style="margin:8px 0 4px;color:#fafafa;font:700 24px system-ui,sans-serif">${esc(args.title)}</h1>
<p style="margin:0 0 20px;color:#d4d4d8;font:400 16px system-ui,sans-serif">${esc(args.artistName)}</p>
<p style="margin:0 0 16px;color:#a1a1aa;font:400 14px system-ui,sans-serif">You pre-saved this one. It just dropped. Save it now:</p>
</td></tr>
<tr><td style="padding:0 24px"><table role="presentation" width="100%">${buttons}</table></td></tr>
<tr><td style="padding:12px 24px 28px;text-align:center"><a href="${esc(allLink)}" style="color:${accent};font:600 14px system-ui,sans-serif">All platforms</a></td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #1f1f23;color:#71717a;font:400 12px system-ui,sans-serif;text-align:center">
Sent by ${esc(args.orgName)} because you asked to be emailed when this release came out.<br/>
<a href="${esc(unsubUrl)}" style="color:#a1a1aa">Unsubscribe</a></td></tr>
</table></body></html>`;

  const text = `${subject}\n\nYou pre-saved this one. Save it now: ${allLink}\n\nSent by ${args.orgName} because you asked to be emailed on release day.\nUnsubscribe: ${unsubUrl}`;
  return { subject, html, text, headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
