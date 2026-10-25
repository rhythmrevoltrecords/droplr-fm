/**
 * The Type clip style: kinetic typography for a release, cut on the beat.
 *
 * Big words fill the frame one at a time, the two colours swap on every cut, a scratched texture
 * boils behind them, and the logo slams in on the drop. It ends on a card with the out-now line, the
 * track and the link. Like Motion it is drawn by the shared canvas renderer, so nothing is sent
 * anywhere and the preview is the render.
 *
 * Three things here are decisions, not taste:
 *  - **cuts come from the track's own tempo**, found from the per-frame low end (beatGrid). When the
 *    grid isn't clear it falls back to 128 BPM from the first kick and says so (sure: false), rather
 *    than inventing a confident grid that cuts between beats;
 *  - **no more than three colour swaps a second**, whatever the tempo and cut setting. Full-frame
 *    colour flips are the flashing that photosensitivity guidance warns about, and a 180 BPM track
 *    cut on every beat would otherwise flip six times a second (MIN_STEP_SECONDS);
 *  - **the link is on every frame after the first kick** and on the end card, except on a Story,
 *    where the link is a sticker. Same reason as the other styles: a crop that removes the droplr
 *    mark removes the link with it.
 *
 * Fonts are SIL Open Font License files served from /fonts/clip, each with its OFL.txt beside it.
 * OFL is the licence that allows a font to be embedded in a tool where other people type their own
 * words and export the result. Most commercial and "free for commercial use" licences forbid
 * exactly that, Fontshare's included since August 2026. Don't add a font here without checking.
 */
import { BANDS } from "./clip";
import { drawStickerGuide, MONO, roundRect, STORY_SAFE_TOP, type FrameArgs } from "./clip-frame";
import { contrastOf } from "./clip-theme";

// --- fonts --------------------------------------------------------------------------------------

export const TYPE_FONTS = [
  { id: "anton", name: "Anton", hint: "Heavy and condensed" },
  { id: "bebas-neue", name: "Bebas Neue", hint: "Clean condensed capitals" },
  { id: "league-gothic", name: "League Gothic", hint: "Tall and narrow" },
  { id: "big-shoulders", name: "Big Shoulders", hint: "Black condensed" },
  { id: "archivo-black", name: "Archivo Black", hint: "Wide heavy grotesque" },
  { id: "unbounded", name: "Unbounded", hint: "Wide and round" },
  { id: "bowlby-one", name: "Bowlby One", hint: "Chunky poster" },
  { id: "rubik-dirt", name: "Rubik Dirt", hint: "Distressed" },
  { id: "rubik-glitch", name: "Rubik Glitch", hint: "Glitched" },
] as const;
export type TypeFontId = (typeof TYPE_FONTS)[number]["id"];
export const DEFAULT_TYPE_FONT: TypeFontId = "anton";
export const isTypeFont = (v: unknown): v is TypeFontId => TYPE_FONTS.some((f) => f.id === v);
export const typeFontFile = (id: TypeFontId) => `/fonts/clip/${id}.woff2`;
/** The registered family name. Quoted in the canvas font string; never a system font name. */
export const typeFontName = (id: TypeFontId) => `droplr-type-${id}`;
/** What canvas text asks for. The fallbacks only show for the moment before the file arrives. */
export const typeFontStack = (id: TypeFontId) => `"${typeFontName(id)}", Impact, "Arial Narrow", sans-serif`;

const fontLoads = new Map<TypeFontId, Promise<boolean>>();
/**
 * Load a Type font into the document, once. Resolves false when the browser can't (no FontFace, a
 * blocked request); the clip still renders, in the fallback face, and the caller says so.
 * Browser only: never called on the server or by the tests.
 */
export function loadTypeFont(id: TypeFontId): Promise<boolean> {
  const cached = fontLoads.get(id);
  if (cached) return cached;
  const p = (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    try {
      const face = new FontFace(typeFontName(id), `url(${typeFontFile(id)}) format("woff2")`);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      fontLoads.delete(id);
      return false;
    }
  })();
  fontLoads.set(id, p);
  return p;
}

// --- colours ------------------------------------------------------------------------------------

