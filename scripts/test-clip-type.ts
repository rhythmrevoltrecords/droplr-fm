/**
 * The Type clip style: the cuts follow the track, never flash faster than three a second, and the
 * link is always there.
 *
 * What this defends:
 *  - **the beat grid finds the tempo**, to a quarter BPM, and says when it can't. A grid that is
 *    one frame off per beat drifts a whole beat in twenty seconds and every cut lands between kicks;
 *  - **no more than three colour swaps a second** at any tempo and any cut setting. This is the
 *    photosensitivity cap, and the easiest thing to lose by "just letting fast tracks cut faster";
 *  - the logo lands on the drop, and the artwork takes it when there's no logo;
 *  - the end card is long enough to read before the fade, and carries the link and the mark;
 *  - on a Story no link is printed (it's a sticker) and the mark still is;
 *  - every font is an OFL file that is actually in the repo, with its licence beside it;
 *  - the gate is the page-looks gate, and every page that renders the clip passes it.
 *
 * Pure functions and a recording canvas: no database, no browser.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  beatGrid, demoAnalysis, drawTypeFrame, FALLBACK_BPM, MIN_STEP_SECONDS, TYPE_CUTS, TYPE_FONTS, typeColourWarnings, typeFontFile,
  typePalette, typeTimeline, typeWords, type TypeStep,
} from "../src/lib/clip-type";
import { CLIP_STYLES } from "../src/lib/clip-motion";
import { planOf } from "../src/lib/plans";
const root = join(import.meta.dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};

const FPS = 30;
/** A low-end envelope with a kick on every beat: sharp rise, slow decay, a little noise. */
function kicks(bpm: number, offset: number, seconds: number, seed = 1) {
  const n = Math.round(seconds * FPS);
  const period = (FPS * 60) / bpm;
  let r = seed;
  const noise = () => { r = (r * 16807) % 2147483647; return (r / 2147483647) * 0.06; };
  const low: number[] = [];
  for (let i = 0; i < n; i++) {
    const since = ((i - offset) % period + period) % period;
    low.push(i < offset ? noise() : 0.2 + 0.75 * Math.exp(-since / 3) + noise());
  }
  return low;
}

console.log("beat grid");
for (const [bpm, off] of [[128, 5], [140, 11], [174, 3], [122, 0], [95, 7], [90, 2]] as const) {
  const g = beatGrid(kicks(bpm, off, 30), FPS);
  // Phase is checked as distance to the nearest beat, since any beat of the grid is a valid offset.
  const period = (FPS * 60) / bpm;
  const ph = (((g.offset - off) % period) + period) % period;
  const phaseErr = Math.min(ph, period - ph);
  check(`finds ${bpm} BPM within a quarter`, g.sure && Math.abs(g.bpm - bpm) <= 0.25, `${g.bpm} sure=${g.sure}`);
  check(`…and its phase within a frame`, phaseErr <= 1, phaseErr.toFixed(2));
}
{
  let r = 7;
  const noise = Array.from({ length: 900 }, () => { r = (r * 16807) % 2147483647; return (r / 2147483647) * 0.3; });
  const g = beatGrid(noise, FPS);
  check("says it isn't sure on a beatless clip, and falls back to 128", !g.sure && g.bpm === FALLBACK_BPM, `${g.bpm} sure=${g.sure}`);
  const short = beatGrid(kicks(128, 0, 2), FPS);
  check("a clip under three seconds is a guess, not a grid", !short.sure);
}

console.log("sequence");
const words = typeWords("wassup\nyo\ngirl wassup??\n\n  out now  ", ["TITLE", "ARTIST"]);
check("words: trimmed, capitals, blank lines dropped", JSON.stringify(words) === JSON.stringify(["WASSUP", "YO", "GIRL WASSUP??", "OUT NOW"]), JSON.stringify(words));
check("no words: falls back to the title and the artist", JSON.stringify(typeWords("  \n ", ["Again", "Ototo"])) === JSON.stringify(["AGAIN", "OTOTO"]));
check("at most eight lines", typeWords(Array.from({ length: 12 }, (_, i) => `w${i}`).join("\n"), []).length === 8);

