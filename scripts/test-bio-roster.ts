/**
 * What a label may see of a linked artist's OWN bio page. Pure source checks: no database.
 *
 * This is the first feature to bend the rule lib/roster-grant states outright — the grant is
 * one-way, and "the label gets nothing of the artist's". It is allowed to bend only because a
 * page the artist has published is already readable by anyone holding the URL, so handing the
 * label that URL gives away nothing they had not already given away.
 *
 * Everything below is a limit on how far it bends. If one of these fails, the feature has quietly
 * become "the label can see the artist's account", which is a different product and not one
 * anybody agreed to.
 */
import { readFileSync } from "node:fs";
import { bioPageLimit } from "../src/lib/bio";
import { join } from "node:path";

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

const libFull = code(read("src/lib/bio-roster.ts"));
// Scoped to rosterBioPages: the file holds a second function with the same words in it, and a
// whole-file match would have passed while this query had no status filter at all.
const lib = libFull.slice(libFull.indexOf("export async function rosterBioPages"), libFull.indexOf("export async function linkedLabelNames"));
const list = code(read("src/app/admin/bio/page.tsx"));
const profile = code(read("src/app/admin/artists/[id]/page.tsx"));
const form = code(read("src/components/admin/bio-form.tsx"));

// ---- the four limits -----------------------------------------------------

check("public pages only", /isPublic: true/.test(lib),
  "a page with Public unticked must stay invisible to the label — that is what the box means");
check("nothing is selected that could leak a number",
  !/views: true|clicks: true|_count/.test(lib),
  "views and clicks are the artist's own audience data");
check("the select names its fields rather than pulling whole rows",
  /select: \{/.test(lib) && !/include: \{ links/.test(lib));
check("active roster rows only", /status: "active"/.test(lib),
  "a prospect is not their artist yet and an alumni is not their artist any more");
check("linked accounts only", /linkedUserId: \{ not: null \}/.test(lib),
  "an unlinked roster row is just a name the label typed");

// ---- read-only, everywhere it is shown -----------------------------------

// The label's own pages link to /admin/bio/<id>, which is the editor. A page belonging to someone
// else must never get one of those links: the route would 404 on the tenant check anyway, but an
// edit link that 404s is a promise the UI should not have made.
const theirsBlock = list.slice(list.indexOf("theirs.length > 0"));
check("the artists' section exists", theirsBlock.length > 0);
check("no edit links on their pages", !/href=\{`\/admin\/bio\/\$\{p\.id\}`\}/.test(theirsBlock),
  "their page is theirs to edit");
check("their cards open the public URL instead", /href=\{p\.url\}/.test(theirsBlock));
check("no numbers rendered on their cards", !/views|clicks/.test(theirsBlock));
check("each one names the artist and says they made it",
  /\{p\.artistName\}/.test(theirsBlock) && /Made by the artist/.test(theirsBlock));
// The label needs two facts: a page exists, and here is its link. Anything more is the label
// looking at the artist's page from inside their own account.
check("no preview of their page is rendered", !/<img/.test(theirsBlock),
  "the artwork and a hero image would be a preview, not a reference");
check("the public link is shown and copyable", /\{p\.url\}/.test(theirsBlock) && /CopyButton value=\{p\.url\}/.test(theirsBlock));
check("the label's own pages say so too", /Made by you/.test(list));
check("an artist account never sees this section at all",
  /kind === "artist" \? Promise\.resolve\(\[\]\) :/.test(list),
  "one artist must not see another's through it");

check("the roster profile shows it read-only too", /Their bio link/.test(profile) && !/\/admin\/bio\/\$\{/.test(profile.slice(profile.indexOf("Their bio link"))));

// ---- and the artist is told ----------------------------------------------

check("the artist's own editor names the labels that can see it", /linkedLabels\.join\(" and "\)/.test(form));
check("the names the artist is shown come from active rosters only",
  /status: "active"/.test(libFull.slice(libFull.indexOf("export async function linkedLabelNames"))));
check("it says they cannot edit it", /can&apos;t edit it|cannot edit it/.test(form));
check("it says the numbers stay theirs", /views and clicks stay yours/.test(form));
check("it says unticking Public removes it from their side",
  /disappears\s+from their side|from their side too/.test(form));

// ---- one page per artist -------------------------------------------------
//
// An artist is one person with one page. A second one splits their own audience between two
// links and neither ends up being the one in their bio. A label runs a roster and needs one each.
{
  check("an artist account is capped at one", bioPageLimit("artist") === 1);
  check("a label account is not capped", bioPageLimit("label") === Infinity && bioPageLimit(null) === Infinity);
  const create = code(read("src/app/api/admin/bio/route.ts"));
  check("the cap is enforced on the server, not just in the UI",
    /bioPageLimit\(user\.organization\.kind\)/.test(create) && /status: 409/.test(create),
    "hiding a button is not a limit");
  check("it counts before it writes", create.indexOf("bioPage.count") < create.indexOf("bioPage.create"));
  check("the list hides the button at the cap", /pages\.length < bioPageLimit/.test(code(read("src/app/admin/bio/page.tsx"))));
}

// ---- words a person outside a CMS would use ------------------------------
{
  const screens = [
    "src/components/admin/bio-form.tsx",
    "src/components/admin/settings-forms.tsx",
    "src/components/admin/release-create-form.tsx",
    "src/components/admin/release-settings-form.tsx",
  ];
  for (const f of screens) {
    check(`${f} never labels a field "Slug"`, !/>Slug<|field\("slug", "Slug"\)|"Slug"/.test(code(read(f))),
      "nobody outside a CMS knows what a slug is");
  }
  check("the bio page shows the address it is building",
    /droplr\.fm\/b\//.test(read("src/components/admin/bio-form.tsx")),
    "the clearest label for a URL field is the URL");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
