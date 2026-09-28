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

/**
 * The second door, and it opens separately.
 *
 * Connecting a custom domain is the one thing in droplr that reaches outside droplr: it adds an
 * alias on the Netlify site and waits on a Let's Encrypt certificate. That path has only ever been
 * exercised against a mock, and when it fails it fails quietly — the symptom is a paying
 * customer's domain that simply never goes live, with nothing in the logs naming the cause.
 *
 * So signups can be open to everyone while domains stay with accounts we can ring up. Turning a
 * single account on is a click on /platform and needs no redeploy; DOMAINS_OPEN=true retires the
 * gate for everyone once the path has been proven on real domains.
 *
 * This gates CONNECTING a domain, never serving one. An account already on a domain keeps it,
 * keeps changing it, and its links keep resolving, whatever this says.
 */
export function domainsOpen() {
  return process.env.DOMAINS_OPEN === "true";
}

export function canConnectDomain(org: { domainsAllowedAt: Date | null }) {
  return domainsOpen() || !!org.domainsAllowedAt;
}

/** Shown in settings in place of the domain field, and returned by the API when it refuses. */
export const DOMAIN_INVITE_ONLY =
  "Connecting your own domain is invite-only while we prove the setup on real domains. Email hello@droplr.fm and we'll switch it on for your account — usually same day.";

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
