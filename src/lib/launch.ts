/**
 * Pre-launch gate. SIGNUPS_OPEN=true opens self-serve signup to everyone.
 * Until then only emails in SIGNUP_ALLOWLIST (comma-separated) can create a label account.
 * Everything else keeps working: login, artist invites, public smart links, Stripe webhooks.
 * Both are read at build and request time, so change them in Netlify and redeploy.
 */
export function signupsOpen() {
  return process.env.SIGNUPS_OPEN === "true";
}

export function signupAllowlist() {
  return (process.env.SIGNUP_ALLOWLIST ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function canSignUp(email: string) {
  return signupsOpen() || signupAllowlist().includes(email.trim().toLowerCase());
}
