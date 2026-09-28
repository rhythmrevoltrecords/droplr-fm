/**
 * Release metadata checks: the things a distributor rejects, caught before submission.
 *
 * What this defends:
 *  - the check-digit maths, against real barcodes, at all four GTIN lengths. `validator`'s isEAN
 *    silently rejects every 12-digit UPC-A, which is why droplr doesn't use it — so this suite has
 *    to be the thing that proves ours doesn't have the same hole;
 *  - the rules that cost an artist a release: a reused ISRC, a duplicated UPC, "feat." in a title,
 *    "(Explicit)" written out instead of flagged;
 *  - and, just as important, that ordinary releases produce NOTHING. A validator that cries wolf on
 *    a correct release is worse than no validator, because the one real warning gets ignored with
 *    the rest of them.
 *
 * Pure functions, no database, no server:
 *   npx tsx scripts/test-metadata.ts
 */
import {
  checkMetadata, errorsIn, gtinCheckDigit, metadataSummary, parseIsrc,
  type ReleaseUnderCheck, type SiblingRelease, validGtin, warningsIn,
} from "../src/lib/metadata-check";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};

const release = (over: Partial<ReleaseUnderCheck> = {}): ReleaseUnderCheck => ({
  title: "Mess It Up",
  artistName: "Ototo",
  upc: null,
  isrc: null,
  releaseDate: new Date("2026-09-25T00:00:00Z"),
  ...over,
});

const ids = (r: ReleaseUnderCheck, siblings: SiblingRelease[] = []) => checkMetadata(r, siblings).map((f) => f.id);
const has = (r: ReleaseUnderCheck, id: string, siblings: SiblingRelease[] = []) => ids(r, siblings).includes(id);

