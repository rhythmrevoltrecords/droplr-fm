/**
 * Pure checks for dashboard notices. No database, no server.
 *
 * The database-backed half — that one account can never see another's notice — lives in
 * scripts/test-security.ts, because that is where cross-tenant isolation is proven and a pure
 * suite cannot prove it. What is checked here is the input handling, which is where a notice
 * written by a human turns into something rendered in somebody else's browser.
 */
import { cleanMessage, MAX_SHOWN, TONES, toneOf } from "../src/lib/platform-messages";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- a message needs something in it ------------------------------------

check("an empty body is refused", cleanMessage({ body: "" }) === null);
check("a whitespace-only body is refused", cleanMessage({ body: "   \n\t " }) === null);
check("a missing body is refused", cleanMessage({}) === null);
check("a non-string body is refused", cleanMessage({ body: 42 }) === null);
check("a real body is accepted", cleanMessage({ body: "Hello" })?.body === "Hello");
check("the body is trimmed", cleanMessage({ body: "  Hello  " })?.body === "Hello");
check("line breaks inside the body survive", cleanMessage({ body: "one\n\ntwo" })?.body === "one\n\ntwo");

// ---- lengths are bounded, so one notice can't be a wall -----------------

check("the body is capped at 2000", cleanMessage({ body: "x".repeat(5000) })?.body.length === 2000);
check("the title is capped at 120", cleanMessage({ body: "b", title: "t".repeat(400) })?.title?.length === 120);
check("an empty title becomes null", cleanMessage({ body: "b", title: "   " })?.title === null);
check("a missing title becomes null", cleanMessage({ body: "b" })?.title === null);

// ---- the link is the injection surface, so it is the strict bit ---------

check("a https link is kept", cleanMessage({ body: "b", linkUrl: "https://droplr.fm/learn" })?.linkUrl === "https://droplr.fm/learn");
check("a http link is kept", cleanMessage({ body: "b", linkUrl: "http://example.com/" })?.linkUrl === "http://example.com/");
check("a javascript: link is dropped", cleanMessage({ body: "b", linkUrl: "javascript:alert(1)" })?.linkUrl === null);
check("a data: link is dropped", cleanMessage({ body: "b", linkUrl: "data:text/html,<script>alert(1)</script>" })?.linkUrl === null);
check("a vbscript: link is dropped", cleanMessage({ body: "b", linkUrl: "vbscript:msgbox(1)" })?.linkUrl === null);
check("a file: link is dropped", cleanMessage({ body: "b", linkUrl: "file:///etc/passwd" })?.linkUrl === null);
check("a relative link is dropped", cleanMessage({ body: "b", linkUrl: "/admin/settings/billing" })?.linkUrl === null);
check("a protocol-relative link is dropped", cleanMessage({ body: "b", linkUrl: "//evil.example" })?.linkUrl === null);
check("nonsense in the link field is dropped", cleanMessage({ body: "b", linkUrl: "not a url at all" })?.linkUrl === null);
check("a mixed-case JavaScript: link is dropped", cleanMessage({ body: "b", linkUrl: "JaVaScRiPt:alert(1)" })?.linkUrl === null);
check("a link with leading whitespace is still parsed", cleanMessage({ body: "b", linkUrl: "  https://droplr.fm  " })?.linkUrl === "https://droplr.fm/");

// ---- a link label only exists when there is a link ----------------------

check("no link means no label, even if one was typed", cleanMessage({ body: "b", linkLabel: "Click" })?.linkLabel === null);
check("a link with no label gets a default", cleanMessage({ body: "b", linkUrl: "https://droplr.fm" })?.linkLabel === "Read more");
check("a link label is kept", cleanMessage({ body: "b", linkUrl: "https://droplr.fm", linkLabel: "See what's new" })?.linkLabel === "See what's new");
check("a link label is capped at 60", cleanMessage({ body: "b", linkUrl: "https://droplr.fm", linkLabel: "L".repeat(200) })?.linkLabel?.length === 60);
check("a dropped link drops its label too", cleanMessage({ body: "b", linkUrl: "javascript:x", linkLabel: "Click" })?.linkLabel === null);

// ---- tone falls back rather than reaching the UI unknown ----------------

for (const t of TONES) check(`tone "${t}" survives`, toneOf(t) === t);
check("an unknown tone becomes info", toneOf("rainbow") === "info");
check("an empty tone becomes info", toneOf("") === "info");
check("a missing tone becomes info", cleanMessage({ body: "b" })?.tone === "info");
check("a good tone is kept", cleanMessage({ body: "b", tone: "good" })?.tone === "good");
check("a non-string tone becomes info", cleanMessage({ body: "b", tone: { evil: true } })?.tone === "info");

// ---- how many show at once ----------------------------------------------

check("at most a few notices show at once", MAX_SHOWN >= 1 && MAX_SHOWN <= 5, String(MAX_SHOWN));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
