import { SITE_URL } from "./env";
import { BRAND, button, esc, h1, layout, muted, p } from "./email-design";
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

/**
 * droplr.fm-branded account email: wordmark, violet glow, one card. `body` is trusted HTML
 * built from the helpers; `title` is plain text and h1() escapes it.
 *
 * Pass the title unescaped. This used to un-escape five entities before handing them to h1(),
 * which escaped them again — a round trip that only existed because one caller escaped first.
 */
export const accountEmailShell = (title: string, body: string) =>
  layout({
    preheader: title.replace(/<[^>]+>/g, ""),
    brand: "droplr",
    body: `${h1(title)}${body}`,
    footer: `Need help? Reply to this email or contact <a href="mailto:${CONTACT.support}" style="color:${BRAND.muted}">${CONTACT.support}</a>.<br/>droplr.fm · Brisbane, Australia`,
  });

export function resetPasswordEmail(url: string) {
  return {
    subject: "Reset your droplr.fm password",
    html: accountEmailShell(
      "Reset your password",
      `${p("Someone (hopefully you) asked to reset the password for this droplr.fm account. The link works once and expires in 60 minutes.")}
<div style="margin:24px 0">${button(url, "Choose a new password")}</div>
${muted("If you didn&apos;t ask for this, ignore this email. Your password won&apos;t change.")}`,
    ),
    text: `Reset your droplr.fm password\n\nThis link works once and expires in 60 minutes:\n${url}\n\nIf you didn't ask for this, ignore this email.`,
  };
}

export function verifyEmailEmail(url: string) {
  return {
    subject: "Confirm your email for droplr.fm",
    html: accountEmailShell(
      "Confirm your email",
      `${p("Tap below to confirm this is your address. It keeps your account recoverable and unlocks inviting your team, custom domains and Spotify. The link expires in 48 hours.")}
<div style="margin:24px 0">${button(url, "Confirm my email")}</div>
${muted("Didn&apos;t create a droplr.fm account? Ignore this email and nothing happens.")}`,
    ),
    text: `Confirm your email for droplr.fm\n\nThis link expires in 48 hours:\n${url}\n\nDidn't create a droplr.fm account? Ignore this email.`,
  };
}

export function passwordChangedEmail(when: Date) {
  const stamp = when.toUTCString();
  return {
    subject: "Your droplr.fm password was changed",
    html: accountEmailShell(
      "Your password was changed",
      `${p(`The password for your droplr.fm account was changed on ${esc(stamp)}. Every other device has been signed out.`)}
<div style="margin:24px 0">${button(`${SITE_URL}/forgot-password`, "This wasn't me", "#DC2626")}</div>
${muted(`If this wasn&apos;t you, reset your password with the button above and tell us at ${CONTACT.security}.`)}`,
    ),
    text: `Your droplr.fm password was changed on ${stamp}. Every other device has been signed out.\n\nIf this wasn't you, reset it now: ${SITE_URL}/forgot-password and tell us at ${CONTACT.security}.`,
  };
}
