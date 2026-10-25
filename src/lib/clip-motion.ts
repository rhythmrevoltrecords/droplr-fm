/**
 * The Motion clip style: the droplr teaser's camera language, drawn by the same canvas renderer as the
 * waveform style, for an artist's own release.
 *
 * Not Remotion. Remotion's in-browser renderer sends a telemetry event for every render with no way
 * to switch it off, and the clip page promises nothing leaves the artist's computer. So the moves
 * were ported instead: one engine, one encoder, no new dependency, nothing sent anywhere.
 *
 * The sequence, timed to the track rather than the clock:
 *   1. the artwork card comes in and keeps a slow 2.5D drift (a squeeze and a skew, since a 2D canvas
 *      has no real perspective), pulsing a little on the kick;
 *   2. on the first kick the headline blurs and slides in, the artist line a beat after;
 *   3. on the drop the card does a short spotlight push and the link card lands underneath;
 *   4. it ends: still on the link, fading to black with the audio, flying off the screen, or zooming
 *      towards the lens.
 * The artwork can be still, fade in, fly in from the side or zoom down from the lens; all land in one place.
 * The cues come from the same per-frame analysis the waveform style uses (lib/clip analyseClip), so
 * the preview and the render agree.
 */
import { hexA } from "./clip";
import { drawLogo, drawStickerGuide, fitText, MONO, roundRect, STORY_SAFE_TOP, type FrameArgs } from "./clip-frame";

export const CLIP_STYLES = ["waveform", "motion", "type"] as const;
export type ClipStyle = (typeof CLIP_STYLES)[number];
export const CLIP_STYLE_LABELS: Record<ClipStyle, { name: string; hint: string }> = {
  waveform: { name: "Waveform", hint: "Artwork pulsing on the kick, a spectrum following the audio." },
  motion: { name: "Motion", hint: "The artwork drifts in, the title lands on the first kick, the link on the drop." },
  type: { name: "Type", hint: "Your words, huge, cut on the beat. Colours swap on every cut and your logo slams in on the drop." },
};

/** Frames, not seconds: the renderer works in frames. */
export type MotionCues = { firstKick: number; drop: number };

/**
 * When the first kick lands and where the drop is, from the per-frame low-end envelope.
 *
 * First kick: the first rising frame after a quarter of a second that clears both an absolute floor
 * and most of the clip's own loud level, so a quiet intro with a soft hat doesn't count.
 * Drop: the biggest jump in one-second average energy against the second before it, at least a
 * second after the first kick and three seconds from the end, so the link has time to be read.
 * Either falls back to a fixed point in the clip when the track doesn't have one. "I can't tell" is
 * a real answer; a confident wrong cue would land the title in silence.
 */