const base = { frames: 30 * FPS, fps: FPS, drop: 15 * FPS, words, every: 2 as const, hasLogo: true, loops: true, fadeOut: 1 };
function swapsPerSecondMax(steps: TypeStep[]) {
  // A swap is any cut where the background colour changes.
  const bgOf = (s: TypeStep) => (s.kind === "word" || s.kind === "stack" ? (s.invert ? "b" : "a") : s.kind);
  const swaps: number[] = [];
  for (let k = 1; k < steps.length; k++) if (bgOf(steps[k]) !== bgOf(steps[k - 1])) swaps.push(steps[k].start);
  let worst = 0;
  for (const t of swaps) worst = Math.max(worst, swaps.filter((u) => u >= t && u < t + FPS).length);
  return worst;
}
for (const bpm of [95, 128, 140, 174, 180]) {
  for (const every of TYPE_CUTS) {
    const steps = typeTimeline({ ...base, every, grid: beatGrid(kicks(bpm, 4, 30), FPS) });
    const shortest = Math.min(...steps.slice(1, -1).map((s) => s.end - s.start));
    const worst = swapsPerSecondMax(steps);
    if (every === 1 || bpm === 180) {
      check(`${bpm} BPM, cut ${every}: no step under a third of a second`, shortest >= Math.floor(FPS * MIN_STEP_SECONDS), String(shortest));
      check(`${bpm} BPM, cut ${every}: at most three swaps in any second`, worst <= 3, String(worst));
    }
  }
}
{
  // A grid faster than anything real (a tempo detector bug, a future double-time option) still
  // can't flash faster than the cap.
  const steps = typeTimeline({ ...base, every: 1, grid: { period: 6, offset: 0, bpm: 300, sure: true } });
  const shortest = Math.min(...steps.slice(1, -1).map((s) => s.end - s.start));
  check("a 300 BPM grid is still held to three swaps a second", swapsPerSecondMax(steps) <= 3 && shortest >= 10, `${swapsPerSecondMax(steps)} / ${shortest}`);
}
{
  const grid = beatGrid(kicks(128, 4, 30), FPS);
  const steps = typeTimeline({ ...base, grid });
  const covers = steps[0].start === 0 && steps[steps.length - 1].end === base.frames && steps.every((s, k) => k === 0 || s.start === steps[k - 1].end);
  check("the steps cover the clip with no gaps or overlaps", covers);
  const early = typeTimeline({ ...base, grid: { period: 14.0625, offset: 3, bpm: 128, sure: true } });
  check("a first beat three frames in doesn't make a three-frame intro", early.every((s) => s.end - s.start >= 10), early.slice(0, 2).map((s) => `${s.kind}:${s.end - s.start}`).join(" "));
  const end = steps[steps.length - 1];
  check("it ends on the end card, long enough to read", end.kind === "end" && end.end - end.start >= 2.5 * FPS * 0.85, `${end.kind} ${(end.end - end.start) / FPS}s`);
  const logo = steps.find((s) => s.kind === "logo");
  check("the logo lands on the cut nearest the drop", !!logo && Math.abs(logo.start - base.drop) <= grid.period * 2, logo ? String(logo.start) : "no logo step");
  check("the artwork shows once, before the logo", steps.filter((s) => s.kind === "art").length === 1 && steps.findIndex((s) => s.kind === "art") < steps.findIndex((s) => s.kind === "logo"));
  const noLogo = typeTimeline({ ...base, grid, hasLogo: false });
  check("no logo: the artwork takes the drop", !noLogo.some((s) => s.kind === "logo") && noLogo.some((s) => s.kind === "art"));
  const said = steps.filter((s) => s.kind === "word" || s.kind === "stack").map((s) => s.text);
  check("the words come in the order they were typed", said.slice(0, 4).join("|") === words.join("|"), said.slice(0, 4).join("|"));
  check("loops off: no tunnel or spiral breaks", !typeTimeline({ ...base, grid, loops: false }).some((s) => s.kind === "loop"));
  const longFade = typeTimeline({ ...base, grid, fadeOut: 2 });
  const lf = longFade[longFade.length - 1];
  check("a 2s fade-out stretches the end card past it", (lf.end - lf.start) / FPS >= 3.4 * 0.85, String((lf.end - lf.start) / FPS));
}

