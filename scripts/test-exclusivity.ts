/**
 * Beatport exclusivity: whether the links about to be published break the window.
 *
 * What this defends:
 *  - that droplr answers under ONE distributor's published rules rather than averaging three
 *    contradictory ones. LabelWorx counts Apple Music, TIDAL and SoundCloud; Beatport's own rule
 *    does not. Getting that backwards either cries wolf on a legal link or blesses a breach;
 *  - that it says "unclear" instead of guessing. A custom button might be merch or it might be a
 *    Bandcamp code page, and SoundCloud's own wording bars "SoundCloud Pro" specifically, which no
 *    URL reveals. Guessing either way is worse than asking;
 *  - that it is SILENT when no exclusive is set. That is the common case, and a panel that always
 *    has something to say is one people stop reading;
 *  - that a hidden link is not a breach, because it isn't published;
 *  - and the notice period, which is the one that costs money quietly: Beatport wants at least 7
 *    business days before a window opens.
 *
 * Pure functions, no database, no server:
 *   npm run test:exclusivity
 */
import {
  businessDaysBetween, exclusivityFindings, exclusivitySummary, isRulebook, NOTICE_BUSINESS_DAYS,
  RULEBOOKS, verdictFor, WEEKS_BY_RULEBOOK, windowActive, windowEnd,
  type ExclusivityLink, type ExclusivityWindow, type Rulebook,
} from "../src/lib/exclusivity";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};

const NOW = new Date("2026-10-01T00:00:00Z"); // a Thursday
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const win = (over: Partial<ExclusivityWindow> = {}): ExclusivityWindow => ({
  store: "beatport",
  from: day(-7),
  weeks: 4,
  rulebook: "beatport",
  ...over,
});
const link = (platform: string, visible = true): ExclusivityLink => ({
  platform, url: `https://example.com/${platform}`, visible,
});
const texts = (f: ReturnType<typeof exclusivityFindings>) => f.map((x) => x.text).join(" | ");
const errors = (f: ReturnType<typeof exclusivityFindings>) => f.filter((x) => x.level === "error");
const ALL: Rulebook[] = ["beatport", "labelworx", "symphonic", "unknown"];

