/**
 * The Lyrics clip style: the release's own timed lyrics, line by line, over the artwork.
 *
 * Only what the artist timed. Each line comes up when they tapped it and stays until the next one
 * (or LYRIC_LINE_HOLD_MS), so the picture is exactly as right as their timing and never guesses.
 * There is no word-by-word wipe: a line has a start and no word times, and a wipe running at a
 * steady speed across words that are sung unevenly looks wrong on every line.
 *
 * Same frame conventions as the other styles (lib/clip-frame): the link stack at the bottom, a
 * Story leaves the sticker band empty, and the droplr mark travels with the link.
 *
 * The last two seconds are an end card: the lyrics give way to the headline, so the clip finishes on
 * "OUT NOW" and the link rather than on half a line.
 */
import { hexA } from "./clip";
import { drawStickerGuide, fitText, MONO, roundRect, STORY_SAFE_TOP, STORY_STICKER_BAND, type FrameArgs } from "./clip-frame";
import type { WindowLine } from "./lyrics";

export type LyricsOptions = { showNext: boolean; fadeIn: number; fadeOut: number };
export const DEFAULT_LYRICS_OPTIONS: LyricsOptions = { showNext: true, fadeIn: 0, fadeOut: 0 };
/** The end card's length. Shorter clips keep proportionally more of their lyrics. */
export const LYRICS_END_CARD_S = 2;
/** How long a line takes to arrive. Short: it lands on the word, not after it. */
export const LYRIC_IN_S = 0.3;

export type LyricsArgs = FrameArgs & {
  /** Frame index, or -1 for the resting preview. */
  i: number;
  frames: number;
  fps: number;
  /** The lines in this clip, in seconds from its start (lib/lyrics linesInWindow). */
  lines: WindowLine[];
  /** What to show when no line falls in the clip: the title, so the preview is never a blank card. */
  fallback: string;
  options?: Partial<LyricsOptions>;
};

type Layout = { artTop: number; side: number; centre: number; size: number; min: number; maxW: number; headline: number; link: number; tagline: number; mark: number; floor: number };