/** Two colours that swap places on every cut, and a pop colour for the glitch, bar and link. */
export type TypePalette = { a: string; b: string; pop: string };
export type TypePaletteId = "blood" | "ice" | "acid" | "paper" | "night" | "mono" | "artwork";
export const TYPE_PALETTES: readonly { id: TypePaletteId; name: string; colours: TypePalette | null }[] = [
  { id: "blood", name: "Blood", colours: { a: "#D7392B", b: "#0B0B0B", pop: "#F4EDE4" } },
  { id: "ice", name: "Ice", colours: { a: "#5EC8E5", b: "#7A3FC0", pop: "#FFFFFF" } },
  { id: "acid", name: "Acid", colours: { a: "#0A0A0A", b: "#C8FF2E", pop: "#FF3EA5" } },
  { id: "paper", name: "Paper", colours: { a: "#EFE9DD", b: "#151515", pop: "#E8432F" } },
  { id: "night", name: "Night", colours: { a: "#0E1030", b: "#FF5EC4", pop: "#57E1FF" } },
  { id: "mono", name: "Mono", colours: { a: "#0A0A0A", b: "#FFFFFF", pop: "#9A9A9A" } },
  // From the release's own colour: that colour, against whichever of near-black or near-white reads.
  { id: "artwork", name: "From your artwork", colours: null },
];
export const DEFAULT_TYPE_PALETTE: TypePaletteId = "blood";
export type TypeColourOverrides = Partial<TypePalette>;

export function typePalette(id: TypePaletteId, accent: string, overrides: TypeColourOverrides = {}): TypePalette {
  const preset = TYPE_PALETTES.find((p) => p.id === id)?.colours;
  const base: TypePalette = preset ?? (() => {
    const dark = "#0B0B0B", light = "#F4F1EA";
    const b = contrastOf(accent, dark) >= contrastOf(accent, light) ? dark : light;
    return { a: accent, b, pop: b === dark ? light : dark };
  })();
  return { a: overrides.a ?? base.a, b: overrides.b ?? base.b, pop: overrides.pop ?? base.pop };
}

/** Words drawn in one colour on the other: under 3:1 the big words stop reading. */
export function typeColourWarnings(p: TypePalette): string[] {
  return contrastOf(p.a, p.b) < 3 ? ["Colour 1 and colour 2 are too close — the words won't read when they swap. Pull one lighter or darker."] : [];
}

// --- tempo --------------------------------------------------------------------------------------

/** In frames. Period is fractional: at 30 fps a whole-frame period is off by up to 4 BPM. */
export type BeatGrid = { period: number; offset: number; bpm: number; sure: boolean };
export const FALLBACK_BPM = 128;

/**
 * The beat grid of the clip, from the low-end envelope the other styles already use.
 *
 * Onsets are the rises in the low end. Every tempo from 85 to 180 BPM in quarter steps, at every
 * half-frame phase, is scored by the average onset strength landing on its beats; the best wins.
 * "Sure" means the best grid clearly beats the average one. When it doesn't (a beatless intro, an
 * ambient clip) the grid is 128 BPM from the first rise, and the UI says the cuts are a guess.
 */
export function beatGrid(low: number[], fps: number): BeatGrid {
  const n = low.length;
  const fallback = (offset: number): BeatGrid => ({ period: (fps * 60) / FALLBACK_BPM, offset, bpm: FALLBACK_BPM, sure: false });
  if (n < fps * 3) return fallback(0);
  const onset = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, low[i] - low[i - 1]);
  // A beat can fall between frames, so take the stronger of the two frames either side.
  const at = (f: number) => {
    const a = Math.floor(f);
    return a < 0 || a + 1 >= n ? 0 : Math.max(onset[a], onset[a + 1]);
  };
  let best = { score: -1, period: 0, offset: 0, bpm: 0 };
  let total = 0, count = 0;
  for (let bpm = 85; bpm <= 180; bpm += 0.25) {
    const period = (fps * 60) / bpm;
    for (let off = 0; off < period; off += 0.5) {
      let s = 0, k = 0;
      for (let f = off; f < n - 1; f += period) { s += at(f); k++; }
      const score = k ? s / k : 0;
      total += score; count++;
      if (score > best.score) best = { score, period, offset: off, bpm };
    }
  }
  // Half time scores the same as the real tempo (every second beat still lands), so check double:
  // if the in-between beats are real too, it's the faster tempo. 87 BPM with a kick on every 172nd
  // of a minute is drum and bass at 174.
  if (best.bpm * 2 <= 180) {
    const bpm = best.bpm * 2, period = (fps * 60) / bpm;
    let top = { score: -1, offset: 0 };
    for (let off = 0; off < period; off += 0.5) {
      let s = 0, k = 0;
      for (let f = off; f < n - 1; f += period) { s += at(f); k++; }
      const score = k ? s / k : 0;
      if (score > top.score) top = { score, offset: off };
    }
    if (top.score >= best.score * 0.85) best = { score: top.score, period, offset: top.offset, bpm };
  }
  const mean = count ? total / count : 0;
  const firstRise = onset.findIndex((v) => v > 0.05);
  if (best.score <= 0 || best.score < mean * 1.8) return fallback(Math.max(0, firstRise));
  return { period: best.period, offset: best.offset, bpm: best.bpm, sure: true };
}