function main() {
  console.log("Exclusivity\n");

  console.log("1. Silence when there is nothing to say");
  check("no exclusive set → no findings at all",
    exclusivityFindings(win({ store: null }), [link("bandcamp"), link("juno")], NOW).length === 0);
  check("an exclusive with only streaming links → no findings",
    exclusivityFindings(win(), [link("spotify"), link("appleMusic"), link("tidal"), link("deezer")], NOW).length === 0);
  check("a finished window stops complaining",
    exclusivityFindings(win({ from: day(-60), weeks: 4 }), [link("bandcamp")], NOW).length === 0);
  check("no summary line without an exclusive", exclusivitySummary(win({ store: null }), NOW) === null);

  console.log("\n2. The window itself");
  check("4 weeks from a week ago is still open", windowActive(win(), NOW));
  check("a window that hasn't started is treated as live, because the links are already scheduled",
    windowActive(win({ from: day(14) }), NOW));
  check("a lifetime exclusive never ends", windowEnd(win({ weeks: null })) === null && windowActive(win({ weeks: null }), day(9999)));
  check("the end date is start + weeks",
    windowEnd(win({ from: new Date("2026-10-01T00:00:00Z"), weeks: 4 }))?.toISOString() === "2026-10-29T00:00:00.000Z");
  check("an ended window is not active", !windowActive(win({ from: day(-60), weeks: 4 }), NOW));
  check("no start date means not active", !windowActive(win({ from: null }), NOW));
  check("the summary names the store and the end date",
    (exclusivitySummary(win(), NOW) ?? "").includes("Beatport") && (exclusivitySummary(win(), NOW) ?? "").includes("2026"));
  check("a lifetime summary says so", (exclusivitySummary(win({ weeks: null }), NOW) ?? "").includes("for life"));
  check("an ended summary says it ended", (exclusivitySummary(win({ from: day(-60) }), NOW) ?? "").includes("ended"));
  check("a missing start date is admitted, not hidden",
    (exclusivitySummary(win({ from: null }), NOW) ?? "").includes("no start date"));

  console.log("\n3. Download stores break it under every rulebook");
  for (const pf of ["bandcamp", "itunes", "juno", "qobuz", "traxsource"]) {
    check(`${pf} breaks it under all four rulebooks`,
      ALL.every((r) => verdictFor(pf, r, "beatport") === "breaks"));
  }
  check("the exclusive store itself is never a breach of its own exclusive",
    ALL.every((r) => verdictFor("beatport", r, "beatport") === "allowed"));
  check("a Bandcamp link produces an error naming Bandcamp and the end date",
    (() => { const f = errors(exclusivityFindings(win(), [link("bandcamp")], NOW)); return f.length === 1 && f[0].text.includes("Bandcamp") && f[0].text.includes("2026"); })());
  check("the error says what to do about it",
    texts(exclusivityFindings(win(), [link("juno")], NOW)).includes("Hide this link"));
  check("several breaking links each get their own finding",
    errors(exclusivityFindings(win(), [link("bandcamp"), link("juno"), link("traxsource")], NOW)).length === 3);

  console.log("\n4. Where the three distributors disagree");
  for (const pf of ["appleMusic", "tidal"]) {
    check(`${pf} breaks it under LabelWorx`, verdictFor(pf, "labelworx", "beatport") === "breaks");
    check(`${pf} is fine under Beatport's own rule`, verdictFor(pf, "beatport", "beatport") === "allowed");
    check(`${pf} is fine under Symphonic`, verdictFor(pf, "symphonic", "beatport") === "allowed");
  }
  check("SoundCloud breaks it under LabelWorx", verdictFor("soundcloud", "labelworx", "beatport") === "breaks");
  check("SoundCloud is only 'unclear' under Beatport's own rule, which names SoundCloud Pro",
    verdictFor("soundcloud", "beatport", "beatport") === "unclear");
  check("the LabelWorx error names LabelWorx, not Beatport",
    texts(exclusivityFindings(win({ rulebook: "labelworx" }), [link("appleMusic")], NOW)).includes("LabelWorx"));
  check("under an unknown rulebook the error names all three",
    texts(exclusivityFindings(win({ rulebook: "unknown" }), [link("bandcamp")], NOW)).includes("all three"));
  check("LabelWorx is told it also counts edits and pre-orders droplr can't see",
    texts(exclusivityFindings(win({ rulebook: "labelworx" }), [link("bandcamp")], NOW)).includes("edits"));
  check("Beatport's rulebook is not lectured about edits",
    !texts(exclusivityFindings(win({ rulebook: "beatport" }), [link("bandcamp")], NOW)).includes("radio edits"));

  console.log("\n5. Unclear beats guessing");
  check("a custom link is never called a breach",
    ALL.every((r) => verdictFor("custom", r, "beatport") === "unclear"));
  check("the custom warning admits droplr can't tell",
    texts(exclusivityFindings(win(), [link("custom")], NOW)).includes("can't tell"));
  check("an unclear link is a warning, never an error",
    errors(exclusivityFindings(win(), [link("custom"), link("soundcloud")], NOW)).length === 0);
  check("an unknown platform is not invented into a breach",
    ALL.every((r) => verdictFor("myspace", r, "beatport") === "allowed"));

  console.log("\n6. A hidden link is not published, so it is not a breach");
  check("a hidden Bandcamp link raises nothing",
    exclusivityFindings(win(), [link("bandcamp", false)], NOW).length === 0);
  check("hiding one of two leaves exactly one finding",
    errors(exclusivityFindings(win(), [link("bandcamp", false), link("juno", true)], NOW)).length === 1);

  console.log("\n7. Beatport's notice period");
  check("7 business days is the published minimum", NOTICE_BUSINESS_DAYS === 7);
  check("Thu → the Wed 6 days later is 4 business days", businessDaysBetween(NOW, day(6)) === 4);
  check("a weekend adds nothing", businessDaysBetween(new Date("2026-10-02T00:00:00Z"), new Date("2026-10-05T00:00:00Z")) === 1);
  check("a fortnight is 10 business days", businessDaysBetween(NOW, day(14)) === 10);
  check("backwards is zero, never negative", businessDaysBetween(day(5), NOW) === 0);
  check("same day is zero", businessDaysBetween(NOW, NOW) === 0);
  check("a window opening in 3 days warns about notice",
    texts(exclusivityFindings(win({ from: day(3) }), [], NOW)).includes("business days"));
  check("a window opening in a fortnight does not",
    exclusivityFindings(win({ from: day(14) }), [], NOW).length === 0);
  check("an already-open window is never warned about notice",
    !texts(exclusivityFindings(win({ from: day(-7) }), [], NOW)).includes("business days"));

  console.log("\n8. Window lengths each rulebook publishes");
  check("Symphonic is the only one listing 6 weeks",
    WEEKS_BY_RULEBOOK.symphonic.includes(6) && !WEEKS_BY_RULEBOOK.beatport.includes(6) && !WEEKS_BY_RULEBOOK.labelworx.includes(6));
  check("6 weeks under Beatport's rules is flagged",
    texts(exclusivityFindings(win({ weeks: 6 }), [], NOW)).includes("isn't a window"));
  check("6 weeks under Symphonic is fine",
    exclusivityFindings(win({ weeks: 6, rulebook: "symphonic" }), [], NOW).length === 0);
  check("the flag lists the lengths that are published",
    texts(exclusivityFindings(win({ weeks: 3 }), [], NOW)).includes("2, 4, 8"));
  check("a lifetime window is never flagged for its length",
    exclusivityFindings(win({ weeks: null }), [], NOW).filter((f) => f.text.includes("isn't a window")).length === 0);

  console.log("\n9. Presentation");
  check("findings come back most severe first",
    (() => {
      const f = exclusivityFindings(win({ rulebook: "unknown" }), [link("bandcamp"), link("custom")], NOW);
      const order = { error: 0, warning: 1, note: 2 } as const;
      return f.every((x, i) => i === 0 || order[f[i - 1].level] <= order[x.level]);
    })());
  check("every finding carries text a label can act on",
    exclusivityFindings(win({ rulebook: "unknown" }), [link("bandcamp"), link("custom")], NOW).every((f) => f.text.length > 40));
  check("a breaking finding names its platform for the UI to anchor on",
    errors(exclusivityFindings(win(), [link("bandcamp")], NOW))[0]?.platform === "bandcamp");
  check("the unknown-rulebook nudge appears only when something was found",
    exclusivityFindings(win({ rulebook: "unknown" }), [link("spotify")], NOW).length === 0);
  check("every rulebook has a label and a note for the picker",
    RULEBOOKS.every((r) => r.label.length > 3 && r.note.length > 20));
  check("only the four rulebooks are accepted",
    ALL.every(isRulebook) && !isRulebook("fuga") && !isRulebook("") && !isRulebook(undefined));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}
main();