export function motionCues(low: number[], fps: number): MotionCues {
  const n = low.length;
  if (!n) return { firstKick: 0, drop: 0 };
  const sorted = [...low].sort((a, b) => a - b);
  const p90 = sorted[Math.min(n - 1, Math.floor(n * 0.9))];
  const floor = Math.max(0.3, p90 * 0.6);
  const minStart = Math.round(fps * 0.25);
  let firstKick = -1;
  for (let i = Math.max(1, minStart); i < n; i++) {
    if (low[i] >= floor && low[i] > low[i - 1]) { firstKick = i; break; }
  }
  if (firstKick < 0) firstKick = Math.min(n - 1, Math.round(fps * 0.6));

  const win = Math.max(1, Math.round(fps));
  const mean = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += low[i]; return s / Math.max(1, b - a); };
  const lastStart = n - Math.round(fps * 3) - win;
  let best = -1, bestGain = 0;
  for (let i = Math.max(firstKick + win, win); i <= lastStart; i++) {
    const before = mean(i - win, i), after = mean(i, i + win);
    const gain = after / Math.max(0.05, before);
    if (after >= 0.25 && gain >= 1.35 && gain > bestGain) { bestGain = gain; best = i; }
  }
  const fallback = Math.max(firstKick + win, Math.min(Math.round(n * 0.45), n - Math.round(fps * 3)));
  const drop = Math.min(n - 1, best >= 0 ? best : fallback);
  return { firstKick, drop };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const easeOutBack = (v: number) => { const c = 1.6, t = clamp01(v) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeInQuad = (v: number) => Math.pow(clamp01(v), 2);

/**
 * How the artwork comes in, and how it all leaves: four of each, in matching pairs. Still is there
 * from the first frame (and stays to the last); Fade in fades up in place; Fly in swings in from
 * off the right edge; Zoom in comes down from the lens. All four land in the same place.
 */
export const MOTION_ENTRANCES = ["still", "fade", "fly", "zoom"] as const;
export type MotionEntrance = (typeof MOTION_ENTRANCES)[number];
export const MOTION_ENDINGS = ["hold", "fade", "flyout", "zoomout"] as const;
export type MotionEnding = (typeof MOTION_ENDINGS)[number];
export const MOTION_ENTRANCE_LABELS: Record<MotionEntrance, string> = { still: "Still", fade: "Fade in", fly: "Fly in", zoom: "Zoom in" };
export const MOTION_ENDING_LABELS: Record<MotionEnding, string> = { hold: "Still", fade: "Fade out", flyout: "Fly out", zoomout: "Zoom out" };
export type MotionOptions = { entrance: MotionEntrance; ending: MotionEnding; fadeIn: number; fadeOut: number };
export const DEFAULT_MOTION_OPTIONS: MotionOptions = { entrance: "fade", ending: "hold", fadeIn: 0, fadeOut: 0 };

export type MotionArgs = FrameArgs & {
  /** Frame index, or -1 for the resting preview, which shows everything settled. */
  i: number;
  frames: number;
  fps: number;
  cues: MotionCues;
  /** Entrance, ending, and the audio fades the picture follows. Missing = fade in, still, no fades. */
  options?: Partial<MotionOptions>;
};

type Layout = { cardTop: number; side: number; title: number; tagline: number; linkTop: number; linkH: number; mark: number; titleSize: number; tagSize: number; linkSize: number };

function layoutFor(W: number, H: number, story: boolean): Layout {
  const s = W / 1080;
  if (H <= W) {
    // Square feed post.
    return { cardTop: 80 * s, side: 520 * s, title: 720 * s, tagline: 775 * s, linkTop: 828 * s, linkH: 84 * s, mark: 965 * s, titleSize: 76 * s, tagSize: 26 * s, linkSize: 28 * s };
  }
  if (story) {
    // Everything between Instagram's profile row and the sticker band (lib/clip-frame).
    return { cardTop: (STORY_SAFE_TOP + 40) * s, side: 660 * s, title: 1110 * s, tagline: 1172 * s, linkTop: 0, linkH: 0, mark: 1232 * s, titleSize: 100 * s, tagSize: 30 * s, linkSize: 0 };
  }
  // Centred a little low: Instagram's caption and buttons cover the bottom ~250px, the top is clear.
  return { cardTop: 400 * s, side: 760 * s, title: 1315 * s, tagline: 1378 * s, linkTop: 1445 * s, linkH: 104 * s, mark: 1620 * s, titleSize: 108 * s, tagSize: 30 * s, linkSize: 34 * s };
}

/** Draw text with an optional blur. Canvas filter is ignored where unsupported; the slide and fade still read. */
function fadeText(x: CanvasRenderingContext2D, text: string, cx: number, y: number, alpha: number, blur: number) {
  if (alpha <= 0.01) return;
  x.save();
  x.globalAlpha = alpha;
  if (blur > 0.3) x.filter = `blur(${blur.toFixed(1)}px)`;
  x.fillText(text, cx, y);
  x.restore();
}

export function drawMotionFrame(a: MotionArgs) {
  const { ctx: x, width: W, height: H, kick, art, fontFamily: SANS, logo, palette: p, copy, stickerGuide, progress, i, frames, fps, cues } = a;
  const opt = { ...DEFAULT_MOTION_OPTIONS, ...a.options };
  const vertical = H > W;
  const story = vertical && copy.link === null;
  const s = W / 1080;
  const L = layoutFor(W, H, story);
  const k = kick || 0;
  const resting = i < 0;
  // The resting preview shows the finished composition, not an empty frame or an exit.
  const t = resting ? cues.drop / fps + 3 : i / fps;
  const T = frames / fps;
  const kickT = cues.firstKick / fps;
  const dropT = cues.drop / fps;
  // The ending runs over the audio fade-out, so picture and sound leave together. With no fade-out
  // set it still takes long enough to see.
  const exitDur = Math.max(0.6, opt.fadeOut);
  // Measured to the last frame, not to T, so the last frame really is empty.
  const lastT = T - 1 / fps;
  const exit = resting || (opt.ending !== "flyout" && opt.ending !== "zoomout") ? 0 : clamp01((t - (lastT - exitDur)) / exitDur);
  const flying = opt.ending === "flyout";
  // Staggered: the link goes first, then the words, then the card. A quadratic ease-in reads as
  // things picking up speed as they leave; a cubic left most of a two-second exit for the last frames.
  const exitAt = (delay: number) => (exit <= 0 ? 0 : easeInQuad((exit - delay) / (1 - delay)));

  x.fillStyle = p.bg;
  x.fillRect(0, 0, W, H);

  const enterDur = opt.entrance === "zoom" ? 1.1 : 0.9;
  const enter = opt.entrance === "still" ? 1 : easeOutCubic(t / enterDur);
  const push = t >= dropT ? easeOutBack((t - dropT) / 0.6) : 0;
  const cx = W / 2;
  const cy = L.cardTop + L.side / 2;
  const cardOut = exitAt(0.25);

  if (p.glow && p.glow2) {
    const fade = hexA(p.bg, 0);
    const glowA = enter * (1 - cardOut);
    const g = x.createRadialGradient(cx, cy, 30 * s, cx, cy, L.side * (0.85 + 0.3 * k + 0.25 * push));
    g.addColorStop(0, hexA(p.glow, (0.26 + 0.3 * k + 0.14 * push) * glowA));
    g.addColorStop(1, fade);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const g2 = x.createRadialGradient(W * 0.9, H + 40 * s, 20 * s, W * 0.9, H + 40 * s, W);
    g2.addColorStop(0, hexA(p.glow2, 0.22 * glowA));
    g2.addColorStop(1, fade);
    x.fillStyle = g2;
    x.fillRect(0, 0, W, H);
  }

  if (logo && !story) {
    x.save();
    x.globalAlpha = enter * (1 - cardOut);
    drawLogo(x, logo, W, Math.round(28 * s), L.cardTop, H / 1920);
    x.restore();
  }

  // The card. Each entrance ends in the same resting place; only the way in differs.
  const drift = Math.sin(t * 0.45);
  // Fade in and Still: in place, no movement. Fade in only ramps the opacity.
  let enterScale = 1;
  let ox = 0;
  let oy = 0;
  let skew = 0;
  let alpha = enter;
  if (opt.entrance === "fly") {
    // From off the right edge, turned, swinging round as it lands.
    const f = easeOutBack(t / enterDur);
    ox = (1 - f) * W * 0.95;
    oy = (1 - f) * -60 * s;
    skew = (1 - f) * 0.35;
    enterScale = 0.92 + 0.08 * f;
    alpha = clamp01(t / 0.2);
  } else if (opt.entrance === "zoom") {
    // From close to the lens down to its place: the spotlight move, from the start.
    enterScale = 1.7 - 0.7 * enter;
    oy = 0;
    alpha = clamp01(t / 0.35);
  }
  // Fly out: up and off the top, turning away. Zoom out: towards the lens, fading as it comes.
  const outY = flying ? -cardOut * (cy + L.side) : 0;
  const outSkew = flying ? cardOut * -0.25 : 0;
  const outScale = flying ? 1 : 1 + 0.8 * cardOut;
  const outAlpha = flying ? 1 : 1 - cardOut;
  const scale = enterScale * outScale * (1 + 0.03 * k) * (1 + 0.05 * push);
  const side = L.side * scale;
  if (alpha * outAlpha > 0.01 && cardOut < 1) {
    x.save();
    x.globalAlpha = alpha * outAlpha;
    x.translate(cx + 14 * s * Math.sin(t * 0.3) + ox, cy + oy + outY);
    // 2.5D: a slight squeeze across and a skew down one edge reads as the card turning.
    x.transform(1 - 0.035 * Math.abs(drift) - Math.abs(skew) * 0.4, 0.03 * drift + skew + outSkew, 0, 1, 0, 0);
    x.shadowColor = "rgba(0,0,0,0.45)";
    x.shadowBlur = 60 * s;
    x.shadowOffsetY = 24 * s;
    roundRect(x, -side / 2, -side / 2, side, side, 28 * s * scale);
    x.fillStyle = "#1B1826";
    x.fill();
    x.shadowColor = "transparent";
    x.save();
    roundRect(x, -side / 2, -side / 2, side, side, 28 * s * scale);
    x.clip();
    if (art) x.drawImage(art, -side / 2, -side / 2, side, side);
    x.restore();
    x.strokeStyle = p.artEdge;
    x.lineWidth = 2;
    roundRect(x, -side / 2, -side / 2, side, side, 28 * s * scale);
    x.stroke();
    x.restore();
  }

  // Headline on the first kick, the artist line a beat later. Out: they drop away and fade.
  const inner = W - 140 * s;
  x.textAlign = "center";
  const wordsOut = exitAt(0.12);
  const tt = easeOutCubic((t - kickT) / 0.5);
  x.fillStyle = p.text;
  fitText(x, copy.headline, inner, "800", L.titleSize, SANS);
  const drop = flying ? 160 * s : 0;
  fadeText(x, copy.headline, cx, L.title + (1 - tt) * 34 * s + wordsOut * drop, tt * (1 - wordsOut), (1 - tt) * 12 * s + wordsOut * 10 * s);
  const tg = easeOutCubic((t - kickT - 0.45) / 0.5);
  x.fillStyle = p.subtext;
  fitText(x, copy.tagline, inner, "500", L.tagSize, SANS);
  fadeText(x, copy.tagline, cx, L.tagline + (1 - tg) * 24 * s + wordsOut * drop, tg * (1 - wordsOut), (1 - tg) * 8 * s + wordsOut * 8 * s);

  // The link card lands on the drop. On a Story the link is a sticker the artist places, so nothing
  // is drawn there and the band stays empty. Out: it goes first, down off the bottom edge.
  const linkOut = exitAt(0);
  const lt = t >= dropT ? easeOutBack((t - dropT) / 0.55) : 0;
  const la = clamp01((t - dropT) / 0.25) * (1 - linkOut * (flying ? 0.6 : 1));
  if (copy.link !== null && la > 0.01) {
    x.save();
    x.globalAlpha = la;
    const size = fitText(x, copy.link, inner - 80 * s, "600", L.linkSize, MONO);
    const w = Math.min(W - 120 * s, x.measureText(copy.link).width + 90 * s);
    const top = L.linkTop + (1 - lt) * 110 * s + (flying ? linkOut * (H - L.linkTop + 40 * s) : 0);
    roundRect(x, cx - w / 2, top, w, L.linkH, L.linkH / 2);
    x.fillStyle = hexA(p.link, 0.12);
    x.fill();
    x.strokeStyle = hexA(p.link, 0.55);
    x.lineWidth = Math.max(1.5, 2 * s);
    x.stroke();
    x.fillStyle = p.link;
    x.font = `600 ${size}px ${MONO}`;
    x.fillText(copy.link, cx, top + L.linkH / 2 + size * 0.36);
    x.restore();
  }

  // The droplr mark travels with the link (or, on a Story, with the artist line).
  const markA = (copy.link !== null ? la : tg) * (1 - wordsOut);
  if (copy.mark && markA > 0.01) {
    x.save();
    x.globalAlpha = markA;
    x.fillStyle = p.mark;
    x.font = `600 ${Math.round((vertical ? 24 : 20) * s)}px ${SANS}`;
    x.fillText(copy.mark, cx, L.mark + (!flying ? 0 : copy.link !== null ? linkOut * (H - L.mark + 40 * s) : wordsOut * 160 * s));
    x.restore();
  }

  if (story && stickerGuide) drawStickerGuide(x, W, H / 1920, p.link, SANS);

  x.fillStyle = p.link;
  x.fillRect(0, H - 14 * s, W * clamp01(progress), 14 * s);

  // Picture fades follow the audio fades: in from black over the fade-in, and with "Fade out", to
  // black over the fade-out. Not on the resting preview.
  if (!resting) {
    const fadeInA = opt.fadeIn > 0 ? 1 - clamp01(t / opt.fadeIn) : 0;
    const fadeOutA = opt.ending === "fade" ? clamp01((t - (lastT - Math.max(0.5, opt.fadeOut))) / Math.max(0.5, opt.fadeOut)) : 0;
    const black = Math.max(fadeInA, fadeOutA);
    if (black > 0.001) {
      x.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
      x.fillRect(0, 0, W, H);
    }
  }
}
