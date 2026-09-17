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

export type Cta = { label: string; href: string };
export type CtaCopy = {
  open: boolean;
  /** Main call to action (header, hero, final CTA). */
  primary: Cta;
  /** Short header version of the primary CTA. */
  primaryShort: Cta;
  /** Invite-only hint shown under the CTA while signups are closed. */
  hint: { text: string; link: Cta } | null;
  /** Pricing-page tier buttons. */
  plans: { free: Cta; artist: Cta; artist_pro: Cta; pro: Cta; label: Cta };
};

/** Every signup CTA in one place, so closed/open launch copy can't drift between pages. */
export function ctaCopy(): CtaCopy {
  if (signupsOpen()) {
    return {
      open: true,
      primary: { label: "Start free — 3 releases, no card", href: "/signup" },
      primaryShort: { label: "Start free", href: "/signup" },
      hint: null,
      plans: {
        free: { label: "Start free", href: "/signup" },
        artist: { label: "Start Artist", href: "/signup?type=artist&plan=artist" },
        artist_pro: { label: "Start Artist Pro", href: "/signup?type=artist&plan=artist_pro" },
        pro: { label: "Start Pro", href: "/signup?plan=pro" },
        label: { label: "Start Label", href: "/signup?plan=label" },
      },
    };
  }
  // /signup shows the waitlist form while signups are closed; ?invite=1 shows the real form (the API still enforces the allowlist).
  const access = { label: "Request access", href: "/signup" };
  return {
    open: false,
    primary: { label: "Request early access", href: "/signup" },
    primaryShort: access,
    hint: { text: "Invite-only while we onboard our first artists and labels. Have an invite?", link: { label: "Sign up", href: "/signup?invite=1" } },
    plans: { free: access, artist: access, artist_pro: access, pro: access, label: access },
  };
}
