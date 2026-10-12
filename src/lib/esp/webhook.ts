import { sha256 } from "@/lib/crypto";

// Mailchimp webhooks aren't signed, so the callback URL carries a per-org token derived from
// JWT_SECRET. A spoofed call without the right token is ignored. The token reveals nothing and
// can't be reversed into the secret.
export function espWebhookToken(orgId: string): string {
  return sha256(`esp-mailchimp-webhook|${orgId}|${process.env.JWT_SECRET ?? ""}`).slice(0, 32);
}
export function verifyEspWebhook(orgId: string, token: string | null | undefined): boolean {
  if (!token || token.length !== 32) return false;
  // constant-ish time: compare against the expected token
  const expected = espWebhookToken(orgId);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
