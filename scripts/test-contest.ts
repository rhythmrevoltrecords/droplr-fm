/**
 * Remix contests: the rules that decide whether an entry counts.
 *
 * What this defends:
 *  - the window. A contest that takes entries after it closed, or before it opened, is the kind of
 *    fault a label finds out about from an angry entrant;
 *  - the link rules, and specifically that they REFUSE only what is certainly wrong. An unknown host
 *    is usually an artist's own website, and a validator that rejects those is droplr deciding which
 *    services independent artists may use;
 *  - the expiring-transfer warning, which is the single most useful thing in the file: a WeTransfer
 *    link submitted on day one is dead by judging day and nobody finds out until it matters;
 *  - duplicate detection surviving the ways the same link actually arrives twice — app share sheet
 *    versus website, tracking parameters, trailing slash, www;
 *  - and that withdrawing doesn't become a way around the per-entrant limit.
 *
 * Pure functions, no database, no server:
 *   npx tsx scripts/test-contest.ts
 */
import {
  acceptingEntries, checkEntryLink, closingMessage, contestState, DECLARATION_TEXT,
  duplicateMessage, duplicateVerdict, entryProblem, type ExistingEntry, isEntryStatus,
  judgingSummary, linkCheckFromStatus, linkCheckNote, normaliseEntryUrl,
} from "../src/lib/contest";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};

const NOW = new Date("2026-10-01T00:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const win = (over: Partial<Parameters<typeof contestState>[0]> = {}) => ({
  published: true,
  opensAt: null,
  closesAt: day(14),
  winnerAnnouncedAt: null,
  ...over,
});

const ok = (raw: string, closesAt = day(14)) => {
  const r = checkEntryLink(raw, { closesAt, now: NOW });
  return r.ok ? r : null;
};
const warnIds = (raw: string, closesAt = day(14)) => ok(raw, closesAt)?.warnings.map((w) => w.id) ?? ["REFUSED"];