function main() {
  console.log("1. GTIN check digit, against real barcodes");
  // Worked example from GS1's own page, plus a real UPC-A and a real EAN-8.
  check("GS1's worked example", gtinCheckDigit("629104150021") === 3, String(gtinCheckDigit("629104150021")));
  check("a real UPC-A", gtinCheckDigit("03600029145") === 2, String(gtinCheckDigit("03600029145")));
  check("a real EAN-8", gtinCheckDigit("9638507") === 4, String(gtinCheckDigit("9638507")));
  check("a real EAN-13", validGtin("4006381333931"));
  check("all four lengths are accepted", [8, 12, 13, 14].every((n) => {
    const body = "1".repeat(n - 1);
    return validGtin(`${body}${gtinCheckDigit(body)}`);
  }));
  // The exact hole in `validator`'s isEAN, which is why we don't use it.
  check("a 12-digit UPC-A is not rejected for being 12 digits", validGtin("036000291452"));
  check("a transposition is caught", !validGtin("036000291542"));
  check("a wrong last digit is caught", !validGtin("036000291453"));
  check("letters are refused", !validGtin("03600029145X"));
  check("an 11-digit code is refused", !validGtin("03600029145"));

  console.log("\n2. ISRC shape");
  const ok = parseIsrc("AU-ABC-25-00001");
  check("hyphens and case are decoration", ok?.normalised === "AUABC2500001" && ok.agency === "AU" && ok.year === 25 && ok.designation === "00001");
  check("a distributor-issued QM code parses", !!parseIsrc("QMDA72412345"));
  check("digits are allowed in the registrant", !!parseIsrc("US4R31900001"));
  check("a letter in the designation is refused", parseIsrc("AUABC250000X") === null);
  check("eleven characters are refused", parseIsrc("AUABC250001") === null);
  check("a leading digit in the agency is refused", parseIsrc("1UABC2500001") === null);

  console.log("\n4. A clean release says nothing at all");
  // The most important test here. Ordinary, correct releases must be silent.
  for (const r of [
    release(),
    release({ title: "Mess It Up (Extended Mix)", upc: "036000291452", isrc: "AUABC2500001" }),
    release({ title: "City Lights", artistName: "Nathan Hill", upc: "4006381333931" }),
    release({ title: "Basic Bitch (Ototo Remix)" }),
    release({ title: "No Talk", isrc: "QMDA72500001" }),
  ]) {
    check(`"${r.title}" is clean`, checkMetadata(r).length === 0, ids(r).join(", "));
  }
  // Lowercase styling is deliberate often enough to be a warning, never an error.
  check("a lowercase title is only a warning", errorsIn(checkMetadata(release({ title: "hyperfixation" }))).length === 0);

  console.log("\n5. UPC problems");
  check("a bad check digit is an error", has(release({ upc: "036000291453" }), "upc.checkDigit"));
  check("…and it says what the right digit would be", checkMetadata(release({ upc: "036000291453" }))[0].fix?.includes("036000291452") === true);
  check("a wrong length is caught", has(release({ upc: "03600029145" }), "upc.length"));
  check("…and eleven digits mentions the lost leading zero", checkMetadata(release({ upc: "03600029145" }))[0].fix?.includes("leading zero") === true);
  check("letters are caught", has(release({ upc: "03600029145X" }), "upc.notNumeric"));
  const upcTwin: SiblingRelease[] = [{ id: "a", title: "Earlier Release", upc: "036000291452", isrc: null }];
  check("a UPC already used on another release is an error", has(release({ upc: "036000291452" }), "upc.reused", upcTwin));
  check("…and it names the release it clashes with", checkMetadata(release({ upc: "036000291452" }), upcTwin).some((f) => f.message.includes("Earlier Release")));

  console.log("\n6. ISRC problems");
  check("a malformed ISRC is an error", has(release({ isrc: "NOPE" }), "isrc.shape"));
  check("a retired country code is flagged", has(release({ isrc: "YUABC2500001" }), "isrc.retiredAgency"));
  check("a year after the release date is flagged", has(release({ isrc: "AUABC2700001" }), "isrc.yearAhead"));
  check("an old assignment year is flagged as possibly someone else's code", has(release({ isrc: "AUABC1500001" }), "isrc.yearOld"));
  check("…but a year or two early is normal and silent", !has(release({ isrc: "AUABC2400001" }), "isrc.yearOld") && !has(release({ isrc: "AUABC2400001" }), "isrc.yearAhead"));
  const isrcTwin: SiblingRelease[] = [{ id: "a", title: "Last Single", upc: null, isrc: "au-abc-25-00001" }];
  check("a reused ISRC is an error, whatever the punctuation", has(release({ isrc: "AUABC2500001" }), "isrc.reused", isrcTwin));
  check("…and it explains why that costs money", checkMetadata(release({ isrc: "AUABC2500001" }), isrcTwin).some((f) => f.fix?.includes("royalties")));

  console.log("\n7. Title rules that actually cause rejections");
  for (const t of ["Mess It Up feat. Nathan Hill", "Mess It Up ft. Nathan Hill", "Mess It Up (feat. Nathan Hill)", "Mess It Up Featuring Nathan Hill"]) {
    check(`"${t}" is caught`, has(release({ title: t }), "title.featuring"));
  }
  check("…as an error, because stores re-credit or reject it", checkMetadata(release({ title: "X feat. Y" })).find((f) => f.id === "title.featuring")?.severity === "error");
  check("a word merely containing 'ft' is not caught", !has(release({ title: "Drift" }), "title.featuring") && !has(release({ title: "Aftermath" }), "title.featuring"));
  for (const t of ["Mess It Up (Explicit)", "Mess It Up [Clean]", "Mess It Up (Dirty)"]) {
    check(`"${t}" is caught`, has(release({ title: t }), "title.explicitInTitle"));
  }
  check("an all-caps title is flagged", has(release({ title: "MESS IT UP" }), "title.allCaps"));
  check("…but a short stylised name isn't", !has(release({ artistName: "MJ" }), "artistName.allCaps"));
  check("a bare version word is flagged", has(release({ title: "Mess It Up Radio Edit" }), "title.versionUnbracketed"));
  check("…and in brackets it's fine", !has(release({ title: "Mess It Up (Radio Edit)" }), "title.versionUnbracketed"));
  // A remix title is correct. Warning on every one of them is how a label learns to ignore the panel.
  check("a correctly named remix says nothing", checkMetadata(release({ title: "Mess It Up (Ototo Remix)" })).length === 0);
  check("stray double spaces are flagged", has(release({ title: "Mess  It Up" }), "title.whitespace"));
  check("a lowercase first word is flagged", has(release({ title: "mess it up" }), "title.firstWordLowercase"));
  check("…but a leading 'the' is not", !has(release({ title: "the Mess" }), "title.firstWordLowercase"));

  console.log("\n8. Artist name rules");
  check("'feat.' in the artist field is allowed — that's where it belongs", !has(release({ artistName: "Ototo feat. Nathan Hill" }), "artistName.featuring"));
  check("but '(Explicit)' in the artist name is still wrong", has(release({ artistName: "Ototo (Explicit)" }), "artistName.explicitInTitle"));

  console.log("\n9. Every finding can be explained to the artist");
  const everything = checkMetadata(release({
    title: "MESS IT UP feat. Nathan Hill (Explicit)",
    artistName: "Ototo",
    upc: "036000291453",
    isrc: "YUABC2700001",
  }));
  check("a badly broken release reports several things", everything.length >= 5, String(everything.length));
  check("every finding has a stable id", everything.every((f) => /^[a-z]+\.[a-zA-Z]+$/.test(f.id)));
  check("every finding has a message that isn't jargon", everything.every((f) => f.message.length > 10 && !/regex|null|undefined/i.test(f.message)));
  check("every rule cites where it came from", everything.filter((f) => f.field !== "title" || f.id !== "title.whitespace").every((f) => !!f.source || !!f.fix));
  check("ids are unique within one release", new Set(everything.map((f) => f.id)).size === everything.length);

  console.log("\n10. The one-line summary");
  check("a clean release has nothing to say", metadataSummary([]) === null);
  check("problems and checks are counted separately", metadataSummary(everything)?.includes("problem") === true);
  check("one problem is singular", metadataSummary(checkMetadata(release({ upc: "036000291453" })))?.startsWith("1 problem") === true, metadataSummary(checkMetadata(release({ upc: "036000291453" }))) ?? "");
  check("errors and warnings split cleanly", errorsIn(everything).length + warningsIn(everything).length === everything.length);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}
main();