// --- the sequence -------------------------------------------------------------------------------

/** The fastest cut allowed: three a second, so never more than three full-frame colour swaps. */
export const MIN_STEP_SECONDS = 1 / 3;
export const TYPE_CUTS = [1, 2, 4] as const;
export type TypeCut = (typeof TYPE_CUTS)[number];
export const TYPE_CUT_LABELS: Record<TypeCut, string> = { 1: "Every beat", 2: "Every 2 beats", 4: "Every bar" };
export const TYPE_BACKGROUNDS = ["scratch", "grain", "clean"] as const;
export type TypeBackground = (typeof TYPE_BACKGROUNDS)[number];
export const TYPE_BACKGROUND_LABELS: Record<TypeBackground, string> = { scratch: "Scratched", grain: "Grain", clean: "Clean" };

export type TypeStepKind = "intro" | "word" | "stack" | "logo" | "art" | "loop" | "end";
export type TypeStep = { start: number; end: number; kind: TypeStepKind; text: string; invert: boolean; fx: number };

export type TimelineArgs = {
  frames: number;
  fps: number;
  grid: BeatGrid;
  /** Frame of the drop (lib/clip-motion motionCues): the logo lands on the cut nearest it. */
  drop: number;
  words: string[];
  every: TypeCut;
  hasLogo: boolean;
  loops: boolean;
  /** The audio fade-out, in seconds: the end card outlasts it so the link is read before black. */
  fadeOut: number;
};

/** Up to eight lines the artist typed, trimmed, upper-cased, empties dropped. */
export function typeWords(raw: string, fallback: string[]): string[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim().toUpperCase().slice(0, 28)).filter(Boolean).slice(0, 8);
  return lines.length ? lines : fallback.map((w) => w.toUpperCase()).filter(Boolean);
}

export function typeTimeline(a: TimelineArgs): TypeStep[] {
  const { frames, fps, grid } = a;
  if (frames <= 0) return [];
  const words = a.words.length ? a.words : ["OUT NOW"];
  // Slow the cut down until it is no faster than the cap.
  let every: number = a.every;
  while (grid.period * every < fps * MIN_STEP_SECONDS) every *= 2;
  const step = grid.period * every;
  const endLen = Math.round(Math.max(2.5, a.fadeOut + 1.5) * fps);
  const endAt = Math.max(0, frames - endLen);

  const cuts: number[] = [];
  for (let f = grid.offset; f < endAt; f += step) if (f > 0) cuts.push(Math.round(f));
  // Snap the end card onto the last cut before it when that would leave a sliver: a short last
  // step would be a flash the cap above never saw.
  const sliver = Math.max(step * 0.6, fps * MIN_STEP_SECONDS);
  const endStart = cuts.length && endAt - cuts[cuts.length - 1] < sliver ? cuts.pop()! : endAt;

  const steps: TypeStep[] = [];
  // Same for the front: a beat a few frames in would make the intro a flash. Start on it instead.
  if (cuts.length && cuts[0] < fps * MIN_STEP_SECONDS) cuts[0] = 0;
  const firstCut = cuts.length ? cuts[0] : endStart;
  if (firstCut > 0) steps.push({ start: 0, end: firstCut, kind: "intro", text: "", invert: false, fx: 0 });

  let dropIdx = -1;
  if (cuts.length) {
    let bestD = Infinity;
    cuts.forEach((c, k) => { const d = Math.abs(c - a.drop); if (d < bestD && k > 0) { bestD = d; dropIdx = k; } });
  }
  let w = 0, sinceLoop = 0, artShown = false;
  for (let k = 0; k < cuts.length; k++) {
    const start = cuts[k];
    const end = k + 1 < cuts.length ? cuts[k + 1] : endStart;
    if (end <= start) continue;
    const invert = k % 2 === 1;
    const fx = (k * 7 + 3) % 4;
    if (k === dropIdx) {
      steps.push({ start, end, kind: a.hasLogo ? "logo" : "art", text: "", invert: false, fx });
      sinceLoop = 0;
      continue;
    }
    if (a.loops && sinceLoop >= 4) {
      steps.push({ start, end, kind: "loop", text: "", invert, fx: k });
      sinceLoop = 0;
      continue;
    }
    // The artwork once, early, when the logo is taking the drop.
    if (a.hasLogo && !artShown && k === Math.max(2, Math.floor(cuts.length * 0.25)) && k < dropIdx) {
      steps.push({ start, end, kind: "art", text: "", invert, fx });
      artShown = true;
      sinceLoop++;
      continue;
    }
    const text = words[w % words.length];
    w++;
    const stack = text.length <= 9 && !text.includes(" ") && w % 3 === 0;
    steps.push({ start, end, kind: stack ? "stack" : "word", text, invert, fx });
    sinceLoop++;
  }
  steps.push({ start: endStart, end: frames, kind: "end", text: "", invert: false, fx: 0 });
  return steps;
}

