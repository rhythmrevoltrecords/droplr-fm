/**
 * Closing an account. No database, no server, no network.
 *
 * The check that matters here is the schema scan at the bottom. Every org-scoped model cascades
 * from Organization except `WaitlistFeature`, which carries an `organizationId` with no foreign key
 * behind it — so it survives the delete silently and leaves rows pointing at an organisation that
 * no longer exists. `closeAccount` removes it by hand. The day someone adds a second model like
 * that, nothing fails: the delete succeeds, the orphan sits there, and nobody finds out. This
 * suite is what finds out.
 */
import { readFileSync } from "node:fs";
import { closeConfirmationMatches } from "../src/lib/account-close";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}


/**
 * Strip comments before scanning. The first run of this suite failed on its own prose: the export
 * route's comment explains that csvExport is deliberately not checked, and the API route's comment
 * says the flow offers no discount. Both are the right words in the right place, and a scan that
 * reads them as code is a scan that teaches you to stop writing comments.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// ---- the typed confirmation ----------------------------------------------

check("exact name matches", closeConfirmationMatches("Rhythm Revolt Records", "Rhythm Revolt Records"));
check("surrounding space is forgiven", closeConfirmationMatches("  Rhythm Revolt Records  ", "Rhythm Revolt Records"));
check("case is forgiven", closeConfirmationMatches("rhythm revolt records", "Rhythm Revolt Records"));
check("a different name does not match", !closeConfirmationMatches("Rhythm Revolt", "Rhythm Revolt Records"));
check("a prefix does not match", !closeConfirmationMatches("Rhythm", "Rhythm Revolt Records"));
check("empty does not match", !closeConfirmationMatches("", "Rhythm Revolt Records"));
check("whitespace does not match", !closeConfirmationMatches("   ", "Rhythm Revolt Records"));
// An account with a blank name must not become a one-click delete for anyone who submits "".
check("an empty account name can never be confirmed", !closeConfirmationMatches("", ""));
check("an empty account name is not matched by whitespace", !closeConfirmationMatches("  ", "  "));

// ---- nothing is left behind ----------------------------------------------

const schema = readFileSync("prisma/schema.prisma", "utf8");
const models = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], body: m[2] }));

/** Models with an organizationId that `closeAccount` deletes by hand, because no FK will. */
const MANUAL = new Set(["WaitlistFeature"]);

const orgScoped = models.filter((m) => /\borganizationId\b/.test(m.body));
check("the scan found org-scoped models at all", orgScoped.length > 5, `found ${orgScoped.length}`);

for (const m of orgScoped) {
  const rel = m.body.split("\n").filter((l) => /Organization\??\s+@relation/.test(l));
  const cascades = rel.length > 0 && rel.every((l) => l.includes("onDelete: Cascade"));
  if (MANUAL.has(m.name)) {
    check(`${m.name} is still the hand-deleted one`, !cascades,
      "it cascades now, so remove it from MANUAL here and from closeAccount");
    continue;
  }
  check(`${m.name} cascades from Organization`, cascades,
    "add it to closeAccount's hand-deleted list and to MANUAL in this file, or give it onDelete: Cascade");
}

const closeSrc = readFileSync("src/lib/account-close.ts", "utf8");
for (const name of MANUAL) {
  const camel = name[0].toLowerCase() + name.slice(1);
  check(`closeAccount deletes ${name}`, closeSrc.includes(`prisma.${camel}.deleteMany`),
    "the schema says nothing will cascade it");
}

// ---- the export gate is bypassed on purpose, and only here ---------------

const exportSrc = code(readFileSync("src/app/api/admin/account/close/export/route.ts", "utf8"));
check("the closing export does not check csvExport", !/csvExport/.test(exportSrc));
check("the closing export is owner-only", /role !== "owner"/.test(exportSrc));
check("the closing export is not cached", /no-store/.test(exportSrc));

const normalExport = code(readFileSync("src/app/api/admin/fans/export/route.ts", "utf8"));
check("the everyday export still checks csvExport", /csvExport/.test(normalExport));

// ---- leaving is not a funnel ---------------------------------------------
// If a retention offer, a discount or a second confirmation ever lands in this flow, it should be a
// deliberate decision someone makes while deleting this check, not something that drifts in.

const flow = [
  "src/app/admin/settings/account/close/page.tsx",
  "src/components/admin/close-account-form.tsx",
  "src/app/api/admin/account/close/route.ts",
].map((f) => code(readFileSync(f, "utf8"))).join("\n").toLowerCase();

for (const word of ["discount", "% off", "special offer", "are you sure you want to leave"]) {
  check(`the close flow offers no "${word}"`, !flow.includes(word));
}
check("the close flow does say what breaks", flow.includes("stops working"));
check("the close flow points at cancelling instead", flow.includes("/admin/settings/billing"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
