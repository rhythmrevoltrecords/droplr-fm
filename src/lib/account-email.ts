import { SITE_URL } from "./env";
import { CONTACT } from "./legal";

/**
 * Account email (password reset, security notices) sent through Resend.
 * Sender: ACCOUNT_FROM_EMAIL (e.g. "droplr.fm <accounts@droplr.fm>"), falling back to RESEND_FROM_EMAIL.
 * Kept separate from fan release-day email (RESEND_FROM_EMAIL) so the two can use different addresses.
 */
export function accountEmailConfigured() {
  return !!process.env.RESEND_API_KEY && !!(process.env.ACCOUNT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL);
}

function sender() {
  const raw = process.env.ACCOUNT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "";
  return raw.includes("<") ? raw : `droplr.fm <${raw}>`;
}

export async function sendAccountEmail(msg: { to: string; subject: string; html: string; text: string }) {
  if (!accountEmailConfigured()) throw new Error("RESEND_API_KEY / ACCOUNT_FROM_EMAIL not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: sender(), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: CONTACT.support }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const shell = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#0c0a14;padding:32px 16px;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;color:#e4e4e7">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#16131f;border:1px solid #27233a;border-radius:16px"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-weight:700;color:#fff">droplr.fm</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#fff">${title}</h1>${body}
<p style="margin:28px 0 0;font-size:12px;color:#71717a">Need help? Reply to this email or contact ${CONTACT.support}.</p>
</td></tr></table></body></html>`;

export function resetPasswordEmail(url: string) {
  return {
    subject: "Reset your droplr.fm password",
    html: shell(
      "Reset your password",
      `<p style="margin:0 0 20px">Someone (hopefully you) asked to reset the password for this droplr.fm account. The link works once and expires in 60 minutes.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Choose a new password</a></p>
<p style="margin:0;font-size:13px;color:#a1a1aa">If you didn't ask for this, ignore this email. Your password won't change.</p>`,
    ),
    text: `Reset your droplr.fm password\n\nThis link works once and expires in 60 minutes:\n${url}\n\nIf you didn't ask for this, ignore this email.`,
  };
}

export function verifyEmailEmail(url: string) {
  return {
    subject: "Confirm your email for droplr.fm",
    html: shell(
      "Confirm your email",
      `<p style="margin:0 0 20px">Tap below to confirm this is your address. It keeps your account recoverable and unlocks inviting your team, custom domains and Spotify. The link expires in 48 hours.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Confirm my email</a></p>
<p style="margin:0;font-size:13px;color:#a1a1aa">Didn't create a droplr.fm account? Ignore this email and nothing happens.</p>`,
    ),
    text: `Confirm your email for droplr.fm\n\nThis link expires in 48 hours:\n${url}\n\nDidn't create a droplr.fm account? Ignore this email.`,
  };
}

export function passwordChangedEmail(when: Date) {
  const stamp = when.toUTCString();
  return {
    subject: "Your droplr.fm password was changed",
    html: shell(
      "Your password was changed",
      `<p style="margin:0 0 16px">The password for your droplr.fm account was changed on ${stamp}. Every other device has been signed out.</p>
<p style="margin:0">If this wasn't you, <a href="${SITE_URL}/forgot-password" style="color:#a78bfa">reset your password now</a> and tell us at ${CONTACT.security}.</p>`,
    ),
    text: `Your droplr.fm password was changed on ${stamp}. Every other device has been signed out.\n\nIf this wasn't you, reset it now: ${SITE_URL}/forgot-password and tell us at ${CONTACT.security}.`,
  };
}
