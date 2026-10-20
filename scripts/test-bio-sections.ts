/**
 * The order of the blocks on a bio page.
 *
 * One rule, and every test here is a way of trying to break it:
 *
 *   A SECTION CAN NEVER VANISH BECAUSE OF WHAT IS STORED.
 *
 * The failure modes are quiet. A key removed from the code leaves a stale token in every row that
 * has it. A key ADDED to the code is in no stored row at all, so a new block would be invisible
 * on every existing page until its owner happened to open the editor and press save — and nobody
 * would report that, because nobody knew the block existed.
 *
 * Pure functions plus source assertions. No database, no server.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIO_SECTIONS,
  SECTION_HINTS,
  SECTION_LABELS,
  isDefaultOrder,
  moveSection,
  sectionOrder,
  serialiseOrder,
  storedOrder,
  type BioSection,
} from "../src/lib/bio-sections";

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
const all = (o: BioSection[]) => BIO_SECTIONS.every((s) => o.includes(s));
const once = (o: BioSection[]) => new Set(o).size === o.length;
const complete = (o: BioSection[]) => all(o) && once(o) && o.length === BIO_SECTIONS.length;

// ---- nothing can be lost, whatever is stored ---------------------------------

check("no setting gives every section", complete(sectionOrder(null)));
check("no setting gives the default order", sectionOrder(null).join(",") === BIO_SECTIONS.join(","));
check("an empty string gives every section", complete(sectionOrder("")));
check("whitespace gives every section", complete(sectionOrder("   ")));
check("pure junk gives every section", complete(sectionOrder("nonsense,garbage,???")));
// The stale-token case: a key the code no longer has.
check("a key the code dropped is ignored", complete(sectionOrder("links,oldblock,release")));
check("…and the real keys around it are still honoured",
  sectionOrder("links,oldblock,release").slice(0, 2).join(",") === "links,release",
  sectionOrder("links,oldblock,release").join(","));
// The new-key case: the one nobody would report.
check("a key the string never mentioned is appended, not dropped",
  complete(sectionOrder("links")) && sectionOrder("links")[0] === "links",
  sectionOrder("links").join(","));
check("a half-written list still renders everything", complete(sectionOrder("subscribe,links")));
check("…in the order asked for, as far as it goes",
  sectionOrder("subscribe,links").slice(0, 2).join(",") === "subscribe,links");
// A duplicate would render the same block twice on a live page.
check("a duplicate is collapsed", complete(sectionOrder("links,links,release")));
check("separators and spacing are tolerated", complete(sectionOrder(" links , release ")));
check("case is not guessed at", complete(sectionOrder("LINKS,Release")));

// Every possible subset of the stored string still yields a complete page.
let subsetsOk = true;
const keys = [...BIO_SECTIONS];
for (let mask = 0; mask < 1 << keys.length; mask++) {
  const sub = keys.filter((_, i) => mask & (1 << i));
  if (!complete(sectionOrder(sub.join(",")))) { subsetsOk = false; break; }
}
check("every subset of stored keys still renders every section", subsetsOk);

// ---- a full order round-trips exactly ----------------------------------------

const reversed = [...BIO_SECTIONS].reverse().join(",");
check("a full order is kept exactly", sectionOrder(reversed).join(",") === reversed);
check("serialising is the same reconciliation", serialiseOrder(["links", "junk"]) === sectionOrder("links").join(","));

// ---- what gets written -------------------------------------------------------

check("the default is stored as nothing", storedOrder(BIO_SECTIONS.join(",")) === null,
  "storing the default would pin a page to this version's section list");
check("no value is stored as nothing", storedOrder(null) === null && storedOrder("") === null);
check("junk is stored as nothing", storedOrder("???") === null);
check("a real order is stored normalised", storedOrder(reversed) === reversed);
check("a partial order is stored complete", storedOrder("subscribe") === sectionOrder("subscribe").join(","));
check("the default is recognised", isDefaultOrder([...BIO_SECTIONS]) && !isDefaultOrder([...BIO_SECTIONS].reverse()));

// ---- the two buttons ---------------------------------------------------------

const base = [...BIO_SECTIONS] as BioSection[];
check("moving down swaps with the next", moveSection(base, 0, 1)[0] === base[1] && moveSection(base, 0, 1)[1] === base[0]);
check("moving up swaps with the previous", moveSection(base, 1, -1)[0] === base[1]);
check("moving the first up does nothing", moveSection(base, 0, -1).join(",") === base.join(","));
check("moving the last down does nothing", moveSection(base, base.length - 1, 1).join(",") === base.join(","));
check("an out-of-range index does nothing", moveSection(base, 99, 1).join(",") === base.join(","));
check("moving never loses a section", complete(moveSection(base, 1, 1)));
check("moving does not mutate the original", (() => { const b = [...base]; moveSection(b, 0, 1); return b.join(",") === base.join(","); })());

// ---- every section is nameable -----------------------------------------------

check("every section has a label", BIO_SECTIONS.every((s) => (SECTION_LABELS[s] ?? "").length > 2));
check("every section has a hint", BIO_SECTIONS.every((s) => (SECTION_HINTS[s] ?? "").length > 5));
// A page whose name sits under a mailing-list form is not a page anyone meant to build.
check("the hero is not orderable", !(BIO_SECTIONS as readonly string[]).includes("hero"));
check("the label badge is not orderable", !(BIO_SECTIONS as readonly string[]).includes("label"));

// ---- the page renders what it was given --------------------------------------

const view = code(read("src/components/public/bio-view.tsx"));
check("the view takes a required order", /order: BioSection\[\]/.test(view));
check("the view renders by mapping that order", /order\.map\(\(section\)/.test(view));
check("every section has a branch in the view",
  BIO_SECTIONS.every((s) => view.includes(`section === "${s}"`)),
  BIO_SECTIONS.filter((s) => !view.includes(`section === "${s}"`)).join(","));
// The hero is outside the map on purpose.
check("the hero renders outside the order", view.indexOf("<ArtworkHero") < view.indexOf("order.map"));

const route = code(read("src/components/public/bio-route.tsx"));
check("the public page reconciles before rendering", route.includes("sectionOrder(page.sectionOrder)"));
const form = code(read("src/components/admin/bio-form.tsx"));
check("the editor reconciles too, so the preview cannot disagree", form.includes("sectionOrder(v.sectionOrder)"));
check("the editor preview is given the same order", /order=\{order\}/.test(form));
const api = code(read("src/app/api/admin/bio/[id]/route.ts"));
check("the save route normalises before storing", api.includes("storedOrder(d.sectionOrder)"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