console.log("drawing");
type Op = { kind: string; text?: string; font?: string; y?: number };
let lastComps: string[] = [];
function record(copy: { link: string | null; mark: string | null; tagline?: string }, i: number, steps: TypeStep[], W = 1080, H = 1920, frames = 30 * FPS): Op[] {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", fillStyle: "#000", globalAlpha: 1 };
  const comps: string[] = [];
  lastComps = comps;
  const ctx = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      // 0.6em a character at whatever size is set, so fitting can be checked.
      if (k === "measureText") return (s: string) => ({ width: s.length * 0.6 * parseFloat(String(t.font).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "10") });
      if (k === "fillText") return (text: string, _x: number, y: number) => ops.push({ kind: "text", text, font: String(t.font), y });
      if (k === "canvas") return undefined;
      return () => { ops.push({ kind: k }); };
    },
    set(t, k: string, v) { if (k === "globalCompositeOperation") comps.push(String(v)); t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const colours = typePalette("blood", "#8B5CF6");
  drawTypeFrame({
    ctx, width: W, height: H, progress: 0.5, bands: null, kick: 0.9, art: {} as CanvasImageSource, fontFamily: "__App__", logo: null,
    palette: {} as never, copy: { headline: "OUT NOW", tagline: copy.tagline ?? "Ototo — Again", link: copy.link, mark: copy.mark }, stickerGuide: false,
    i, frames, fps: FPS, timeline: steps,
    options: { font: "anton", background: "scratch", glitch: true, colours, endLine: "OUT FRI 30 OCT", fadeIn: 0, fadeOut: 1 },
  });
  return ops;
}
{
  const steps = typeTimeline({ ...base, grid: beatGrid(kicks(128, 4, 30), FPS) });
  const endFrame = base.frames - 10;
  const end = record({ link: "droplr.fm/rrr/again", mark: "droplr.fm" }, endFrame, steps);
  const typeRows = end.filter((o) => /droplr-type-anton/.test(o.font ?? "")).map((o) => o.text).join(" ");
  check("end card: the out line, in the chosen font (it may wrap)", typeRows.startsWith("OUT FRI 30 OCT"), typeRows);
  check("end card: the link and the mark", end.some((o) => o.text === "droplr.fm/rrr/again") && end.some((o) => o.text === "droplr.fm"));
  const wordStep = steps.find((s) => s.kind === "word")!;
  const mid = record({ link: "droplr.fm/rrr/again", mark: "droplr.fm" }, wordStep.start + 3, steps);
  check("a word cut: the word, in the chosen font", mid.some((o) => o.text === wordStep.text && /droplr-type-anton/.test(o.font ?? "")), mid.filter((o) => o.text).map((o) => o.text).join(", "));
  check("a word cut: the link is on it too", mid.some((o) => o.text === "droplr.fm/rrr/again"));
  const story = record({ link: null, mark: "droplr.fm" }, wordStep.start + 3, steps);
  check("Story: no link printed, the mark still is", !story.some((o) => o.text?.includes("rrr/again")) && story.some((o) => o.text === "droplr.fm"));
  const clean = record({ link: "droplr.fm/rrr/again", mark: null }, endFrame, steps);
  check("paid plans without branding: no mark", !clean.some((o) => o.text === "droplr.fm"));
  const resting = record({ link: "x.fm/a", mark: null }, -1, steps);
  check("the resting frame shows a word, not an empty frame", resting.some((o) => words.includes(o.text ?? "")));
  const square = record({ link: "x.fm/a", mark: "droplr.fm" }, endFrame, steps, 1080, 1080);
  check("square: draws inside the frame", square.filter((o) => o.kind === "text").every((o) => (o.y ?? 0) < 1080), square.filter((o) => o.kind === "text").map((o) => `${o.text}@${Math.round(o.y ?? 0)}`).join(", "));
  const long = "music.rhythmrevoltrecords.com/ototo-messitupsingle";
  const px = (o: Op) => parseFloat(o.font?.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "0");
  const endLong = record({ link: long, mark: "droplr.fm" }, endFrame, steps).filter((o) => o.text === long);
  check("end card: a 50-character link fits inside the pill", endLong.length === 1 && long.length * 0.6 * px(endLong[0]) <= 1080 - 100 - 88, endLong.map((o) => `${px(o)}px`).join(","));
  const midLong = record({ link: long, mark: "droplr.fm" }, wordStep.start + 3, steps).filter((o) => o.text === long);
  check("word cuts: the long link fits the frame too", midLong.length === 1 && long.length * 0.6 * px(midLong[0]) <= 1080 - 80, midLong.map((o) => `${px(o)}px`).join(","));
  const shortEnd = record({ link: "droplr.fm/a", mark: null }, endFrame, steps).filter((o) => o.text === "droplr.fm/a");
  check("a short link keeps its full size", shortEnd.length === 1 && px(shortEnd[0]) === 38, shortEnd.map((o) => `${px(o)}px`).join(","));
  const noLogoSteps = typeTimeline({ ...base, hasLogo: false, grid: beatGrid(kicks(128, 4, 30), FPS) });
  const artStep = noLogoSteps.find((s) => s.kind === "art")!;
  const artOps = record({ link: "x.fm/a", mark: null }, artStep.start + 5, noLogoSteps);
  check("the artwork is drawn on its cut", artOps.some((o) => o.kind === "drawImage"));
  check("…in its own colours: nothing blended over it", lastComps.every((c) => c === "source-over"), lastComps.join(","));
  const demo = demoAnalysis(900, FPS);
  check("the demo beat is a clean 128 for the preview", Math.abs(beatGrid(demo.low, FPS).bpm - 128) <= 0.25);
}

