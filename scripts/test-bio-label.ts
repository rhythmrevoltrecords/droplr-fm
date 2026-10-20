/**
 * The label badge on a linked artist's own bio page. Pure: no database, no server, no network.
 *
 * This one is not about layout. "Signed to Rhythm Revolt Records" is a **factual claim about a
 * business relationship**, published on a page the label does not control, with the label's own
 * logo next to it. Two ways it goes wrong and both are worse than a bug:
 *
 *   - it appears when it isn't true (a prospect the label is still talking to, or an artist who
 *     has left), and
 *   - it keeps appearing after it stops being true, because someone would have had to remember
 *     to take it down.
 *
 * So nothing about it is typed by hand and nothing is stored as a sentence. Every part is derived
 * from the label's own roster row on every render, and the rules below are what makes that safe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { labelBadgeLine, rosterRowAllowsBadge } from "../src/lib/bio-label";

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

const ME = "user_artist";
const row = (over: Partial<Parameters<typeof rosterRowAllowsBadge>[0]> = {}) =>
  ({ labelBadge: true, status: "active", linkedUserId: ME, ...over });

// ---- when the badge is allowed to exist ----------------------------------

check("an active, linked, permitted row allows it", rosterRowAllowsBadge(row(), ME));
check("the label can switch it off", !rosterRowAllowsBadge(row({ labelBadge: false }), ME));

// The two that would publish a false statement.
check("a PROSPECT never gets a badge", !rosterRowAllowsBadge(row({ status: "prospect" }), ME),
  "someone the label is still talking to is not signed to them");
check("an ALUMNI never gets a badge", !rosterRowAllowsBadge(row({ status: "alumni" }), ME),
  "a badge that outlives the deal is the whole risk");
check("an unknown status is not treated as active", !rosterRowAllowsBadge(row({ status: "" }), ME));

// The two that would publish someone else's relationship.
check("an unlinked row allows nothing", !rosterRowAllowsBadge(row({ linkedUserId: null }), ME));
check("a row linked to a DIFFERENT account allows nothing", !rosterRowAllowsBadge(row({ linkedUserId: "someone_else" }), ME),
  "a roster row is not a claim about whoever is looking at it");

// ---- what it says --------------------------------------------------------

check("a signing date earns the word signed", labelBadgeLine({ name: "Rhythm Revolt Records", signed: true }) === "Signed to Rhythm Revolt Records");
check("no signing date does not", labelBadgeLine({ name: "Rhythm Revolt Records", signed: false }) === "Releases on Rhythm Revolt Records");
check("the fallback never says signed", !labelBadgeLine({ name: "X", signed: false }).toLowerCase().includes("signed"),
  "an active roster row without a date is a handshake, not a contract droplr can assert");
check("the name is printed exactly as the label has it",
  labelBadgeLine({ name: "  spaced  ", signed: true }) === "Signed to   spaced  ");

// ---- both halves of the permission, in the server resolver ---------------

const server = code(read("src/lib/bio-label-server.ts"));
const pure = code(read("src/lib/bio-label.ts"));

check("the artist's half is required", /page\.labelBadge !== "on"/.test(server));
check("the label's half is required", server.includes("rosterRowAllowsBadge"));
check("only an artist organisation can show one", /org\.kind !== "artist"/.test(server),
  "a label page showing another label's badge should not be expressible");
check("the rows are found by the link, not by name", /linkedUserId: owner\.id/.test(server),
  "matching on a name would attach a badge to the wrong person");
check("the badge is derived per render, never stored as a sentence",
  !/labelBadgeLine/.test(server) && !pure.includes("prisma"),
  "a stored sentence is one nobody updates when the deal ends");
check("the pure module holds no database import", !pure.includes("@/lib/db"));

// A granted label's own link has to use THEIR domain, like the release block learned.
check("the label link honours their custom domain", server.includes("linkCustomDomain"));

// ---- the artist cannot grant themselves the label's mark -----------------

const artistsLib = code(read("src/lib/artists.ts"));
const selfStart = artistsLib.indexOf("const selfShape");
const labelStart = artistsLib.indexOf("const labelShape");
check("labelBadge is not in the artist's own profile schema",
  !artistsLib.slice(selfStart, labelStart).includes("labelBadge"),
  "an artist editing their own profile must not be able to permit the label's logo");
check("labelBadge is in the label-only schema", artistsLib.slice(labelStart).includes("labelBadge"));

// ---- the two ImagePurpose lists must not drift ---------------------------

// The client crop dialog keeps its own copy of this union on purpose: importing lib/images into
// a client component would pull sharp and the blob store into the browser bundle, which is the
// exact mistake that broke a production build once.
const purposes = (s: string) => [...s.matchAll(/"(cover|avatar|logo|press|background)"/g)].map((m) => m[1]);
const libList = new Set(purposes(read("src/lib/images.ts").split("\n").find((l) => l.includes("IMAGE_PURPOSES =")) ?? ""));
const clientList = new Set(purposes(read("src/components/admin/image-crop-dialog.tsx").split("\n").find((l) => l.includes("export type ImagePurpose")) ?? ""));
check("the server and client image-purpose lists agree",
  libList.size > 0 && libList.size === clientList.size && [...libList].every((p) => clientList.has(p)),
  `server ${[...libList].join(",")} vs client ${[...clientList].join(",")}`);
check("background is one of them", libList.has("background") && clientList.has("background"));

// ---- the background cannot make a page unreadable ------------------------

const css = code(read("src/app/globals.css"));
const shell = code(read("src/components/public/artwork-shell.tsx"));
check("a scrim is painted over the background", shell.includes("bio-bg-scrim") && css.includes(".bio-bg-scrim"));
check("the scrim has a light-theme strength of its own", css.includes(".shell-theme-light .bio-bg-scrim"));
check("the background is never blurred", !/bio-bg-scrim[\s\S]{0,200}blur/.test(css) && !/background\?\.(url|color)[\s\S]{0,300}blur-/.test(shell),
  "a full-screen blur was measured as the main LCP cost on these pages and removed once already");
check("the scrim sits above the image, not below it",
  shell.indexOf("bg-cover bg-center") < shell.indexOf("bio-bg-scrim"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
