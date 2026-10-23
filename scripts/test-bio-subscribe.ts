/**
 * The subscribe button on a bio page.
 *
 * The rule these tests defend, and the one that is easy to lose in a refactor:
 *
 *   A PAGE CAPTURE IS NOT AN IMPORT.
 *
 * Both live in FanContact. An import carries consent droplr never saw and starts unreachable; a
 * page capture is the fan's own act on wording droplr showed and stored. Every screen, count,
 * export and send has to tell them apart, and every one of them used to assume the table held
 * only imports.
 *
 * Pure functions plus source assertions. The audience behaviour itself needs a database and lives
 * in scripts/test-news.ts, where the "who may receive a news email" rules already are.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIO_CONSENT_SOURCE,
  BIO_EMAIL_MAX,
  BIO_SUBSCRIBE_TEXT_MAX,
  DEFAULT_SUBSCRIBE_TEXT,
  emailAcceptable,
  isPageCaptured,
  normaliseEmail,
  showSubscribe,
  subscribeButtonText,
  subscribeConsentLine,
  subscribeConsentNote,
} from "../src/lib/bio-subscribe";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- the switch is opt-in, and only "on" counts -------------------------------

check("a page with no setting does not collect addresses", !showSubscribe({}));
check("null does not collect addresses", !showSubscribe({ subscribe: null }));
check("an empty string does not collect addresses", !showSubscribe({ subscribe: "" }));
check('"on" collects addresses', showSubscribe({ subscribe: "on" }));
// Anything-truthy would mean a stray value turned collection on for a page nobody chose it for.
check("no other value turns it on", !showSubscribe({ subscribe: "yes" }) && !showSubscribe({ subscribe: "ON" }) && !showSubscribe({ subscribe: "1" }));

// ---- a page capture is distinguishable from an import ------------------------

check("a bio capture is recognised", isPageCaptured(BIO_CONSENT_SOURCE));
check("an import is not a page capture",
  !isPageCaptured("hypeddit") && !isPageCaptured("mailchimp") && !isPageCaptured("own-site") && !isPageCaptured("other"));
check("a missing source is not a page capture", !isPageCaptured(null) && !isPageCaptured(undefined) && !isPageCaptured(""));
// The whole carve-out keys off this one string. If it ever changes, these fail loudly rather
// than the news audience quietly dropping every page subscriber.
check("the source string is the one the SQL and the screens use", BIO_CONSENT_SOURCE === "bio");

// ---- addresses ---------------------------------------------------------------

check("an address is lowercased and trimmed", normaliseEmail("  Fan@Example.COM ") === "fan@example.com");
check("a missing address normalises to empty", normaliseEmail(null) === "" && normaliseEmail(undefined) === "");
check("a plain address is accepted", emailAcceptable("fan@example.com"));
check("an empty address is refused", !emailAcceptable("") && !emailAcceptable(null));
check("an address with no @ is refused", !emailAcceptable("fan.example.com"));
check("an address with no dot in the domain is refused", !emailAcceptable("fan@example"));
check("a one-letter TLD is refused", !emailAcceptable("fan@example.c"));
check("an address with a space is refused", !emailAcceptable("fan @example.com"));
check("case and padding do not change the verdict", emailAcceptable("  FAN@EXAMPLE.COM  "));
check("an over-long address is refused", !emailAcceptable(`${"a".repeat(BIO_EMAIL_MAX)}@example.com`));
check("an address exactly at the cap is accepted", emailAcceptable(`${"a".repeat(BIO_EMAIL_MAX - "@example.com".length)}@example.com`));

// ---- button wording ----------------------------------------------------------

check("no wording falls back to the default", subscribeButtonText(null) === DEFAULT_SUBSCRIBE_TEXT && subscribeButtonText("") === DEFAULT_SUBSCRIBE_TEXT);
check("whitespace-only wording falls back to the default", subscribeButtonText("   ") === DEFAULT_SUBSCRIBE_TEXT);
check("the owner's wording is used", subscribeButtonText("Join the list") === "Join the list");
check("wording is trimmed", subscribeButtonText("  Join  ") === "Join");
// A button is a fixed-width thing on a phone. An uncapped string wraps and breaks the page.
check("wording is capped", subscribeButtonText("x".repeat(100)).length === BIO_SUBSCRIBE_TEXT_MAX);
check("the default fits inside the cap", DEFAULT_SUBSCRIBE_TEXT.length <= BIO_SUBSCRIBE_TEXT_MAX);

// ---- what the fan agreed to -------------------------------------------------

const line = subscribeConsentLine("Rhythm Revolt Records");
check("the consent line names the account, not droplr", line.includes("Rhythm Revolt Records") && !/droplr/i.test(line));
// Spam Act 2003: a commercial message needs a working unsubscribe, and the fan should know it
// exists before they hand anything over, not after the first email.
check("the consent line promises an unsubscribe", /unsubscribe/i.test(line));
check("the stored note quotes the line verbatim", subscribeConsentNote("Rhythm Revolt Records").includes(line));
check("the stored note says where it was ticked", /bio page/i.test(subscribeConsentNote("X")));

// ---- the page asks before it stores -----------------------------------------

const view = read("src/components/public/bio-view.tsx");
check("the form requires the consent box", /name="consent"[\s\S]{0,120}required/.test(view));
check("the form requires the address", /name="email"[\s\S]{0,200}required/.test(view));
check("the consent line is read from the lib, not retyped in the view", view.includes("subscribeConsentLine(orgName)"));
check("the fan can reach the privacy policy from the form", /legal\/privacy/.test(view));
check("there is a honeypot field", /name="website"/.test(view));
// It asks the fan for something instead of giving them something, so it goes below what they
// opened the page for.
check("the form sits below the links", view.indexOf("page.links.map") < view.indexOf('name="bioPageId"'));
check("the form posts to the capture route", view.includes("/api/bio/subscribe"));
// A page being previewed in the admin must not write a real fan row.
check("the preview and the demo cannot submit", /action=\{inert \? undefined : "\/api\/bio\/subscribe"\}/.test(view) && /const inert = preview \|\| demo;/.test(view));

// ---- the route does not trust the page it was handed ------------------------

const route = code(read("src/app/api/bio/subscribe/route.ts"));
// A client component's props are public: the form being in the HTML proves nothing.
check("the route re-checks the page's own switch", route.includes("showSubscribe(page)"));
check("the route refuses an unpublished page", route.includes("!page.isPublic"));
check("the route requires the consent box", /form\?\.get\("consent"\) !== "yes"/.test(route));
check("the route validates the address itself", route.includes("emailAcceptable(email)"));
check("the route rate-limits by IP and by address", route.includes('ipKey("bio-subscribe"') && route.includes('emailKey("bio-subscribe"'));
check("the route honours an existing opt-out", route.includes("isOptedOut(email, page.organizationId)"));
// Anyone can type anyone's address. Showing a different page for an unsubscribed one would turn
// this form into a way to find out who unsubscribed.
check("an opted-out address sees the same page as a success", /isOptedOut[\s\S]{0,80}return ok\(\)/.test(route));
check("the row records which wording was shown", /consentVersion: BIO_SUBSCRIBE_CONSENT_VERSION/.test(route),
  "the import line alone is not enough: this has to be assigned on the row");
// Sharing the pre-save constant would stamp these rows with wording the fan never saw, and
// bumping it later would retroactively change what every existing record attests to.
check("the subscribe box does not borrow the pre-save consent version",
  !route.includes("FAN_EMAIL_CONSENT_VERSION"));
const legal = read("src/lib/legal.ts");
check("the subscribe wording has a version of its own", /BIO_SUBSCRIBE_CONSENT_VERSION = "[^"]+"/.test(legal));
check("the row records the wording verbatim", route.includes("subscribeConsentNote("));
check("the row is marked as a page capture", route.includes("consentSource: BIO_CONSENT_SOURCE"));
check("the row is mailable, not pending", /status: "mailable"/.test(route));
check("the row is marketing consent", /consentKind: "marketing"/.test(route));
// Leaving importId set would keep the row inside every count and screen labelled "imported".
check("the row carries no import id, on create and on update",
  (route.match(/importId: null/g) ?? []).length === 2,
  "an upsert has two branches; clearing it on only one leaves an upgraded import still counted as an import");
check("the row remembers which page captured it", route.includes("bioPageId: page.id"));

// ---- nothing calls a page capture an import ---------------------------------

const fans = code(read("src/lib/fans.ts"));
check("the imported list excludes page captures", /importedWhere[\s\S]{0,200}NOT: \{ consentSource: BIO_CONSENT_SOURCE \}/.test(fans));
check("there is a separate list for page captures", fans.includes("export async function listCaptured"));
check("the imported summary and the captured summary are different queries",
  fans.includes("importedSummary = (orgId: string) => summaryFor(importedWhere(orgId))") &&
  fans.includes("capturedSummary = (orgId: string) => summaryFor(capturedWhere(orgId))"));

const news = code(read("src/lib/news.ts"));
check("the imported mailable count excludes page captures", /importedMailableCount[\s\S]{0,300}NOT: \{ consentSource: BIO_CONSENT_SOURCE \}/.test(news));
check("the news audience carves page captures out of the import rule", news.includes('c."consentSource" = ${BIO_CONSENT_SOURCE}'));
// fan-consent owns the single definition of "has this address told this label to stop". A second
// copy in SQL is a copy that drifts.
check("the opt-out check is not re-implemented in SQL", news.includes("optedOutAmong(rows.map"));
check("the audience SQL does not carry its own opt-out predicate", !/'unsubscribed'[\s\S]{0,80}emailConsent/.test(news));

const page = code(read("src/app/admin/fans/page.tsx"));
check("the fans screen has a view for page captures", page.includes('show === "pages"'));
check("the fans screen has a tile for them", page.includes('label: "From your pages"'));
check("the imported view's copy is not shown over page captures",
  page.indexOf("Consent came with them, not with the tool") < page.indexOf("From your pages</CardTitle>"));

// ---- the editor tells the truth about what Free includes --------------------

const form = read("src/components/admin/bio-form.tsx");
// Never "exports free". The true version: every address is visible on Free, a file costs from
// A$12, and the whole list downloads on any plan at closure.
check("the editor does not claim the list exports on Free", !/exports? (for )?free/i.test(form));
check("the editor says the addresses are visible on any plan", /see every one of them on any plan/i.test(form));
check("the editor says a file starts at A$12", form.includes("A$12"));
check("the editor says the list comes out at closure", /close your account/i.test(form));
check("the editor says they are never in a release-day email", /never added to a release-day/i.test(form));
check("the editor shows the exact wording the fan will tick", form.includes("subscribeConsentLine(orgName)"));

// ---- every address the account can see, it can also take with it ------------

const exp = code(read("src/app/api/admin/fans/export/route.ts"));
const closeExp = code(read("src/app/api/admin/account/close/export/route.ts"));
check("the fan export includes contacts, not only pre-saves", /await fanExportRows\(/.test(exp),
  "assert the call, not the import: an unused import satisfies a name check");
check("the closure export includes contacts, not only pre-saves", /await fanExportRows\(/.test(closeExp),
  "assert the call, not the import");
check("the export says where each address came from", fans.includes("source: FanExportRow") || /source: also \?/.test(fans));
// One person, one row: two rows for one address means whoever loads it into a mailer emails twice.
check("an address that both pre-saved and subscribed is one row", /capturedByEmail\.delete/.test(fans));
check("the closure export is still not plan-gated", !closeExp.includes("csvExport"));
check("the paid export is still plan-gated", exp.includes("csvExport"));

// ---- the public disclosure names the new collection point --------------------

const privacy = read("src/app/legal/privacy/page.tsx");
check("the privacy policy names the subscribe box", /subscribe box on a bio page/i.test(privacy));
check("…and says a version of the wording is kept", /subscribe box on a bio page[\s\S]{0,400}version of the wording/i.test(privacy));
// A fan who hands over an address here has not pre-saved anything, and the policy has to say so
// rather than leaving them to assume the two are the same thing.
check("…and says it is not a pre-save", /subscribe box on a bio page[\s\S]{0,700}not a pre-save/i.test(privacy));
check("…and says who will be emailing them", /subscribe box on a bio page[\s\S]{0,600}not droplr\.fm/i.test(privacy));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