/** Exported for the tests: the bottom of the space lines may use. */
export function lyricsLayout(W: number, H: number, story: boolean): Layout {
  const s = W / 1080;
  if (H <= W) {
    return { artTop: 64 * s, side: 250 * s, centre: 560 * s, size: 68 * s, min: 44 * s, maxW: 940 * s, headline: 560 * s, link: 900 * s, tagline: 950 * s, mark: 996 * s, floor: 860 * s };
  }
  if (story) {
    // Between Instagram's profile row and the sticker band, which nothing may enter.
    return { artTop: (STORY_SAFE_TOP + 30) * s, side: 380 * s, centre: 930 * s, size: 84 * s, min: 54 * s, maxW: 920 * s, headline: 930 * s, link: 0, tagline: 1300 * s, mark: 1348 * s, floor: (STORY_STICKER_BAND.top - 160) * s };
  }
  return { artTop: 250 * s, side: 420 * s, centre: 1030 * s, size: 88 * s, min: 56 * s, maxW: 920 * s, headline: 1030 * s, link: 1480 * s, tagline: 1536 * s, mark: 1582 * s, floor: 1400 * s };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

/** Greedy word wrap. A single word wider than the line is left whole and shrunk by the caller. */
export function wrapWords(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let row = "";
  for (const w of words) {
    const next = row ? `${row} ${w}` : w;
    if (row && x.measureText(next).width > maxW) { rows.push(row); row = w; }
    else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

/** Up to three rows, shrinking until they fit. Returns the rows and the size used. */
function fitRows(x: CanvasRenderingContext2D, text: string, maxW: number, size: number, min: number, family: string) {
  let s = size;
  for (;;) {
    x.font = `800 ${Math.round(s)}px ${family}`;
    const rows = wrapWords(x, text, maxW);
    const widest = Math.max(0, ...rows.map((r) => x.measureText(r).width));
    if ((rows.length <= 3 && widest <= maxW) || s <= min) return { rows, size: Math.round(s) };
    s -= 4;
  }
}

function drawRows(x: CanvasRenderingContext2D, rows: string[], cx: number, centreY: number, size: number, alpha: number) {
  if (alpha <= 0.01 || !rows.length) return { top: centreY, bottom: centreY };
  const lh = size * 1.14;
  const top = centreY - ((rows.length - 1) * lh) / 2;
  x.save();
  x.globalAlpha = alpha;
  rows.forEach((r, n) => x.fillText(r, cx, top + n * lh + size * 0.35));
  x.restore();
  return { top: top - size * 0.7, bottom: top + (rows.length - 1) * lh + size * 0.45 };
}

/** Which line is up at t, and which come either side. */
export function lyricAt(lines: WindowLine[], t: number) {
  let cur = -1;
  for (let n = 0; n < lines.length; n++) if (lines[n].at <= t && t < lines[n].until) cur = n;
  // Between lines (a gap, an instrumental): nothing is current, the next one waits underneath.
  const nextIdx = cur >= 0 ? cur + 1 : lines.findIndex((l) => l.at > t);
  return { cur, prev: cur > 0 ? cur - 1 : -1, next: nextIdx >= 0 && nextIdx < lines.length ? nextIdx : -1 };
}

export function drawLyricsFrame(a: LyricsArgs) {
  const { ctx: x, width: W, height: H, kick, art, fontFamily: SANS, palette: p, copy, stickerGuide, progress, i, frames, fps, lines } = a;
  const opt = { ...DEFAULT_LYRICS_OPTIONS, ...a.options };
  const vertical = H > W;
  const story = vertical && copy.link === null;
  const s = W / 1080;
  const L = lyricsLayout(W, H, story);
  const cx = W / 2;
  const resting = i < 0;
  const T = frames / fps;
  // The resting preview shows the first line settled, so choosing the style shows the style.
  const t = resting ? (lines[0] ? lines[0].at + LYRIC_IN_S : 0) : i / fps;
  const endAt = Math.max(0, T - LYRICS_END_CARD_S);
  const endT = resting ? 0 : easeOut((t - endAt) / 0.5);

  x.fillStyle = p.bg;
  x.fillRect(0, 0, W, H);
  if (p.glow && p.glow2) {
    const fade = hexA(p.bg, 0);
    const g = x.createRadialGradient(cx, L.centre, 40 * s, cx, L.centre, W * (0.8 + 0.12 * (kick || 0)));
    g.addColorStop(0, hexA(p.glow, 0.26 + 0.2 * (kick || 0)));
    g.addColorStop(1, fade);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const g2 = x.createRadialGradient(W * 0.1, -60 * s, 20 * s, W * 0.1, -60 * s, W * 0.95);
    g2.addColorStop(0, hexA(p.glow2, 0.24));
    g2.addColorStop(1, fade);
    x.fillStyle = g2;
    x.fillRect(0, 0, W, H);
  }

  // The artwork, small, so the words are the picture. A 3% pulse on the kick at most.
  const side = Math.round(L.side * (1 + 0.03 * (kick || 0)));
  const ax = (W - side) / 2, ay = L.artTop + (L.side - side) / 2;
  const radius = 24 * s;
  x.save();
  roundRect(x, ax, ay, side, side, radius);
  x.clip();
  if (art) x.drawImage(art, ax, ay, side, side);
  else { x.fillStyle = "#1B1826"; x.fillRect(ax, ay, side, side); }
  x.restore();
  x.strokeStyle = p.artEdge;
  x.lineWidth = 2;
  roundRect(x, ax, ay, side, side, radius);
  x.stroke();

  x.textAlign = "center";
  const lyricA = 1 - endT;
  if (!lines.length) {
    // Nothing timed in this part: the title, still. The panel says why.
    x.fillStyle = p.text;
    const f = fitRows(x, a.fallback, L.maxW, L.size, L.min, SANS);
    x.font = `800 ${f.size}px ${SANS}`;
    drawRows(x, f.rows, cx, L.centre, f.size, lyricA);
  } else {
    const at = lyricAt(lines, t);
    const sinceIn = at.cur >= 0 ? t - lines[at.cur].at : Infinity;
    const arrive = at.cur >= 0 ? easeOut(sinceIn / LYRIC_IN_S) : 1;
    const curFit = at.cur >= 0 ? fitRows(x, lines[at.cur].text, L.maxW, L.size, L.min, SANS) : null;
    const curRows = curFit?.rows.length ?? 1;
    const curSize = curFit?.size ?? L.size;
    const half = ((curRows - 1) * curSize * 1.14) / 2 + curSize * 0.5;
    const small = Math.round(L.size * 0.55);
    // The current line rises into place as it arrives; the one before leaves upward and dims.
    const lift = (1 - arrive) * 70 * s;
    if (at.prev >= 0 && arrive < 1) {
      x.fillStyle = p.subtext;
      const f = fitRows(x, lines[at.prev].text, L.maxW, small, small * 0.7, SANS);
      x.font = `800 ${f.size}px ${SANS}`;
      drawRows(x, f.rows, cx, L.centre - half - 70 * s - arrive * 60 * s, f.size, (1 - arrive) * 0.5 * lyricA);
    }
    if (curFit) {
      x.fillStyle = p.text;
      x.font = `800 ${curSize}px ${SANS}`;
      drawRows(x, curFit.rows, cx, L.centre + lift, curSize, (0.35 + 0.65 * arrive) * lyricA);
    }
    if (opt.showNext && at.next >= 0) {
      x.fillStyle = p.subtext;
      const f = fitRows(x, lines[at.next].text, L.maxW, small, small * 0.7, SANS);
      x.font = `800 ${f.size}px ${SANS}`;
      const lh = f.size * 1.14;
      // Never into the space below the floor: on a Story that is the sticker band.
      let y = L.centre + (curFit ? half : 0) + 60 * s + (f.rows.length * lh) / 2 + lift;
      y = Math.min(y, L.floor - ((f.rows.length - 1) * lh) / 2 - f.size * 0.45);
      drawRows(x, f.rows, cx, y, f.size, 0.4 * arrive * lyricA);
    }
  }

  // The end card: the headline takes the lyrics' place.
  if (endT > 0.01) {
    x.fillStyle = p.text;
    fitText(x, copy.headline, L.maxW, "800", L.size * 1.2, SANS);
    x.save();
    x.globalAlpha = endT;
    x.fillText(copy.headline, cx, L.headline + (1 - endT) * 30 * s + L.size * 0.4);
    x.restore();
  }

  // The link stack, on every frame: a lyric clip is still there to send people somewhere.
  const inner = W - 140 * s;
  if (copy.link !== null) {
    x.fillStyle = p.link;
    fitText(x, copy.link, inner, "600", (vertical ? 34 : 28) * s, MONO);
    x.fillText(copy.link, cx, L.link);
  }
  x.fillStyle = p.subtext;
  fitText(x, copy.tagline, inner, "500", (vertical ? 28 : 23) * s, SANS);
  x.fillText(copy.tagline, cx, L.tagline);
  if (copy.mark) {
    x.fillStyle = p.mark;
    x.font = `600 ${Math.round((vertical ? 24 : 20) * s)}px ${SANS}`;
    x.fillText(copy.mark, cx, L.mark);
  }

  if (story && stickerGuide) drawStickerGuide(x, W, H / 1920, p.link, SANS);

  x.fillStyle = p.link;
  x.fillRect(0, H - 14 * s, W * clamp01(progress), 14 * s);

  // Picture fades follow the audio fades, as in Motion. Not on the resting preview.
  if (!resting) {
    const lastT = (frames - 1) / fps;
    const fin = opt.fadeIn > 0 ? 1 - clamp01(t / opt.fadeIn) : 0;
    const fout = opt.fadeOut > 0 ? clamp01((t - (lastT - opt.fadeOut)) / opt.fadeOut) : 0;
    const black = Math.max(fin, fout);
    if (black > 0.001) {
      x.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
      x.fillRect(0, 0, W, H);
    }
  }
}