/** A believable 128 BPM analysis, so the preview moves before a track is chosen. Never rendered. */
export function demoAnalysis(frames: number, fps: number) {
  const period = (fps * 60) / FALLBACK_BPM;
  const low: number[] = [];
  const bands: number[][] = Array.from({ length: BANDS }, () => []);
  for (let i = 0; i < frames; i++) {
    const ph = (i % period) / period;
    const kick = Math.exp(-ph * 6);
    low.push(0.25 + 0.7 * kick);
    for (let b = 0; b < BANDS; b++) {
      const base = 0.55 - (b / BANDS) * 0.35;
      bands[b].push(Math.max(0, Math.min(1, base * (0.6 + 0.4 * kick) + 0.12 * Math.sin(i * 0.31 + b * 1.7))));
    }
  }
  return { low, bands, bandCount: BANDS };
}

// --- drawing ------------------------------------------------------------------------------------

export type TypeOptions = {
  font: TypeFontId;
  background: TypeBackground;
  glitch: boolean;
  colours: TypePalette;
  /** The big line on the end card: "OUT NOW", "OUT FRI 30 OCT". */
  endLine: string;
  fadeIn: number;
  fadeOut: number;
};

export type TypeArgs = FrameArgs & {
  /** Frame index, or -1 for the resting preview: the first word, settled. */
  i: number;
  frames: number;
  fps: number;
  timeline: TypeStep[];
  options: TypeOptions;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const easeOutBack = (v: number) => { const c = 1.7, t = clamp01(v) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

/** Small, fast, seeded: the texture has to come out the same in the preview and the render. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

function texture(x: CanvasRenderingContext2D, W: number, H: number, kind: TypeBackground, ink: string, seed: number, s: number) {
  if (kind === "clean") return;
  const r = rng(seed);
  if (kind === "scratch") {
    const angle = -0.5 + r() * 1.0 + Math.PI / 4;
    x.save();
    x.strokeStyle = hexToRgba(ink, 0.2);
    for (let k = 0; k < 140; k++) {
      const len = (30 + r() * 160) * s;
      const cx = r() * W, cy = r() * H;
      const a = angle + (r() - 0.5) * 0.5;
      x.lineWidth = (0.8 + r() * 2.6) * s;
      x.beginPath();
      x.moveTo(cx - Math.cos(a) * len / 2, cy - Math.sin(a) * len / 2);
      x.lineTo(cx + Math.cos(a) * len / 2, cy + Math.sin(a) * len / 2);
      x.stroke();
    }
    x.restore();
    return;
  }
  x.fillStyle = hexToRgba(ink, 0.14);
  for (let k = 0; k < 1400; k++) {
    const d = (1 + r() * 2.2) * s;
    x.fillRect(r() * W, r() * H, d, d);
  }
}

/** Split a line into rows and find the size that fills the width without overrunning the height. */
function layoutWords(x: CanvasRenderingContext2D, text: string, family: string, maxW: number, maxH: number) {
  x.font = `100px ${family}`;
  const width = (t: string) => Math.max(1, x.measureText(t).width);
  const parts = text.split(/\s+/).filter(Boolean);
  let best = { rows: [text], size: 0 };
  const tries: string[][] = [[text]];
  if (parts.length >= 2) {
    for (let cut = 1; cut < parts.length; cut++) tries.push([parts.slice(0, cut).join(" "), parts.slice(cut).join(" ")]);
  }
  if (parts.length >= 3) tries.push([parts[0], parts.slice(1, -1).join(" "), parts[parts.length - 1]]);
  for (const rows of tries) {
    const widest = Math.max(...rows.map(width));
    const size = Math.min((maxW / widest) * 100, maxH / (rows.length * 0.92));
    if (size > best.size) best = { rows, size };
  }
  return best;
}

function drawRows(x: CanvasRenderingContext2D, rows: string[], size: number, family: string, cx: number, cy: number, fill: string, dx = 0) {
  x.font = `${size.toFixed(1)}px ${family}`;
  x.fillStyle = fill;
  const lh = size * 0.92;
  const top = cy - (lh * rows.length) / 2;
  rows.forEach((row, k) => x.fillText(row, cx + dx, top + lh * (k + 0.5) + size * 0.34));
}

function drawLoop(x: CanvasRenderingContext2D, W: number, H: number, p: TypePalette, t: number, which: number, kick: number) {
  const cx = W / 2, cy = H / 2;
  const reach = Math.hypot(W, H) * 0.6;
  const rings = 14;
  const phase = (t * 0.9) % 1;
  if (which % 2 === 0) {
    // Tunnel: nested squares rushing outwards, largest first.
    for (let k = rings; k >= 0; k--) {
      const f = (k + phase) / rings;
      const half = f * f * reach * (1 + 0.04 * kick);
      x.fillStyle = k % 2 === 0 ? p.a : p.b;
      x.fillRect(cx - half, cy - half, half * 2, half * 2);
    }
  } else {
    // Spiral: rings with a centre that drifts round, which reads as the whole thing turning.
    for (let k = rings; k >= 0; k--) {
      const f = (k + phase) / rings;
      const r = f * f * reach * (1 + 0.04 * kick);
      const ang = t * 2.2 + k * 0.45;
      x.beginPath();
      x.arc(cx + Math.cos(ang) * r * 0.08, cy + Math.sin(ang) * r * 0.08, Math.max(1, r), 0, Math.PI * 2);
      x.fillStyle = k % 2 === 0 ? p.a : p.b;
      x.fill();
    }
  }
}

export function drawTypeFrame(a: TypeArgs) {
  const { ctx: x, width: W, height: H, kick, art, fontFamily: SANS, logo, copy, stickerGuide, progress, i, fps, timeline } = a;
  const o = a.options;
  const p = o.colours;
  const k = kick || 0;
  const s = W / 1080;
  const vertical = H > W;
  const story = vertical && copy.link === null;
  const family = typeFontStack(o.font);
  const resting = i < 0;

  let idx = timeline.findIndex((st) => st.kind === "word" || st.kind === "stack");
  if (!resting) {
    idx = timeline.findIndex((st) => i >= st.start && i < st.end);
    if (idx < 0) idx = timeline.length - 1;
  }
  const st: TypeStep = timeline[idx] ?? { start: 0, end: 1, kind: "end", text: "", invert: false, fx: 0 };
  const f = resting ? st.start + Math.round(fps * 0.4) : i;
  const local = (f - st.start) / fps;
  const bg = st.invert ? p.b : p.a;
  const ink = st.invert ? p.a : p.b;

  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // The texture boils on twos: a new seed every second frame, like hand-drawn animation.
  const seed = idx * 101 + Math.floor(f / 2);
  // The words live between the top chrome and the caption: centred a little high on a 9:16.
  const cy = vertical ? (story ? H * 0.4 : H * 0.44) : H * 0.46;
  const maxW = W * 0.9;
  const maxH = vertical ? H * 0.42 : H * 0.6;

  switch (st.kind) {
    case "intro":
    case "loop": {
      drawLoop(x, W, H, p, local + idx, st.kind === "intro" ? 0 : st.fx, k);
      texture(x, W, H, o.background, ink, seed, s);
      break;
    }
    case "word":
    case "stack": {
      texture(x, W, H, o.background, ink, seed, s);
      const L = layoutWords(x, st.text, family, maxW, st.kind === "stack" ? maxH / 2.4 : maxH);
      const pulse = 1 + 0.03 * k;
      const e = local / 0.16;
      if (st.kind === "stack") {
        // The word repeated down the frame, each row landing a moment after the last.
        const lh = L.size * 0.92;
        for (let r = 0; r < 3; r++) {
          const show = clamp01((local - r * 0.07) / 0.06);
          if (show <= 0) continue;
          x.save();
          x.globalAlpha = show;
          drawRows(x, L.rows, L.size * pulse, family, W / 2, cy + (r - 1) * lh * L.rows.length, ink, (r - 1) * 10 * s);
          x.restore();
        }
      } else {
        const fx = st.fx;
        if (fx === 0) {
          // Slam: from big to its size, with ghosts of the bigger sizes trailing.
          const sc = 1 + 0.35 * (1 - easeOutCubic(e));
          for (let g = 2; g >= 1; g--) {
            if (e >= 1) break;
            x.save();
            x.globalAlpha = 0.18;
            drawRows(x, L.rows, L.size * (sc + g * 0.12) * pulse, family, W / 2, cy, ink);
            x.restore();
          }
          drawRows(x, L.rows, L.size * sc * pulse, family, W / 2, cy, ink);
        } else if (fx === 1) {
          // Smear: copies stretched sideways, closing in.
          const spread = (1 - easeOutCubic(e)) * 120 * s;
          for (let g = -2; g <= 2; g++) {
            if (!g || spread < 1) continue;
            x.save();
            x.globalAlpha = 0.22;
            drawRows(x, L.rows, L.size * pulse, family, W / 2, cy, ink, g * spread);
            x.restore();
          }
          drawRows(x, L.rows, L.size * pulse, family, W / 2, cy, ink);
        } else if (fx === 2) {
          // Drop: falls in from above and overshoots.
          const y = cy - (1 - easeOutBack(local / 0.22)) * H * 0.18;
          drawRows(x, L.rows, L.size * pulse, family, W / 2, y, ink);
        } else {
          // Cut: just there, hard, the way the reference clips do half their words.
          drawRows(x, L.rows, L.size * pulse, family, W / 2, cy, ink);
        }
        // Glitch on the hit: the word split into the pop colour and back, then a slice of the frame
        // knocked sideways. Only on the opening frames of a cut and only on a real kick.
        if (o.glitch && local < 0.12 && k > 0.6) {
          const dx = (8 + 10 * k) * s;
          x.save();
          x.globalAlpha = 0.55;
          drawRows(x, L.rows, L.size * pulse, family, W / 2, cy, p.pop, -dx);
          x.restore();
          drawRows(x, L.rows, L.size * pulse, family, W / 2, cy, ink, dx * 0.4);
          if (x.canvas && typeof x.drawImage === "function") {
            const r = rng(seed + 7);
            for (let sl = 0; sl < 3; sl++) {
              const y = Math.floor(r() * H * 0.8 + H * 0.1);
              const h = Math.floor((20 + r() * 70) * s);
              x.drawImage(x.canvas, 0, y, W, h, (r() - 0.5) * 60 * s, y, W, h);
            }
          }
        }
      }
      break;
    }
    case "logo":
    case "art": {
      texture(x, W, H, o.background, ink, seed, s);
      const e = local / 0.28;
      const sc = (1.5 - 0.5 * easeOutBack(e)) * (1 + 0.04 * k);
      const shake = (1 - clamp01(e)) * 16 * s;
      const r = rng(f);
      x.save();
      x.translate(W / 2 + (r() - 0.5) * shake, cy + (r() - 0.5) * shake);
      x.scale(sc, sc);
      if (st.kind === "logo" && logo) {
        const box = Math.min(W * 0.72, (vertical ? H * 0.32 : H * 0.5));
        const ratio = logo.width / Math.max(1, logo.height);
        const w = ratio >= 1 ? box : box * ratio;
        const h = ratio >= 1 ? box / ratio : box;
        x.drawImage(logo.img, -w / 2, -h / 2, w, h);
      } else if (art) {
        const side = Math.min(W * 0.72, vertical ? H * 0.4 : H * 0.62);
        x.save();
        roundRect(x, -side / 2, -side / 2, side, side, 18 * s);
        x.clip();
        x.drawImage(art, -side / 2, -side / 2, side, side);
        // Tinted into the palette: the artwork's light and shade, in the clip's colour.
        x.globalCompositeOperation = "color";
        x.fillStyle = bg === p.a ? p.b : p.a;
        x.fillRect(-side / 2, -side / 2, side, side);
        x.restore();
      }
      x.restore();
      break;
    }
    case "end": {
      texture(x, W, H, o.background, ink, seed, s);
      const L = layoutWords(x, o.endLine.toUpperCase() || "OUT NOW", family, maxW, vertical ? H * 0.3 : H * 0.36);
      const e = easeOutBack(local / 0.3);
      const y = (vertical ? H * 0.36 : H * 0.36) + (1 - e) * 60 * s;
      x.save();
      x.globalAlpha = clamp01(local / 0.12);
      drawRows(x, L.rows, L.size, family, W / 2, y, ink);
      x.restore();
      if (copy.tagline) {
        const t = clamp01((local - 0.25) / 0.25);
        x.font = `100px ${family}`;
        const size = Math.min(54 * s, (maxW / Math.max(1, x.measureText(copy.tagline.toUpperCase()).width)) * 100);
        x.save();
        x.globalAlpha = t;
        x.font = `${size.toFixed(1)}px ${family}`;
        x.fillStyle = ink;
        x.fillText(copy.tagline.toUpperCase(), W / 2, y + (L.size * 0.92 * L.rows.length) / 2 + 70 * s);
        x.restore();
      }
      break;
    }
  }

  // The link and the mark, small, from the first kick on (every cut after the intro), in the ink of
  // whatever is on screen. On the end card the link is a pill, bigger, landing after the words.
  const afterIntro = resting || st.kind !== "intro";
  const isEnd = st.kind === "end";
  const footInk = st.kind === "loop" || st.kind === "intro" ? p.pop : ink;
  const linkY = vertical ? (story ? 0 : 1560 * s) : H - 92 * s;
  const markY = vertical ? (story ? (STORY_SAFE_TOP + 1130) * s : 1618 * s) : H - 44 * s;
  if (copy.link !== null && afterIntro) {
    x.save();
    if (isEnd) {
      const t = clamp01((local - 0.45) / 0.2);
      x.globalAlpha = t;
      const size = Math.round((vertical ? 38 : 32) * s);
      x.font = `600 ${size}px ${MONO}`;
      const w = Math.min(W - 100 * s, x.measureText(copy.link).width + 90 * s);
      const h = size * 2.4;
      const top = (vertical ? 1180 * s : H * 0.62) + (1 - easeOutBack((local - 0.45) / 0.3)) * 40 * s;
      roundRect(x, W / 2 - w / 2, top, w, h, h / 2);
      x.fillStyle = ink;
      x.fill();
      x.fillStyle = bg;
      x.fillText(copy.link, W / 2, top + h / 2 + size * 0.36);
    } else {
      x.globalAlpha = 0.85;
      x.font = `600 ${Math.round((vertical ? 30 : 24) * s)}px ${MONO}`;
      x.fillStyle = footInk;
      x.fillText(copy.link, W / 2, linkY);
    }
    x.restore();
  }
  if (copy.mark && afterIntro) {
    x.save();
    x.globalAlpha = 0.75;
    x.font = `600 ${Math.round((vertical ? 24 : 20) * s)}px ${SANS}`;
    x.fillStyle = footInk;
    x.fillText(copy.mark, W / 2, markY);
    x.restore();
  }

  if (story && stickerGuide) drawStickerGuide(x, W, H / 1920, p.pop, SANS);

  x.fillStyle = p.pop;
  x.fillRect(0, H - 10 * s, W * clamp01(progress), 10 * s);

  if (!resting) {
    const t = i / fps;
    const lastT = (a.frames - 1) / fps;
    const fadeInA = o.fadeIn > 0 ? 1 - clamp01(t / o.fadeIn) : 0;
    const fadeOutA = o.fadeOut > 0 ? clamp01((t - (lastT - o.fadeOut)) / o.fadeOut) : 0;
    const black = Math.max(fadeInA, fadeOutA);
    if (black > 0.001) {
      x.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
      x.fillRect(0, 0, W, H);
    }
  }
}
