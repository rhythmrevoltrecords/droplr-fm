import { sha256 } from "@/lib/crypto";

// Mailchimp webhooks aren't signed, so the callback URL carries a per-org token derived from
// JWT_SECRET. A spoofed call without the right token is ignored. The token reveals nothing and
// can't be reversed into the secret.
export function espWebhookToken(orgId: string, secret = process.env.JWT_SECRET ?? ""): string {
  return sha256(`esp-mailchimp-webhook|${orgId}|${secret}`).slice(0, 32);
}
export function verifyEspWebhook(orgId: string, token: string | null | undefined): boolean {
  if (!token || token.length !== 32) return false;
  // constant-ish time: compare against the expected token
  // The label pastes the webhook URL into Mailchimp by hand, so after JWT_SECRET is rotated the URL
  // there still carries the old token. JWT_SECRET_PREVIOUS keeps it working, and each call that only
  // the old secret verifies is logged. Quiet logs prove nothing (Mailchimp only calls on an
  // unsubscribe), so before removing JWT_SECRET_PREVIOUS every account with a Mailchimp connection
  // has to re-paste the URL from Settings → Integrations; otherwise its unsubscribes silently stop
  // reaching droplr.
  const matches = (s: string) => {
    const expected = espWebhookToken(orgId, s);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  };
  if (matches(process.env.JWT_SECRET ?? "")) return true;
  if (process.env.JWT_SECRET_PREVIOUS && matches(process.env.JWT_SECRET_PREVIOUS)) {
    console.warn("[esp webhook] verified only by JWT_SECRET_PREVIOUS: this account's Mailchimp webhook URL needs re-pasting", { org: orgId });
    return true;
  }
  return false;
}
