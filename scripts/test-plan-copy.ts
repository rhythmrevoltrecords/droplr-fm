/**
 * Does the plan table admit what each plan can actually do? No database, no server, no network.
 *
 * This suite exists because of a real miss. `newsEmails` was true on Artist, Pro and Label, and the
 * feature bullets named it only on Artist Pro. Nothing was broken — the feature worked, the gate
 * worked, the tests passed — and an AI search engine reading the pricing page concluded, twice and
 * confidently, that droplr has no newsletter and you must export to Mailchimp. It was reading our
 * copy correctly. A gated feature nobody can see on the plan table is a feature nobody upgrades for.
 *
 * So: for every boolean capability, every plan that HAS it must say so somewhere a buyer can read,
 * and no plan may advertise something it does not have. Inheritance counts — "Everything in X"
 * means X's bullets are on the page for that plan too.
 */
import { planFeatures, releasesLine, emailsLine, artistsLine } from "../src/lib/plan-copy";
import { PLAN_LIMITS, PLAN_ORDER, type PlanKey } from "../src/lib/plans";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

/** "Everything in Artist" on Artist Pro means Artist's bullets are visible there too. */
const INHERITS: Partial<Record<PlanKey, PlanKey>> = {
  artist_pro: "artist",
  label: "pro",
  enterprise: "label",
};

function effectiveFeatures(k: PlanKey): string[] {
  const own = planFeatures(k);
  const parent = INHERITS[k];
  return parent ? [...own, ...effectiveFeatures(parent)] : own;
}

const text = (k: PlanKey) => effectiveFeatures(k).join(" • ").toLowerCase();

/**
 * One phrase per capability that must appear when the flag is on. Deliberately loose: the test
 * guards against silence, not against a particular wording.
 */
const SAYS: { flag: keyof typeof PLAN_LIMITS.free; needle: RegExp; label: string }[] = [
  { flag: "newsEmails", needle: /news email/, label: "news emails" },
  { flag: "csvExport", needle: /csv export/, label: "CSV export" },
  { flag: "customDomain", needle: /custom domain/, label: "custom domain" },
  { flag: "contests", needle: /contest/, label: "remix contests" },
  { flag: "pixels", needle: /pixel/, label: "pixels" },
  { flag: "qr", needle: /qr code/, label: "QR codes" },
  { flag: "removeBranding", needle: /(remove|no) droplr\.fm branding/, label: "branding removal" },
  { flag: "byoSpotify", needle: /spotify/, label: "BYO Spotify" },
];

// ---- every plan that has it, says it --------------------------------------

for (const { flag, needle, label } of SAYS) {
  for (const k of PLAN_ORDER) {
    const has = PLAN_LIMITS[k][flag] === true;
    if (!has) continue;
    check(`${k} has ${label} and says so`, needle.test(text(k)),
      `${flag} is true on ${k} but no bullet mentions it, on the plan or anything it inherits`);
  }
}

// ---- and nothing claims what it does not have -----------------------------
// Only the plan's OWN bullets: an inherited line is the parent's claim, not this plan's.

for (const { flag, needle, label } of SAYS) {
  for (const k of PLAN_ORDER) {
    if (PLAN_LIMITS[k][flag] === true) continue;
    const own = planFeatures(k).join(" • ").toLowerCase();
    check(`${k} does not advertise ${label}`, !needle.test(own),
      `${flag} is false on ${k} but a bullet mentions it`);
  }
}

// ---- the numbers on the page are the numbers in the limits ---------------

for (const k of PLAN_ORDER) {
  const lim = PLAN_LIMITS[k];
  if (lim.releases !== Infinity) {
    check(`${k} prints its real release limit`, releasesLine(k).includes(String(lim.releases)));
  }
  if (lim.releaseEmails !== Infinity) {
    check(`${k} prints its real release-email cap`, emailsLine(k).includes(String(lim.releaseEmails)));
  }
  if (lim.artists !== Infinity && lim.artists > 1) {
    check(`${k} prints its real artist count`, artistsLine(k).includes(String(lim.artists)));
  }
  check(`${k} has bullets at all`, planFeatures(k).length > 0);
}

// The limit is a rolling 365 days (releaseWindowStart), and "a year" read as a calendar-year reset
// to an AI summarising the page - and would read that way to a buyer planning their year.
check(
  "a capped release line says the window is rolling, not a calendar year",
  PLAN_ORDER.filter((k) => PLAN_LIMITS[k].releases !== Infinity).every((k) => /in any 12 months/.test(releasesLine(k))),
  PLAN_ORDER.filter((k) => PLAN_LIMITS[k].releases !== Infinity).map((k) => releasesLine(k)).join(" / "),
);

// ---- the free plan's promise, which is load-bearing in outreach ----------
// "You can SEE every address on Free" is true; "it exports free" is not, and has to stay not said.
check("Free does not claim CSV export", !/csv/.test(planFeatures("free").join(" ").toLowerCase()));
check("Free really does have csvExport off", PLAN_LIMITS.free.csvExport === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
