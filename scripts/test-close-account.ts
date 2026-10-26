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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { closeConfirmationMatches } from "../src/lib/account-close";
import { RESERVED_SLUGS } from "../src/lib/utils";

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

const closeSrc = readFileSync("src/lib/account-close-server.ts", "utf8");
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


// ---- no client component may drag the database into the browser ---------
// This build actually broke. `close-account-form.tsx` is "use client" and imported the
// confirmation helper from a file that imported prisma, so webpack tried to bundle the Postgres
// driver for the browser and died on fs/dns/net/tls. `tsc --noEmit` passed the whole time, because
// it is a bundling boundary and not a type error \u2014 nothing in the toolchain says a word until
// Netlify spends a minute building and fails. So it gets checked here instead, for every client
// component in the codebase rather than just the one that bit.

const ALIAS = /from\s+"@\/(lib\/[\w./-]+)"/g;
const libFile = (mod: string) => {
  for (const ext of [".ts", ".tsx"]) {
    const f = `src/${mod}${ext}`;
    if (existsSync(f)) return f;
  }
  return null;
};
const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(ALIAS)].map((m) => libFile(m[1])).filter((f): f is string => !!f);

/** Every file under src that declares itself a client component. */
const clientFiles: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name) && /^["']use client["']/m.test(readFileSync(full, "utf8"))) clientFiles.push(full);
  }
};
walk("src");

check("the scan found client components at all", clientFiles.length > 5, `found ${clientFiles.length}`);

for (const entry of clientFiles) {
  const seen = new Set<string>();
  const queue = importsOf(entry);
  let path: string | null = null;
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (f === "src/lib/db.ts") { path = f; break; }
    queue.push(...importsOf(f));
  }
  check(`${entry.replace("src/", "")} does not reach lib/db`, path === null,
    "a client component importing prisma transitively breaks the webpack build; split the pure part out, as account-close.ts / account-close-server.ts does");
}

// ---- no server file may import a plain value from a client file -----------------------------
// This crashed production. /admin/agreements/new (a server page) imported EMPTY_AGREEMENT, a plain
// object, from agreement-form.tsx ("use client"). Across that boundary Next hands a server file a
// placeholder for anything a client file exports, so the form got no fields and threw on
// `title.trim()`. Types compile, the build passes, and nothing says a word until the page is
// opened. Components are fine to import (that's the point of the boundary); values aren't: put
// them in a lib file both sides can read.

const exportedValues = (file: string) =>
  new Set([...readFileSync(file, "utf8").matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]).filter((n) => !/^[A-Z][a-z]/.test(n)));
const clientValues = new Map(clientFiles.map((f) => [f, exportedValues(f)]));
const serverFiles: string[] = [];
const walkAll = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) walkAll(full);
    else if (/\.tsx?$/.test(e.name) && !clientValues.has(full)) serverFiles.push(full);
  }
};
walkAll("src");
const crossings: string[] = [];
for (const file of serverFiles) {
  for (const m of readFileSync(file, "utf8").matchAll(/import\s+\{([^}]*)\}\s+from\s+"@\/([\w./[\]-]+)"/g)) {
    const target = [".tsx", ".ts"].map((x) => `src/${m[2]}${x}`).find((f) => clientValues.has(f));
    if (!target) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim();
      if (!name || name.startsWith("type ")) continue;
      const local = name.split(/\s+as\s+/)[0].trim();
      if (clientValues.get(target)!.has(local)) crossings.push(`${file.replace("src/", "")} imports ${local} from ${target.replace("src/", "")}`);
    }
  }
}
check("the scan found server files to read", serverFiles.length > 50, `found ${serverFiles.length}`);
check("no server file imports a plain value from a \"use client\" file", crossings.length === 0, crossings.join("; "));

// droplr.fm/<slug> is a label's page, so a label owning the name of a real top-level page would sit
// on top of it. /split (split-sheet links) was reserved by hand when it was added; this makes every
// future one fail here instead of relying on remembering.
const topRoutes = readdirSync("src/app", { withFileTypes: true })
  .filter((e) => e.isDirectory() ? !/^[[(@_]/.test(e.name) : /\.(txt|xml|js|ico)$/.test(e.name))
  .map((e) => e.name);
const unreserved = topRoutes.filter((n) => !RESERVED_SLUGS.has(n));
check("every top-level page and file is a reserved slug", topRoutes.length > 20 && unreserved.length === 0, unreserved.join(", "));
check("split is reserved", RESERVED_SLUGS.has("split"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
