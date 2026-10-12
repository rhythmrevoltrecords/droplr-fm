/**
 * ESP sync — pure units. No database, no server, no network.
 *
 * Covers the bits that are easy to get subtly wrong: how a fan's email maps to a Mailchimp member
 * id (lowercased, trimmed, MD5), how the datacenter is read off a key, the per-org webhook token,
 * and the plan-table invariant that audience sync is paid-only and never offered on Free.
 */
process.env.JWT_SECRET ||= "test-secret-at-least-32-bytes-long-xx";
import { mailchimpDc, mailchimpMemberId } from "../src/lib/esp/mailchimp";
import { espWebhookToken, verifyEspWebhook } from "../src/lib/esp/webhook";
import { EspAuthError } from "../src/lib/esp/types";
import { PLAN_LIMITS, PLAN_ORDER } from "../src/lib/plans";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

// --- Mailchimp member id: lowercased + trimmed MD5 ---
check("member id matches Mailchimp's MD5 vector", mailchimpMemberId("test@example.com") === "55502f40dc8b7c769880b10874abc9d0", mailchimpMemberId("test@example.com"));
check("member id is case-insensitive", mailchimpMemberId("TEST@Example.com") === mailchimpMemberId("test@example.com"));
check("member id trims whitespace", mailchimpMemberId("  test@example.com  ") === mailchimpMemberId("test@example.com"));

// --- datacenter parsing ---
check("dc read from key suffix", mailchimpDc("demo-key-us21") === "us21");
let threw = false;
try { mailchimpDc("no-datacenter-here"); } catch (e) { threw = e instanceof EspAuthError; }
check("a key without a real dc suffix is rejected", threw);

// --- webhook token ---
const org = "org_abc123";
const tok = espWebhookToken(org);
check("webhook token is 32 chars", tok.length === 32, `${tok.length}`);
check("valid token verifies", verifyEspWebhook(org, tok));
check("tampered token is rejected", !verifyEspWebhook(org, tok.slice(0, 31) + (tok[31] === "a" ? "b" : "a")));
check("token for another org is rejected", !verifyEspWebhook(org, espWebhookToken("org_other")));
check("empty token is rejected", !verifyEspWebhook(org, ""));

// --- plan gating: paid only, never Free ---
check("Free does NOT get audience sync", PLAN_LIMITS.free.espSync === false);
for (const k of PLAN_ORDER) {
  if (k === "free") continue;
  check(`${k} gets audience sync`, PLAN_LIMITS[k].espSync === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
