/**
 * Lyrics on a release, and the Lyrics clip style.
 *
 * What this defends:
 *  - a paste is read as words, or as an .lrc with its times, and never half of each;
 *  - editing the words keeps the timing of every line that didn't change, and never leaves times
 *    running backwards;
 *  - what the server will store: in order, inside the track, with a length to say which file;
 *  - the clip shows the line being sung, from the moment it was tapped, and nothing it can't place;
 *  - a different master is noticed, and "can't tell" stays "can't tell";
 *  - the .lrc file is in the format the rest of the world reads;
 *  - on a Story, no line is ever drawn into the sticker band.
 *
 * Pure functions and a recording canvas: no database, no browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  carryTimes, checkLyrics, cleanLine, LYRIC_LINE_HOLD_MS, linesInWindow, lyricsOf, lyricTime, nudgeLine, parseLyricsText, stampLine, toLrc,
  trackMismatch, type LyricLine,
} from "../src/lib/lyrics";
import { drawLyricsFrame, lyricAt, lyricsLayout, LYRICS_END_CARD_S, type LyricsOptions } from "../src/lib/clip-lyrics";
import { CLIP_STYLES } from "../src/lib/clip-motion";
import { STORY_STICKER_BAND } from "../src/lib/clip-frame";
import { clipPalette } from "../src/lib/clip-theme";

const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("reading a paste");
const plain = parseLyricsText("First line\n\n  second   line  \r\nThird\n");
check("plain words: one line per row, blanks dropped, spaces tidied, nothing timed", eq(plain, [{ text: "First line", ms: null }, { text: "second line", ms: null }, { text: "Third", ms: null }]));
const lrc = parseLyricsText("[ar:Ototo]\n[ti:Again]\n[00:12.50]Hold me\n[00:15.0]Close\n[01:02.345]Again");
check("an .lrc keeps its times and drops its tags", eq(lrc, [{ text: "Hold me", ms: 12500 }, { text: "Close", ms: 15000 }, { text: "Again", ms: 62345 }]), JSON.stringify(lrc));
const repeated = parseLyricsText("[00:30.00][01:30.00]Chorus line\n[00:10.00]Verse");
check("a line with two tags is two lines, sorted by time", eq(repeated.map((l) => l.ms), [10000, 30000, 90000]));
// One stray "[1:00]" in a lyric must not turn every other line's words into an LRC parse.
const oneTag = parseLyricsText("[1:00] on the clock, I said\nNext line\nAnd another\nAnd one more");
check("a single bracketed time in plain words leaves them words", oneTag.every((l) => l.ms === null) && oneTag[0].text === "[1:00] on the clock, I said", JSON.stringify(oneTag[0]));
check("section labels from lyric sites are left out", eq(parseLyricsText("[Chorus]\nHold me\n(x2)\n[Verse 2: Ototo]\nClose").map((l) => l.text), ["Hold me", "Close"]));
check("…but a line that only starts with brackets is kept", parseLyricsText("[Chorus] hold me\nnext").length === 2);
check("an LRC offset moves every line", eq(parseLyricsText("[offset:+500]\n[00:10.00]a\n[00:20.00]b").map((l) => l.ms), [9500, 19500]));
check("enhanced LRC word times are dropped from the words", eq(parseLyricsText("[00:10.00]<00:10.00>Hold <00:10.50>me").map((l) => l.text), ["Hold me"]));
check("control and direction characters are stripped", cleanLine("a‮b\u0007c​d") === "abcd");
check("silent on ordinary words: nothing timed, nothing altered", eq(parseLyricsText("Just words"), [{ text: "Just words", ms: null }]));

console.log("editing keeps the timing");
const timed: LyricLine[] = [{ text: "one", ms: 1000 }, { text: "two", ms: 2000 }, { text: "three", ms: 3000 }];
check("unchanged words keep every time", eq(carryTimes(timed, ["one", "two", "three"]), timed));
check("a typo fix loses that line's time only", eq(carryTimes(timed, ["one", "tw0", "three"]).map((l) => l.ms), [1000, null, 3000]));
check("an inserted line shifts nothing", eq(carryTimes(timed, ["one", "new", "two", "three"]).map((l) => l.ms), [1000, null, 2000, 3000]));
const chorus: LyricLine[] = [{ text: "la", ms: 1000 }, { text: "verse", ms: 2000 }, { text: "la", ms: 3000 }];
check("repeated lines take their times in order", eq(carryTimes(chorus, ["la", "verse", "la"]).map((l) => l.ms), [1000, 2000, 3000]));
check("moving a line above an earlier one drops the time that would run backwards", eq(carryTimes(timed, ["three", "one", "two"]).map((l) => l.ms), [3000, null, null]));
check("old times that already ran backwards are not carried", eq(carryTimes([{ text: "a", ms: 5000 }, { text: "b", ms: 1000 }], ["a", "b"]).map((l) => l.ms), [5000, null]));

console.log("what the server stores");
check("in order, inside the track: stored as given", checkLyrics(timed, 10_000).ok);
const back = checkLyrics([{ text: "b", ms: 5000 }, { text: "a", ms: 1000 }], 10_000);
check("out of order is refused and names the line", !back.ok && /Line 2/.test(back.error));
check("past the end of the track is refused", !checkLyrics([{ text: "x", ms: 11_000 }], 10_000).ok);
check("timed lines with no track length are refused", !checkLyrics([{ text: "x", ms: 100 }], null).ok);
check("untimed words need no track length", checkLyrics([{ text: "x", ms: null }], null).ok);
check("a fractional or negative time is refused", !checkLyrics([{ text: "x", ms: 1.5 }], 10_000).ok && !checkLyrics([{ text: "x", ms: -1 }], 10_000).ok);
check("a line over the limit is refused", !checkLyrics([{ text: "x".repeat(151), ms: null }], null).ok);
check("an absurd track length is refused", !checkLyrics([{ text: "x", ms: 1 }], 5 * 60 * 60 * 1000).ok);
const blanks = checkLyrics([{ text: "  ", ms: null }, { text: "kept", ms: null }], null);
check("blank rows are dropped, not stored", blanks.ok && eq(blanks.lines, [{ text: "kept", ms: null }]));
check("reading back a junk column gives no lyrics, not a crash", eq(lyricsOf({ a: 1 }), []) && eq(lyricsOf([{ text: 5 }, null, { text: "ok", ms: "x" }]), [{ text: "ok", ms: null }]));

console.log("tapping and nudging");
const taps = stampLine([{ text: "a", ms: null }, { text: "b", ms: 500 }, { text: "c", ms: 9000 }], 0, 1200.4);
check("a tap stamps the line, rounded, and clears a later line now timed before it", eq(taps.map((l) => l.ms), [1200, null, 9000]));
check("a tap earlier than the line above lands on that line's time, never before it", eq(stampLine(timed, 2, 1500).map((l) => l.ms), [1000, 2000, 2000]));
const n = nudgeLine(timed, 1, -5000, 10_000);
check("a nudge can't move a line past the one before it", n[1].ms === 1000);
check("…or past the one after it", nudgeLine(timed, 1, 5000, 10_000)[1].ms === 3000);
check("an ordinary nudge moves it", nudgeLine(timed, 1, 50, 10_000)[1].ms === 2050);
check("an untimed line can't be nudged", eq(nudgeLine([{ text: "x", ms: null }], 0, 50, null), [{ text: "x", ms: null }]));

console.log("the lines in a clip");
const song: LyricLine[] = [
  { text: "before", ms: 2000 }, { text: "held", ms: 8000 }, { text: "in one", ms: 12_000 }, { text: "untimed", ms: null }, { text: "in two", ms: 14_000 }, { text: "late", ms: 60_000 },
];
const w = linesInWindow(song, 10, 15);
check("the line still being sung when the clip starts opens it, from 0", w[0]?.text === "held" && w[0].at === 0 && Math.abs(w[0].until - 2) < 1e-9, JSON.stringify(w[0]));
check("lines inside are placed relative to the clip", w[1]?.text === "in one" && w[1].at === 2 && w[2]?.text === "in two" && w[2].at === 4);
check("untimed lines and lines outside the clip are left out", w.length === 3);
check("a line long over is not dragged in: it holds at most the hold time", linesInWindow([{ text: "old", ms: 0 }], (LYRIC_LINE_HOLD_MS + 500) / 1000, 10).length === 0);
check("the last line ends at the hold time, not the clip's end", Math.abs((w[2]?.until ?? 0) - (4 + LYRIC_LINE_HOLD_MS / 1000)) < 1e-9);
check("an untimed set gives an empty clip", linesInWindow([{ text: "x", ms: null }], 0, 30).length === 0);
const at = lyricAt(w, 3);
check("at a moment: the current line, the one before, the one after", at.cur === 1 && at.prev === 0 && at.next === 2);
check("in a gap nothing is current and the next line waits", lyricAt([{ text: "a", at: 5, until: 6 }], 1).cur === -1 && lyricAt([{ text: "a", at: 5, until: 6 }], 1).next === 0);

console.log("a different master");
check("same length within a second: fine", trackMismatch(200_000, 200_700) === false);
check("a radio edit: noticed", trackMismatch(200_000, 185_000) === true);
check("nothing timed, or nothing loaded: can't tell", trackMismatch(null, 200_000) === null && trackMismatch(200_000, null) === null);

console.log("the .lrc file");
const out = toLrc([{ text: "Hold me", ms: 12_500 }, { text: "skip", ms: null }, { text: "Again", ms: 62_345 }], { title: "Again [VIP]", artist: "Ototo", trackMs: 201_400 });
check("header, then [mm:ss.xx] lines, untimed left out", out === "[ar:Ototo]\n[ti:Again VIP]\n[length:03:21]\n[00:12.50]Hold me\n[01:02.34]Again\n", JSON.stringify(out));
check("it reads back to the same times, to the hundredth", eq(parseLyricsText(out).map((l) => l.ms), [12_500, 62_340]));
check("times show as m:ss.cc in the editor", lyricTime(62_345) === "1:02.34" && lyricTime(0) === "0:00.00");

console.log("drawing");
type Op = { kind: string; a?: number[]; text?: string; alpha?: number };
function draw(lines: ReturnType<typeof linesInWindow>, i: number, opts: { story?: boolean; square?: boolean; options?: Partial<LyricsOptions>; frames?: number } = {}) {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", fillStyle: "#000", globalAlpha: 1 };
  const stack: number[] = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy(state, {
    get(t, k: string) {
      if (k === "save") return () => stack.push(t.globalAlpha as number);
      if (k === "restore") return () => { t.globalAlpha = stack.pop() ?? 1; };
      if (k in t) return t[k];
      // Width follows the font size, so shrinking to fit behaves as it does in a browser.
      if (k === "measureText") return (s: string) => ({ width: s.length * 0.55 * Number(/(\d+)px/.exec(String(t.font))?.[1] ?? 10) });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k === "fillText") return (text: string, _x: number, y: number) => ops.push({ kind: "text", text, a: [y], alpha: t.globalAlpha as number });
      return (...a: unknown[]) => { ops.push({ kind: k, a: a.filter((v) => typeof v === "number") as number[] }); };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const H = opts.square ? 1080 : 1920;
  drawLyricsFrame({
    ctx, width: 1080, height: H, progress: 0, bands: null, kick: 0, art: {} as CanvasImageSource, fontFamily: "x", logo: null,
    palette: clipPalette("glow", "#E8432F"),
    copy: { headline: "OUT NOW", tagline: "Ototo — Again", link: opts.story ? null : "droplr.fm/again", mark: "droplr.fm" },
    i, frames: opts.frames ?? 30 * 30, fps: 30, lines, fallback: "Again", options: opts.options,
  });
  return ops;
}
const texts = (ops: Op[]) => ops.filter((o) => o.kind === "text");
const shown = (ops: Op[], s: string) => texts(ops).filter((o) => o.text === s && (o.alpha ?? 1) > 0.01);
const clip = linesInWindow(song, 10, 30);
// At 3s into the clip "in one" (at 2s) has fully arrived.
const f3 = draw(clip, 90);
check("the current line is drawn at full strength", shown(f3, "in one").some((o) => (o.alpha ?? 0) > 0.95));
check("the next line waits underneath, dimmed", shown(f3, "in two").some((o) => (o.alpha ?? 1) < 0.6));
check("the line before has gone once the new one has landed", shown(f3, "held").length === 0);
check("…and the link is on the frame", shown(f3, "droplr.fm/again").length === 1);
check("hiding the next line hides it", shown(draw(clip, 90, { options: { showNext: false } }), "in two").length === 0);
check("a line isn't drawn before it was tapped", shown(draw(clip, 30), "in one").every((o) => (o.alpha ?? 1) < 0.6));
check("no lines in the clip: the title stands in", shown(draw([], 90), "Again").length === 1);
// A line still being sung at the end, so the end card has something to replace.
const end = draw(linesInWindow([{ text: "closing words", ms: 27_000 }], 0, 30), 30 * 30 - 5);
check(`the last ${LYRICS_END_CARD_S} seconds are the end card: headline up, lyrics gone`, shown(end, "OUT NOW").some((o) => (o.alpha ?? 0) > 0.9) && texts(end).every((o) => o.text !== "closing words" || (o.alpha ?? 1) < 0.05));
check("…and before it the line is up", shown(draw(linesInWindow([{ text: "closing words", ms: 27_000 }], 0, 30), 28 * 30), "closing words").some((o) => (o.alpha ?? 0) > 0.95));
check("the resting preview shows the first line settled", shown(draw(clip, -1), "held").some((o) => (o.alpha ?? 0) > 0.95));

// A long line on a Story, with a long next line, at every frame across its arrival: nothing below
// the floor, so nothing reaches the sticker band.
const long = linesInWindow([
  { text: "this is a very long line, as long as a line is allowed to be, that has to wrap onto more rows than a story frame has room for, so it shrinks", ms: 1000 },
  { text: "and the next one is just as long, so that as the line above it arrives, it would push down into the sticker band if nothing stopped it there", ms: 6000 },
], 0, 15);
let deepest = 0;
// Every frame: the deepest moment is a few frames into a line's arrival, while it is still rising.
for (let i = 0; i < 15 * 30; i++) {
  for (const o of texts(draw(long, i, { story: true, frames: 15 * 30 }))) {
    if (o.text === "Ototo — Again" || o.text === "droplr.fm") continue;
    deepest = Math.max(deepest, o.a![0]);
  }
}
const floor = lyricsLayout(1080, 1920, true).floor;
check("on a Story no lyric goes below the floor", deepest <= floor, `${deepest} > ${floor}`);
check("…so none reaches the sticker band", deepest < STORY_STICKER_BAND.top, String(deepest));
check("…and the Story prints no link", texts(draw(clip, 90, { story: true })).every((o) => o.text !== "droplr.fm/again"));
check("the story floor sits above the sticker band", lyricsLayout(1080, 1920, true).floor < STORY_STICKER_BAND.top);
check("a feed post draws too", shown(draw(clip, 90, { square: true }), "in one").length === 1);

console.log("wiring");
check("Lyrics is a clip style, so a render is counted", (CLIP_STYLES as readonly string[]).includes("lyrics"));
const forge = read("src/components/admin/clip-forge.tsx");
check("the panel draws the Lyrics style", /style === "lyrics"[\s\S]{0,40}drawLyricsFrame/.test(forge));
for (const p of ["src/app/admin/releases/[id]/page.tsx", "src/app/admin/clips/[id]/page.tsx", "src/app/dashboard/clips/[id]/page.tsx"]) {
  const src = read(p);
  check(`${p} passes the lyrics in`, src.includes("lyrics={lyricsOf(release.lyrics)}") && src.includes("lyricsTrackMs={release.lyricsTrackMs}"));
}
check("only the label's own release page can edit them", read("src/app/admin/releases/[id]/page.tsx").includes("lyricsEditable={true}") && read("src/app/admin/clips/[id]/page.tsx").includes("lyricsEditable={false}") && read("src/app/dashboard/clips/[id]/page.tsx").includes("lyricsEditable={false}"));
check("the route is scoped by labelRelease", /labelRelease\(id\)/.test(read("src/app/api/admin/releases/[id]/lyrics/route.ts")));
const card = read("src/components/admin/lyrics-card.tsx");
check("the lyrics card sends no audio anywhere: its only fetch is the lyrics route", (card.match(/fetch\(/g) ?? []).length === 1 && card.includes("/lyrics`"));
check("the migration only adds nullable columns", /ADD COLUMN IF NOT EXISTS "lyrics" JSONB;/.test(read("prisma/migrations/20261117000000_release_lyrics/migration.sql")) && !/NOT NULL|DROP/i.test(read("prisma/migrations/20261117000000_release_lyrics/migration.sql").replace(/^--.*$/gm, "")));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