function main() {
  console.log("1. The window");
  check("an unpublished contest is a draft", contestState(win({ published: false }), NOW) === "draft");
  check("published with no opens date is open", contestState(win(), NOW) === "open");
  check("an opens date in the future is waiting", contestState(win({ opensAt: day(3) }), NOW) === "waiting");
  check("an opens date in the past is open", contestState(win({ opensAt: day(-3) }), NOW) === "open");
  check("past the close date is judging", contestState(win({ closesAt: day(-1) }), NOW) === "judging");
  check("an announced winner is done", contestState(win({ closesAt: day(-7), winnerAnnouncedAt: day(-1) }), NOW) === "done");
  check("a winner date in the future hasn't happened yet", contestState(win({ closesAt: day(-7), winnerAnnouncedAt: day(1) }), NOW) === "judging");
  check("only 'open' accepts entries", acceptingEntries(win(), NOW) && !acceptingEntries(win({ closesAt: day(-1) }), NOW) && !acceptingEntries(win({ published: false }), NOW));
  // The exact boundary, because "closes 14 Oct" must not still be taking entries on the 15th.
  check("closing is exclusive at the instant", !acceptingEntries(win({ closesAt: NOW }), NOW));

  console.log("\n2. How long is left");
  check("days are rounded, not floored to zero", closingMessage(win({ closesAt: day(3) }), NOW) === "3 days left.", closingMessage(win({ closesAt: day(3) }), NOW));
  check("just over a day rounds to one day, singular", closingMessage(win({ closesAt: new Date(NOW.getTime() + 25 * 3_600_000) }), NOW) === "1 day left.", closingMessage(win({ closesAt: new Date(NOW.getTime() + 25 * 3_600_000) }), NOW));
  check("under a day counts in hours", closingMessage(win({ closesAt: new Date(NOW.getTime() + 5 * 3_600_000) }), NOW) === "5 hours left.");
  check("one hour is singular", closingMessage(win({ closesAt: new Date(NOW.getTime() + 3_600_000) }), NOW) === "1 hour left.");
  check("the last hour says so", closingMessage(win({ closesAt: new Date(NOW.getTime() + 60_000) }), NOW) === "Closing within the hour.");
  check("judging explains itself rather than just saying closed", closingMessage(win({ closesAt: day(-1) }), NOW).includes("hasn't been announced"));

  console.log("\n3. Links that are certainly wrong");
  check("empty is refused", !checkEntryLink("", { now: NOW }).ok);
  check("not a URL is refused", !checkEntryLink("my remix", { now: NOW }).ok);
  check("ftp is refused", !checkEntryLink("ftp://example.com/x.wav", { now: NOW }).ok);
  check("a droplr link is refused", !checkEntryLink("https://droplr.fm/rrr/mess-it-up", { now: NOW }).ok);
  check("…and says where to put the file instead", (checkEntryLink("https://droplr.fm/x/y", { now: NOW }) as { error: string }).error.includes("SoundCloud"));
  check("localhost is refused", !checkEntryLink("http://localhost:3000/remix.wav", { now: NOW }).ok);
  check("a bare SoundCloud homepage is refused", !checkEntryLink("https://soundcloud.com", { now: NOW }).ok);
  check("…and it names the host so the entrant knows what to do", (checkEntryLink("https://soundcloud.com/", { now: NOW }) as { error: string }).error.includes("SoundCloud"));
  check("a bare unknown domain is refused", !checkEntryLink("https://example.com", { now: NOW }).ok);

  console.log("\n4. Links that are fine, and stay silent");
  check("a SoundCloud track is clean", warnIds("https://soundcloud.com/ototo/mess-it-up-remix").length === 0, warnIds("https://soundcloud.com/ototo/mess-it-up-remix").join(","));
  check("a private SoundCloud share link is clean", warnIds("https://soundcloud.com/ototo/remix/s-AbCdEf").length === 0);
  check("a YouTube link is clean", warnIds("https://youtu.be/dQw4w9WgXcQ").length === 0);
  check("a Bandcamp track is clean", warnIds("https://ototo.bandcamp.com/track/remix").length === 0);
  check("a Dropbox link is clean — the default there is a working link", warnIds("https://www.dropbox.com/s/abc/remix.wav?dl=0").length === 0);
  check("a streaming host is marked as streaming", ok("https://soundcloud.com/ototo/x")?.link.streams === true);
  check("…and a file host isn't", ok("https://www.dropbox.com/s/abc/x.wav")?.link.streams === false);

  console.log("\n5. The warning that matters most: links that die before judging");
  check("WeTransfer inside a long window is warned", warnIds("https://we.tl/t-AbCdEfGh").includes("link.expires"));
  check("…and the message says it'll be dead before entries close", ok("https://we.tl/t-AbCdEfGh")!.warnings.find((w) => w.id === "link.expires")!.message.includes("before entries close"));
  check("…but a contest closing in 3 days doesn't get that claim", !ok("https://we.tl/t-AbCdEfGh", day(3))!.warnings.find((w) => w.id === "link.expires")!.message.includes("before entries close"));
  check("ToffeeShare's one day is caught too", warnIds("https://toffeeshare.com/download?id=x").includes("link.expires"));
  check("an expiring link is a warning, never a refusal", ok("https://we.tl/t-AbCdEfGh") !== null);

  console.log("\n6. The warning that matters second: private cloud drives");
  check("Google Drive is warned about sharing", warnIds("https://drive.google.com/file/d/abc/view").includes("link.sharing"));
  check("OneDrive short links too", warnIds("https://1drv.ms/u/s!AbCdEf").includes("link.sharing"));
  check("…and it says what to set it to", ok("https://drive.google.com/file/d/abc/view")!.warnings[0].message.includes("anyone with the link"));
  check("Dropbox is NOT warned — its share links work by default", !warnIds("https://www.dropbox.com/s/abc/x.wav").includes("link.sharing"));

  console.log("\n7. An unknown host is a warning, not a rejection");
  // The line this suite exists to hold: droplr does not get to decide where artists host their work.
  check("an artist's own site is accepted", ok("https://ototodj.com/files/remix.wav") !== null);
  check("…with a warning to check it plays without a login", warnIds("https://ototodj.com/files/remix.wav").includes("link.unknown"));
  check("a known host gets no unknown-host warning", !warnIds("https://soundcloud.com/x/y").includes("link.unknown"));

  console.log("\n8. Normalisation, which is what makes duplicate detection work");
  const n = (s: string) => normaliseEntryUrl(s)?.normalised;
  check("www is dropped", n("https://www.soundcloud.com/a/b") === "https://soundcloud.com/a/b");
  check("host case is dropped", n("https://SoundCloud.com/A/B") === "https://soundcloud.com/A/B", n("https://SoundCloud.com/A/B"));
  check("path case is kept — paths are case-sensitive", n("https://soundcloud.com/Ototo/Mix") === "https://soundcloud.com/Ototo/Mix");
  check("http becomes https", n("http://soundcloud.com/a/b") === "https://soundcloud.com/a/b");
  check("a trailing slash is dropped", n("https://soundcloud.com/a/b/") === "https://soundcloud.com/a/b");
  check("a fragment is dropped", n("https://soundcloud.com/a/b#t=30") === "https://soundcloud.com/a/b");
  check("the app share sheet's ?si= is dropped", n("https://soundcloud.com/a/b?si=abc123") === "https://soundcloud.com/a/b");
  check("utm parameters are dropped", n("https://soundcloud.com/a/b?utm_source=ig&utm_campaign=x") === "https://soundcloud.com/a/b");
  check("a meaningful parameter is kept", n("https://drive.google.com/open?id=abc") === "https://drive.google.com/open?id=abc");
  check("parameter order doesn't make two links", n("https://x.com/a?b=2&a=1") === n("https://x.com/a?a=1&b=2"));
  check("garbage is null, not a throw", normaliseEntryUrl("not a url") === null && normaliseEntryUrl("") === null);

  console.log("\n9. What the entrant has to give us");
  const draft = (over: Partial<Parameters<typeof entryProblem>[0]> = {}) => ({
    email: "remixer@example.com", artistName: "Nathan Hill", link: "https://soundcloud.com/a/b",
    declarationAccepted: true, ...over,
  });
  check("a complete entry has no problem", entryProblem(draft()) === null, entryProblem(draft()) ?? "");
  check("no email is refused", !!entryProblem(draft({ email: "  " })));
  check("no artist name is refused", !!entryProblem(draft({ artistName: "" })));
  check("…and it asks in terms of credit, not validation", entryProblem(draft({ artistName: "" }))!.includes("credit"));
  check("an unticked declaration is refused", !!entryProblem(draft({ declarationAccepted: false })));
  check("an over-long note is refused", !!entryProblem(draft({ note: "x".repeat(501) })));
  check("the declaration says droplr doesn't store audio", DECLARATION_TEXT.includes("not my audio"));
  check("the declaration covers samples, not just the stems", DECLARATION_TEXT.includes("sample"));

  console.log("\n10. Duplicates");
  const e = (over: Partial<ExistingEntry> = {}): ExistingEntry => ({
    id: "e1", email: "remixer@example.com", linkNormalised: "https://soundcloud.com/a/b", withdrawnAt: null, ...over,
  });
  const mine = { email: "remixer@example.com", linkNormalised: "https://soundcloud.com/a/b" };
  check("a first entry is fine", duplicateVerdict(mine, [], 1).kind === "none");
  check("someone else's link is refused", duplicateVerdict(mine, [e({ email: "other@example.com" })], 3).kind === "link");
  check("…and the message doesn't confirm who entered it", duplicateMessage({ kind: "link", entryId: "e1" }, 3)!.includes("If it was you"));
  check("my own live link is refused rather than duplicated", duplicateVerdict(mine, [e()], 3).kind === "link");
  check("at a limit of three, a fourth is refused", duplicateVerdict({ ...mine, linkNormalised: "https://soundcloud.com/a/z" }, [e({ id: "1" }), e({ id: "2", linkNormalised: "l2" }), e({ id: "3", linkNormalised: "l3" })], 3).kind === "limit");
  check("…and the message names the limit", duplicateMessage({ kind: "limit", count: 3 }, 3)!.includes("3"));
  check("email case and padding don't create a second entrant", duplicateVerdict({ ...mine, email: "  ReMixer@Example.com " }, [e()], 1).kind === "link");

  // THE one that matters. An email address arrives unverified, so it must never be a key that lets a
  // stranger overwrite a live entry: knowing someone's address would otherwise be enough to swap their
  // remix for a dead link, wipe the label's shortlist mark, and rewrite the declaration record saying
  // who claimed authorship. At the limit the answer is "no", and the way to change an entry is the
  // withdraw token in the entrant's own receipt.
  const atLimit = duplicateVerdict({ ...mine, linkNormalised: "https://soundcloud.com/a/c" }, [e()], 1);
  check("a new link from a known address NEVER overwrites a live entry", atLimit.kind === "limit", atLimit.kind);
  check("…and the refusal points at the withdraw link instead", duplicateMessage(atLimit, 1)!.includes("withdraw link"));
  check("…at higher limits too", duplicateMessage({ kind: "limit", count: 3 }, 3)!.includes("withdraw"));
  check("no verdict can ever ask a caller to overwrite a live row", !["replace"].includes(atLimit.kind));

  // Withdraw-and-re-enter must not be a way past the limit, and a withdrawn link stays reserved.
  check("a withdrawn entry frees the entrant's slot", duplicateVerdict({ ...mine, linkNormalised: "https://soundcloud.com/a/new" }, [e({ withdrawnAt: day(-1) })], 1).kind === "none");
  check("…but re-pasting the withdrawn link revives that entry rather than doubling it", duplicateVerdict(mine, [e({ withdrawnAt: day(-1) })], 1).kind === "revive");
  check("…and that holds at a higher limit too, so no two rows share a link", duplicateVerdict(mine, [e({ withdrawnAt: day(-1) })], 5).kind === "revive");
  check("…and can't be re-entered by someone else", duplicateVerdict({ ...mine, email: "other@example.com" }, [e({ withdrawnAt: day(-1) })], 3).kind === "link");
  check("a revive needs the exact link, not just the address", duplicateVerdict({ ...mine, linkNormalised: "https://soundcloud.com/a/guess" }, [e({ withdrawnAt: day(-1) })], 1).kind === "none");
  check("a clean verdict has nothing to say", duplicateMessage({ kind: "none" }, 3) === null);

  console.log("\n11. Link checks");
  check("200 is ok", linkCheckFromStatus(200) === "ok");
  check("a redirect is ok — every file host redirects", linkCheckFromStatus(302) === "ok");
  check("404 is gone", linkCheckFromStatus(404) === "gone");
  check("410 is gone", linkCheckFromStatus(410) === "gone");
  check("403 is blocked, not gone — the file exists, it's private", linkCheckFromStatus(403) === "blocked");
  check("405 proves nothing, so it stays unchecked", linkCheckFromStatus(405) === "unchecked");
  check("a dead link is explained to the label", linkCheckNote("gone")!.includes("dead"));
  check("a blocked link tells the label what to ask for", linkCheckNote("blocked")!.includes("public"));
  check("ok says nothing", linkCheckNote("ok") === null && linkCheckNote("unchecked") === null);

  console.log("\n12. Statuses and the judging summary");
  check("the four statuses are recognised", ["new", "shortlisted", "winner", "rejected"].every(isEntryStatus));
  check("withdrawn is not a status — it's a date", !isEntryStatus("withdrawn"));
  check("nonsense is refused", !isEntryStatus("winner ") && !isEntryStatus(null));
  const s = judgingSummary([
    { status: "new", linkCheck: "ok", withdrawnAt: null },
    { status: "new", linkCheck: "gone", withdrawnAt: null },
    { status: "shortlisted", linkCheck: "ok", withdrawnAt: null },
    { status: "winner", linkCheck: "ok", withdrawnAt: null },
    { status: "new", linkCheck: "ok", withdrawnAt: day(-1) },
  ]);
  check("withdrawn entries are out of the count", s.total === 4 && s.withdrawn === 1);
  check("unheard counts only new ones still standing", s.unheard === 2);
  check("broken links are surfaced", s.broken === 1);
  check("the shortlist and winner are counted", s.shortlisted === 1 && s.winner === 1);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}
main();
