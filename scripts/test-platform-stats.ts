/**
 * Pure checks on the platform totals' date and exclusion logic. No database, no server.
 *
 * These numbers get quoted to partners, so the failure mode here isn't a crash — it's a plausible
 * wrong figure nobody notices. Month bucketing and the internal-account exclusion are the two places
 * that can silently mislead, so they are what this covers. The counting itself is `COUNT(*)` with a
 * filter and needs a database; §20 of test-security.ts proves the scoping.
 */
import { bucketByMonth, internalSlugs, monthKey, monthKeys, statsSummary, type PlatformStats } from "../src/lib/platform-stats";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const D = (iso: string) => new Date(iso);

// ---- month keys are UTC, always ------------------------------------------

check("a month key is YYYY-MM", monthKey(D("2026-10-05T12:00:00Z")) === "2026-10-05".slice(0, 7));
check("January pads to 01", monthKey(D("2026-01-31T23:59:59Z")) === "2026-01");
check("December is 12, not 13", monthKey(D("2026-12-01T00:00:00Z")) === "2026-12");

// The dev machine is UTC+10. A row created at 9am Brisbane on the 1st is 23:00 UTC on the *previous*
// day — if bucketing used local time the month boundary would move depending on who ran the page.
check(
  "the last instant of a UTC month stays in that month",
  monthKey(D("2026-09-30T23:59:59Z")) === "2026-09",
);
check(
  "the first instant of the next UTC month rolls over",
  monthKey(D("2026-10-01T00:00:00Z")) === "2026-10",
);

// ---- the window ----------------------------------------------------------

{
  const keys = monthKeys(D("2026-10-05T00:00:00Z"));
  check("thirteen months by default", keys.length === 13, String(keys.length));
  check("the last key is the current month", keys[keys.length - 1] === "2026-10");
  check("the first key is twelve months back", keys[0] === "2025-10", keys[0]);
  check("keys are in ascending order", keys.join(",") === [...keys].sort().join(","));
  check("no duplicate months", new Set(keys).size === keys.length);
}
{
  // Crossing a year boundary is where a naive month-minus-one breaks.
  const keys = monthKeys(D("2026-01-15T00:00:00Z"), 3);
  check("a window spanning new year walks back correctly", keys.join(",") === "2025-11,2025-12,2026-01", keys.join(","));
}
{
  const keys = monthKeys(D("2026-03-31T00:00:00Z"), 2);
  check(
    "a 31st doesn't skip February",
    keys.join(",") === "2026-02,2026-03",
    keys.join(","),
  );
}

// ---- bucketing -----------------------------------------------------------

{
  const keys = monthKeys(D("2026-10-05T00:00:00Z"), 3); // 2026-08, 2026-09, 2026-10
  const counts = bucketByMonth(
    [D("2026-08-01T00:00:00Z"), D("2026-08-31T23:59:59Z"), D("2026-10-05T00:00:00Z")],
    keys,
  );
  check("two in August", counts["2026-08"] === 2, String(counts["2026-08"]));
  check("an empty month is zero, not missing", counts["2026-09"] === 0 && "2026-09" in counts);
  check("one in the current month", counts["2026-10"] === 1);
  check("every key is present", keys.every((k) => k in counts));
}
{
  const keys = monthKeys(D("2026-10-05T00:00:00Z"), 2);
  // Older than the window. It must not be counted, and must not land in the first bucket either —
  // quietly folding history into the earliest column would overstate that month badly.
  const counts = bucketByMonth([D("2020-01-01T00:00:00Z")], keys);
  check("a date before the window is dropped, not folded into the first month", Object.values(counts).every((v) => v === 0));
}
check("no dates means all zeroes", Object.values(bucketByMonth([], monthKeys(D("2026-10-05T00:00:00Z"), 4))).every((v) => v === 0));

// ---- which accounts are ours --------------------------------------------

const withEnv = (v: string | undefined, fn: () => void) => {
  const prev = process.env.PLATFORM_INTERNAL_ORG_SLUGS;
  if (v === undefined) delete process.env.PLATFORM_INTERNAL_ORG_SLUGS;
  else process.env.PLATFORM_INTERNAL_ORG_SLUGS = v;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.PLATFORM_INTERNAL_ORG_SLUGS;
    else process.env.PLATFORM_INTERNAL_ORG_SLUGS = prev;
  }
};

withEnv(undefined, () => check("unset means nothing is excluded", internalSlugs().length === 0));
withEnv("", () => check("empty means nothing is excluded", internalSlugs().length === 0));
withEnv("rhythm-revolt", () => check("one slug", internalSlugs().join(",") === "rhythm-revolt"));
withEnv("a,b,c", () => check("several slugs", internalSlugs().join(",") === "a,b,c"));
withEnv(" a , b ", () => check("whitespace is trimmed", internalSlugs().join(",") === "a,b"));
withEnv("a,,b,", () => check("blank entries are dropped", internalSlugs().join(",") === "a,b"));
withEnv("Rhythm-Revolt", () => check("slugs are lower-cased to match the column", internalSlugs().join(",") === "rhythm-revolt"));

// ---- the pasteable summary carries its own caveat ------------------------

const sample: PlatformStats = {
  all: { smartLinks: 50, bioPages: 10, links: 60, uniqueFans: 900, presaves: 1200, artistProfiles: 8, artistAccounts: 3, labelAccounts: 2, logins: 9, clicks: 4000 },
  external: { smartLinks: 5, bioPages: 1, links: 6, uniqueFans: 40, presaves: 55, artistProfiles: 2, artistAccounts: 2, labelAccounts: 1, logins: 4, clicks: 120 },
  months: [],
  excluded: ["rhythm-revolt"],
  firstAccountAt: D("2026-09-01T00:00:00Z"),
  generatedAt: D("2026-10-05T00:00:00Z"),
};
const summary = statsSummary(sample);
check("the summary says the figures exclude our own accounts", /exclude our own accounts/i.test(summary));
check("...and names which ones", summary.includes("rhythm-revolt"));
check("the summary quotes the customer-only link count", /Links created: 6\b/.test(summary), summary.split("\n").find((l) => l.startsWith("Links created")) ?? "");
check("the summary never quotes the inflated total", !summary.includes("60 (") && !/Links created: 60/.test(summary));
check("unique fans and pre-saves are labelled apart", /Unique fans reached: 40/.test(summary) && /Pre-saves taken: 55/.test(summary));
check("the summary is dated", summary.includes("5 October 2026"));

withEnv(undefined, () => {
  const bare = statsSummary({ ...sample, excluded: [] });
  check("with nothing excluded it still says so rather than implying a clean figure", /exclude our own accounts\./.test(bare), bare.split("\n")[1]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