console.log("colours");
check("every preset reads: words never sit on a near match", ["blood", "ice", "acid", "paper", "night", "mono"].every((id) => typeColourWarnings(typePalette(id as never, "#000000")).length === 0));
check("from your artwork: the accent against whichever of black or white reads", typeColourWarnings(typePalette("artwork", "#E8432F")).length === 0 && typeColourWarnings(typePalette("artwork", "#222222")).length === 0);
check("two close colours get a warning", typeColourWarnings(typePalette("blood", "#000", { a: "#222222", b: "#2A2A2A" })).length === 1);

console.log("fonts and licences");
for (const f of TYPE_FONTS) {
  const file = join(root, "public", typeFontFile(f.id));
  const licence = join(root, "public", "fonts", "clip", `${f.id}-OFL.txt`);
  check(`${f.name}: the file is in the repo`, existsSync(file));
  check(`${f.name}: its OFL licence is beside it`, existsSync(licence) && /SIL Open Font License/.test(readFileSync(licence, "utf8")));
}
check("no Fontshare face (its licence bans use in a tool like this)", !TYPE_FONTS.some((f) => /clash|satoshi|cabinet|general sans|switzer|zodiak|panchang|tanker/i.test(f.name)));

console.log("plans and wiring");
check("Type is a clip style", (CLIP_STYLES as readonly string[]).includes("type"));
check("Free has no Type, every paid plan does", !planOf("free").pageLooks && ["artist", "artist_pro", "pro", "label", "enterprise"].every((p) => planOf(p).pageLooks));
for (const page of ["src/app/admin/releases/[id]/page.tsx", "src/app/admin/clips/[id]/page.tsx", "src/app/dashboard/clips/[id]/page.tsx"]) {
  const src = read(page);
  check(`${page}: passes the page-looks gate and the release day`, /typeStyle=\{plan\.pageLooks\}/.test(src) && /releaseDay=\{formatInTz\(/.test(src));
}
const forge = read("src/components/admin/clip-forge.tsx");
check("the style picker refuses Type without the plan", /v === "type" && !props\.typeStyle/.test(forge));
check("the preview loop respects reduced motion", /prefers-reduced-motion: reduce/.test(forge));
check("nothing in the Type style sends anything anywhere", !/fetch\(|sendBeacon|XMLHttpRequest/.test(read("src/lib/clip-type.ts")));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
