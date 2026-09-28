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

/**
 * Lands the moment someone confirms their address — the one point where a new account is both
 * proven and paying attention. It names the next three things to do rather than welcoming them
 * in the abstract, because the failure mode for a tool like this isn't people disliking it, it's
 * people signing up and never coming back to make the first link.
 */
export function welcomeEmail(kind: "label" | "artist") {
  const first = kind === "label"
    ? [
        ["Add your artists", "Photo, bio, genre, socials. Every press kit and release page is built from it.", `${SITE_URL}/admin/artists`],
        ["Paste a Spotify link", "droplr builds the pre-save page, pulls the artwork and its colour, and fills in the other stores as they appear.", `${SITE_URL}/admin`],
        ["Make the clip", "Pick 30 seconds of the track and droplr renders the video for Reels, with your link on it. The audio never leaves your computer.", `${SITE_URL}/admin`],
      ]
    : [
        ["Fill in your profile", "Photo, bio, genre, socials. Your press kit is generated from it, so it's the one thing worth doing properly.", `${SITE_URL}/admin/artists`],
        ["Paste a Spotify link", "droplr builds the pre-save page, pulls the artwork and its colour, and fills in the other stores as they appear.", `${SITE_URL}/admin`],
        ["Make the clip", "Pick 30 seconds of the track and droplr renders the video for Reels, with your link on it. The audio never leaves your computer.", `${SITE_URL}/admin`],
      ];
  const steps = first
    .map(([title, body, href], i) => `${p(`<strong style="color:${BRAND.text}">${i + 1}. <a href="${href}" style="color:${BRAND.violet};text-decoration:none">${esc(title)}</a></strong><br/>${esc(body)}`)}`)
    .join("");
  return {
    subject: "You're in — here's where to start",
    html: accountEmailShell(
      "You're in",
      `${p("Your email is confirmed, so the account is fully yours. Three things worth doing in the first ten minutes:")}
${steps}
<div style="margin:24px 0">${button(`${SITE_URL}/admin`, "Open droplr")}</div>
${muted("Stuck on anything, reply to this email. It reaches a person, not a ticket queue.")}`,
    ),
    text: `You're in.\n\nYour email is confirmed. Three things worth doing first:\n\n${first.map(([t, b, h], i) => `${i + 1}. ${t} — ${b}\n   ${h}`).join("\n\n")}\n\nStuck on anything, reply to this email.`,
  };
}

/**
 * To droplr's own platform admins when an account is created. Signups are public, so this is both
 * the first-customer alert and the first sight of anything odd. Never blocks a signup.
 */
export function newAccountEmail(a: { name: string; slug: string; kind: string; email: string; plan: string }) {
  return {
    subject: `New ${a.kind === "artist" ? "artist" : "label"} account: ${a.name}`,
    html: accountEmailShell(
      "Someone signed up",
      `${p(`<strong style="color:${BRAND.text}">${esc(a.name)}</strong> &middot; ${esc(a.kind)} &middot; ${esc(a.plan)}`)}
${p(`${esc(a.email)}<br/><span style="color:${BRAND.muted}">droplr.fm/${esc(a.slug)}</span>`)}
<div style="margin:24px 0">${button(`${SITE_URL}/platform`, "Open the platform console")}</div>
${muted("They can't do anything until they confirm the address.")}`,
    ),
    text: `New ${a.kind} account: ${a.name} (${a.email})\nPlan: ${a.plan}\ndroplr.fm/${a.slug}\n\n${SITE_URL}/platform`,
  };
}
