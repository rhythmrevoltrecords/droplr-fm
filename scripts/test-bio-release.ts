/**
 * Pure checks for the bio page's release block. No database, no server, no network.
 *
 * The clock is the whole subject, so every assertion here uses a fixed fake `now` and nothing in
 * the module under test is allowed a default one. A default would be evaluated once when the
 * module loads and freeze the block at build time — which is precisely the failure this feature
 * exists to prevent, since the entire pitch is "the page updates itself".
 *
 * The second thing it guards is the quiet one: this block is an unattended claim about a release.
 * "Out now" on a record that isn't out, or a gated download pack announced as a release, is the
 * page lying to a fan with nobody watching.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIO_RELEASE_LIMIT,
  OUT_NOW_DAYS,
  bioReleaseAction,
  bioReleaseEyebrow,
  pickBioRelease,
  pickBioReleases,
  type BioReleaseRow,
} from "../src/lib/bio-release";

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

const DAY = 86_400_000;
const NOW = new Date("2026-10-20T09:00:00+10:00");
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

let n = 0;
const row = (over: Partial<BioReleaseRow> = {}): BioReleaseRow => ({
  id: `r${++n}`,
  slug: `slug-${n}`,
  title: `Track ${n}`,
  artistName: "Nathan Hill",
  coverUrl: "https://example.com/c.jpg",
  accentColor: "#bb664b",
  releaseDate: at(-1),
  isPublic: true,
  kind: "release",
  ...over,
});

// ---- nothing to show -----------------------------------------------------

check("no releases at all shows nothing", pickBioRelease([], NOW) === null);
check("a page whose only release is private shows nothing", pickBioRelease([row({ isPublic: false })], NOW) === null);
check("a page whose only release is a download pack shows nothing", pickBioRelease([row({ kind: "download" })], NOW) === null);
check("private and download together still show nothing",
  pickBioRelease([row({ isPublic: false }), row({ kind: "download" })], NOW) === null);

// ---- which one wins ------------------------------------------------------

const soon = row({ releaseDate: at(5), title: "Soon" });
const later = row({ releaseDate: at(40), title: "Later" });
const recent = row({ releaseDate: at(-3), title: "Recent" });
const old = row({ releaseDate: at(-400), title: "Old" });

check("an upcoming release beats a released one",
  pickBioRelease([recent, soon], NOW)?.release.title === "Soon");
check("the SOONEST upcoming wins, not the furthest away",
  pickBioRelease([later, soon], NOW)?.release.title === "Soon",
  pickBioRelease([later, soon], NOW)?.release.title);
check("input order does not change the answer",
  pickBioRelease([soon, later, recent], NOW)?.release.title === pickBioRelease([recent, later, soon], NOW)?.release.title);
check("with nothing upcoming, the most recent wins",
  pickBioRelease([old, recent], NOW)?.release.title === "Recent");
check("an upcoming download pack never wins",
  pickBioRelease([row({ releaseDate: at(5), kind: "download", title: "Pack" }), recent], NOW)?.release.title === "Recent");
check("an upcoming private release never wins",
  pickBioRelease([row({ releaseDate: at(5), isPublic: false }), recent], NOW)?.release.title === "Recent");

// ---- the whole list, and the order it comes in ---------------------------

// The order IS the feature: an artist never reorders this. A pre-save has a deadline and nothing
// else on the page does, so upcoming goes above released however old or new the released ones are.
{
  const list = pickBioReleases([old, recent, later, soon], NOW);
  check("upcoming come first, soonest at the top",
    list.slice(0, 2).map((c) => c.release.title).join(",") === "Soon,Later",
    list.map((c) => c.release.title).join(","));
  check("then released, newest first",
    list.slice(2).map((c) => c.release.title).join(",") === "Recent,Old",
    list.map((c) => c.release.title).join(","));
  check("every row carries its own state", list.map((c) => c.state).join(",") === "upcoming,upcoming,out,latest",
    list.map((c) => c.state).join(","));
  check("a year-old record still appears, just last", list.some((c) => c.release.title === "Old"));
}
check("input order never changes the result",
  pickBioReleases([old, soon, recent, later], NOW).map((c) => c.release.title).join(",") ===
  pickBioReleases([later, recent, soon, old], NOW).map((c) => c.release.title).join(","));
check("private releases and download packs stay out of the list",
  pickBioReleases([row({ isPublic: false }), row({ kind: "download" }), recent], NOW).length === 1);
check("nothing to show is an empty list, not a row", pickBioReleases([], NOW).length === 0);

// A bio page is not a discography, and every row is another cover image on a page whose load
// time was measured and fixed once already.
check("the list is capped", BIO_RELEASE_LIMIT > 0 && BIO_RELEASE_LIMIT <= 20, String(BIO_RELEASE_LIMIT));
{
  const many = Array.from({ length: BIO_RELEASE_LIMIT + 9 }, (_, i) => row({ releaseDate: at(-i - 1) }));
  check("more releases than the cap returns exactly the cap", pickBioReleases(many, NOW).length === BIO_RELEASE_LIMIT);
  check("the cap keeps the newest, not whichever came back first",
    pickBioReleases(many, NOW)[0].release.releaseDate.getTime() === at(-1).getTime());
}
check("the single-release helper is the top of the same list",
  pickBioRelease([old, recent, soon], NOW)?.release.title === pickBioReleases([old, recent, soon], NOW)[0].release.title);

// ---- the three states ----------------------------------------------------

check("a future release is upcoming", pickBioRelease([soon], NOW)?.state === "upcoming");
check("released yesterday is out", pickBioRelease([row({ releaseDate: at(-1) })], NOW)?.state === "out");
check(`released ${OUT_NOW_DAYS} days ago is still out`,
  pickBioRelease([row({ releaseDate: at(-OUT_NOW_DAYS) })], NOW)?.state === "out");
check(`released ${OUT_NOW_DAYS + 1} days ago is no longer out`,
  pickBioRelease([row({ releaseDate: at(-OUT_NOW_DAYS - 1) })], NOW)?.state === "latest");
check("a year-old release is latest, not out", pickBioRelease([old], NOW)?.state === "latest");

// The boundary nobody tests and everybody gets wrong: the release instant itself.
check("at the exact release instant it is out, not upcoming",
  pickBioRelease([row({ releaseDate: NOW })], NOW)?.state === "out");
check("one millisecond before the release instant it is still upcoming",
  pickBioRelease([row({ releaseDate: new Date(NOW.getTime() + 1) })], NOW)?.state === "upcoming");

// The same rows, read at three different moments: this is the whole feature.
const unchanging = [row({ releaseDate: at(3), title: "Dropping" })];
check("before release day the page says upcoming", pickBioRelease(unchanging, at(0))?.state === "upcoming");
check("on release day the same rows say out", pickBioRelease(unchanging, at(3))?.state === "out");
check("a month later the same rows say latest", pickBioRelease(unchanging, at(33))?.state === "latest");

// ---- what it says --------------------------------------------------------

const BNE = "Australia/Brisbane";
check("an upcoming release prints its date", bioReleaseEyebrow("upcoming", new Date("2026-11-08T00:00:00+10:00"), BNE) === "Out 8 November",
  bioReleaseEyebrow("upcoming", new Date("2026-11-08T00:00:00+10:00"), BNE));
check("a just-released one says Out now", bioReleaseEyebrow("out", at(-1), BNE) === "Out now");
check("an older one says Latest release", bioReleaseEyebrow("latest", at(-400), BNE) === "Latest release");
check("the date prints in the label's zone, not UTC",
  bioReleaseEyebrow("upcoming", new Date("2026-11-08T00:00:00+10:00"), BNE) === "Out 8 November");
check("a missing timezone falls back to Brisbane rather than throwing",
  bioReleaseEyebrow("upcoming", new Date("2026-11-08T00:00:00+10:00"), null) === "Out 8 November");
check("an upcoming release offers a pre-save", bioReleaseAction("upcoming") === "Pre-save");
check("a released one offers a listen", bioReleaseAction("out") === "Listen" && bioReleaseAction("latest") === "Listen");
check("nothing ever says 'out now' about a release that isn't out",
  bioReleaseEyebrow("upcoming", at(5), BNE).toLowerCase().includes("out now") === false);

// ---- no hidden clock -----------------------------------------------------

const lib = code(read("src/lib/bio-release.ts"));
check("the pure module never calls new Date() itself", !lib.includes("new Date("), "a default clock freezes at build time");
check("the pure module imports no database", !lib.includes("@/lib/db") && !lib.includes("prisma"));
check("`now` is a required argument, not a defaulted one", !/now\s*[:=][^)]*=\s*new Date/.test(lib));

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261026000000_bio_release_block/migration.sql").replace(/^\s*--.*$/gm, "");

// ---- the server half and the admin preview share one resolver ------------

const server = code(read("src/lib/bio-release-server.ts"));
const route = code(read("src/components/public/bio-route.tsx"));
const edit = code(read("src/app/admin/bio/[id]/page.tsx"));
check("the public page resolves through the shared resolver", route.includes("bioReleaseFor("));
check("the admin preview resolves through the same one", edit.includes("bioReleaseFor("));
check("the public page no longer queries releases itself", !route.includes("prisma.release.findMany"));
check("the resolver filters out download packs in SQL", server.includes('kind: "release"'));
check("the resolver fetches more rows than it shows, so the re-sort can't miss one",
  /take: BIO_RELEASE_LIMIT \* \d+/.test(server),
  "a date-ordered fetch of exactly the limit could drop an upcoming release that belongs at the top");
check("every row's link is built from its OWN organisation",
  /rows\.find\(\(r\) => r\.id === choice\.release\.id\)!\.organization/.test(server),
  "a label release on an artist's page lives on the label's domain");
check("the resolver filters out private releases in SQL", server.includes("isPublic: true"));
check("the resolver scopes to the organisation", server.includes("organizationId: page.organizationId"));
check("the resolver scopes to the artist when the page has one", server.includes("page.artistProfileId"));

// ---- the artist's own account ---------------------------------------------

// An artist signed to a label has their records in the LABEL's organisation. Scoping their own
// bio page to their own org alone would leave it empty while their dashboard showed those same
// releases through the roster grant — droplr knowing they are theirs on one screen and not the
// other. The grant is reused rather than re-derived: it is already audited as read-only,
// one-way and limited to releases that name them.
check("granted releases are reused from lib/roster-grant, not re-derived",
  server.includes("grantedReleaseWhere") && server.includes("grantsFor"));
check("the grant branch applies only to an artist organisation", /orgKind !== "artist"\) return null/.test(server),
  "a label's page must never pull in another label's catalogue");
check("the grant is resolved from the account owner", /role: "owner"/.test(server));
check("both branches still exclude downloads and private releases",
  /where: \{ kind: "release", isPublic: true, \.\.\.\(granted \? \{ OR: \[own, granted\] \} : own\) \}/.test(server),
  "a release its label held back must stay held back wherever it would appear");

// A granted release lives in the label's org, so its link has to carry the LABEL's slug and
// custom domain. Building it from the page's own org would send fans to a 404 on the artist's
// domain, which is the quiet way this feature breaks.
check("the link is built from the release's own organisation", server.includes("publicReleaseUrl(owner,"));
check("the release query selects that organisation", /organization: \{ select: \{ slug: true, customDomain: true/.test(server));
// Opt-in, not opt-out. A default of "show" would have published a release nobody chose the
// moment this deployed — including, on a page with no artist set, another artist's record.
check("the block is opt-in: anything but \"on\" shows nothing", /releaseBlock !== "on"\) return \[\]/.test(server));
check("the migration gives releaseBlock no default, so existing pages stay off", !/releaseBlock[^;]*DEFAULT/i.test(migration));
check("a new page is created with the block on, having shown a preview first",
  code(read("src/app/admin/bio/new/page.tsx")).includes('releaseBlock: "on"'));
check("the edit page resolves the preview as if it were on, so the offer is honest",
  /bioReleaseFor\(\{ \.\.\.page, releaseBlock: "on" \}/.test(edit));

// ---- the column and the tenant check -------------------------------------

const api = code(read("src/app/api/admin/bio/[id]/route.ts"));
const create = code(read("src/app/api/admin/bio/route.ts"));

check("BioPage has both columns, nullable", /model BioPage[\s\S]*?artistProfileId String\?[\s\S]*?releaseBlock   String\?[\s\S]*?\n}/.test(schema));
check("the artist link is ON DELETE SET NULL in the schema", /artistProfile   Artist\?\s+@relation\([^)]*onDelete: SetNull/.test(schema));
check("the migration is idempotent", (migration.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length === 2);
check("the migration adds the index idempotently", migration.includes("CREATE INDEX IF NOT EXISTS"));
check("the foreign key is guarded against re-running", migration.includes("duplicate_object"));
check("the foreign key sets null rather than cascading a delete", /REFERENCES "Artist"[^;]*ON DELETE SET NULL/.test(migration));
check("the migration touches only BioPage", [...migration.matchAll(/ALTER TABLE "(\w+)"/g)].every((m) => m[1] === "BioPage"));

// A cuid from another label's roster must not be accepted: it would scope this page's block to
// releases that are not this organisation's. A zod cuid check does not catch that.
check("PATCH checks the artist belongs to this organisation", /artistProfileId[\s\S]{0,400}organizationId: g\.user\.organizationId/.test(api));
check("POST checks the same thing", /artistProfileId[\s\S]{0,300}organizationId: user\.organizationId/.test(create));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
