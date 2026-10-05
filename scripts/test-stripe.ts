/**
 * Pure checks on the Stripe API version pin. No network, no database, no Stripe key.
 *
 * There is one regression this guards against, and it is subtle enough to have already happened
 * once: `new Stripe(key)` with no `apiVersion` does not mean "no version" — stripe-node falls back
 * to the version the installed package pins and sends it as the `Stripe-Version` header. So
 * dropping the option, or letting a dependency bump carry the version along with it, changes the
 * API behind live billing without anything in the diff saying so.
 *
 * Deliberately NOT asserted: that the pin equals the installed SDK's own version. They are supposed
 * to be able to differ — that is the whole reason for pinning. A test that demanded they match
 * would turn every Stripe upgrade red for the wrong reason.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { STRIPE_API_VERSION } from "../src/lib/stripe";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const raw = readFileSync("src/lib/stripe.ts", "utf8");

/**
 * Comments are stripped before anything is counted.
 *
 * The first version of this suite didn't, and failed against correct code: the doc comment above
 * the constructor quotes the very anti-pattern being tested for, so the scanner found the example
 * instead of the code. A source-reading guard has to read source, not prose.
 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check("the API version is pinned to a real Stripe version string",
  /^\d{4}-\d{2}-\d{2}\.[a-z]+$/.test(STRIPE_API_VERSION), STRIPE_API_VERSION);

// The constructor call itself, not just the constant existing somewhere in the file.
const ctor = src.match(/new Stripe\([^)]*\)/s)?.[0] ?? "";
check("the Stripe client is constructed with an apiVersion",
  /apiVersion\s*:/.test(ctor),
  ctor ? ctor.replace(/\s+/g, " ") : "no `new Stripe(...)` found");
check("the constructor uses the exported constant rather than a loose literal",
  /apiVersion\s*:\s*STRIPE_API_VERSION/.test(ctor), ctor.replace(/\s+/g, " "));
check("there is exactly one Stripe client constructed in this file",
  (src.match(/new Stripe\(/g) ?? []).length === 1);

// Nothing else should build its own client and quietly skip the pin.
const others = execSync("grep -rl 'new Stripe(' src/ || true", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
check("no other file constructs a Stripe client",
  others.length === 1 && others[0].endsWith("src/lib/stripe.ts"), others.join(", ") || "none");

// The comment block is load-bearing here: the next person to touch this needs to know why a cast
// is sitting on a string literal.
check("the pin explains itself", /Stripe-Version/.test(raw) && /pinned on purpose|pinning/i.test(raw));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
