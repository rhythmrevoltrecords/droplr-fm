/**
 * One frame of a release clip, drawn to a 2D canvas.
 *
 * The composition is the product decision, not decoration. The bottom of the frame is a single
 * centred stack — headline, smart link, tagline, droplr mark — because that is what makes the mark
 * worth having on the free tier: a crop high enough to remove "droplr.fm" also removes the link,
 * and a release clip with no link is worthless. See droplr/release-clips-feature.md.
 *
 * No corner mark. It is trivial to crop, and cropping a corner off a 1:1 leaves a non-square video
 * that Instagram letterboxes, so the artist gets a worse post and blames droplr for it.
 */
import { BANDS, hexA, mixHex } from "./clip";

const BG = "#0B0A10";

export type FrameCopy = {
  /** "OUT NOW" before anything else reads. Short: this is set at 86-112px. */
  headline: string;
  /** The smart link, without the scheme. The reason the clip exists. */
  link: string;
  /** One line under the link. */
  tagline: string;
  /** The droplr mark, or null on a plan that has removed branding. */
  mark: string | null;
};

export type FrameArgs = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** 0..1 progress through the clip, for the bar along the bottom. */
  progress: number;
  /** Per-band levels 0..1, or null for the resting state. */
  bands: number[] | null;
  /** Low-end level 0..1, drives the artwork pulse. */
  kick: number;
  art: CanvasImageSource | null;
  accent: string;
  accent2: string;
  copy: FrameCopy;
};

function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

/** Shrink the text until it fits the width it has. Long titles and long links both hit this. */
function fitText(x: CanvasRenderingContext2D, text: string, max: number, weight: string, size: number, family: string) {
  let s = size;
  for (;;) {
    x.font = `${weight} ${s}px ${family}`;
    if (x.measureText(text).width <= max || s <= size * 0.45) break;
    s -= 2;
  }
  return s;
}

const SANS = "Archivo, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function drawClipFrame({ ctx: x, width: W, height: H, progress, bands, kick, art, accent, accent2, copy }: FrameArgs) {
  const vertical = H > W;
  const k = kick || 0;

  x.fillStyle = BG;
  x.fillRect(0, 0, W, H);

  const artSide = vertical ? 820 : 640;
  const ay = vertical ? 415 : 150;

  // Glow pulled from the artwork's own colour — already stored as Release.accentColor, so the
  // "colour behind it follows the artwork" part needed no new work.
  const g = x.createRadialGradient(W / 2, ay + artSide / 2, 40, W / 2, ay + artSide / 2, artSide * (0.78 + 0.3 * k));
  g.addColorStop(0, hexA(accent, 0.3 + 0.34 * k));
  g.addColorStop(1, "rgba(11,10,16,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const g2 = x.createRadialGradient(W * 0.1, -60, 20, W * 0.1, -60, W * 0.95);
  g2.addColorStop(0, hexA(accent2, 0.3));
  g2.addColorStop(1, "rgba(11,10,16,0)");
  x.fillStyle = g2;
  x.fillRect(0, 0, W, H);

  // Artwork, pulsing on the kick. Capped near 5%: more than that reads cheap.
  const side = Math.round(artSide * (1 + 0.055 * k));
  const ax = (W - side) / 2;
  const ayy = ay + (artSide - side) / 2;
  const radius = 30 * (side / artSide);
  x.save();
  roundRect(x, ax, ayy, side, side, radius);
  x.clip();
  if (art) x.drawImage(art, ax, ayy, side, side);
  else {
    x.fillStyle = "#1B1826";
    x.fillRect(ax, ayy, side, side);
  }
  x.restore();
  x.strokeStyle = "rgba(255,255,255,.10)";
  x.lineWidth = 2;
  roundRect(x, ax, ayy, side, side, radius);
  x.stroke();

  // Spectrum.
  const barW = vertical ? 12 : 9;
  const barY = ay + artSide + (vertical ? 120 : 86);
  const pad = vertical ? 80 : 110;
  const gap = (W - 2 * pad - BANDS * barW) / (BANDS - 1);
  for (let b = 0; b < BANDS; b++) {
    // At rest the bars sit flat and dim, so an idle preview never reads as a frozen spectrum.
    const v = bands ? bands[b] : 0.02;
    const h = Math.max(5, v * (vertical ? 118 : 92));
    x.fillStyle = mixHex(accent, accent2, b / (BANDS - 1));
    roundRect(x, pad + b * (barW + gap), barY - h, barW, h, barW / 2);
    x.fill();
  }

  // The copy stack. One centre line, tight spacing: the mark travels with the link or not at all.
  const inner = W - (vertical ? 120 : 160);
  x.textAlign = "center";
  const ty = barY + (vertical ? 150 : 112);

  x.fillStyle = "#F4F4F5";
  fitText(x, copy.headline, inner, "800", vertical ? 112 : 86, SANS);
  x.fillText(copy.headline, W / 2, ty);

  const linkY = ty + (vertical ? 62 : 50);
  x.fillStyle = accent;
  fitText(x, copy.link, inner, "600", vertical ? 32 : 27, MONO);
  x.fillText(copy.link, W / 2, linkY);

  const tagY = linkY + (vertical ? 46 : 38);
  x.fillStyle = "#A1A1AA";
  fitText(x, copy.tagline, inner, "500", vertical ? 28 : 23, SANS);
  x.fillText(copy.tagline, W / 2, tagY);

  if (copy.mark) {
    x.fillStyle = "rgba(244,244,245,.55)";
    x.font = `600 ${vertical ? 24 : 20}px ${SANS}`;
    x.fillText(copy.mark, W / 2, tagY + (vertical ? 44 : 36));
  }

  x.fillStyle = accent;
  x.fillRect(0, H - 14, W * Math.min(1, Math.max(0, progress)), 14);
}

/** The resting frame, before anything is loaded or while the artist is still choosing. */
export const restingFrame = (args: Omit<FrameArgs, "bands" | "kick" | "progress">) =>
  drawClipFrame({ ...args, bands: null, kick: 0, progress: 0 });
