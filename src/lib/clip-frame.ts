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
 *
 * Story mode is the exception, and it earns it. On a Story the link isn't read off the picture —
 * it's a tappable sticker the artist places on top, which is the only unpaid way to get a link out
 * of Instagram. A printed URL there is worse than useless: nobody types it, and it sits under the
 * sticker they actually want. So that layout drops the link line, lifts the whole composition, and
 * leaves a clear band low in the frame for the sticker to land in.
 */
import { BANDS, hexA, mixHex } from "./clip";

const BG = "#0B0A10";

export type FrameCopy = {
  /** "OUT NOW" before anything else reads. Short: this is set at 86-112px. */
  headline: string;
  /**
   * The smart link, without the scheme. The reason the clip exists — except on a Story, where
   * null means "leave the link to the sticker" and the reserved band below takes its place.
   */
  link: string | null;
  /** One line under the link. */
  tagline: string;
  /** The droplr mark, or null on a plan that has removed branding. */
  mark: string | null;
};

/**
 * Instagram's own chrome covers roughly the top and bottom 250px of a 1080x1920 Story — the
 * profile row above, the reply bar below. Everything drawn has to live between them, and the
 * sticker band has to sit inside that too or the artist places their link under the reply bar.
 */
export const STORY_SAFE_TOP = 250;
export const STORY_SAFE_BOTTOM = 1670;

/** Where the link sticker goes, in a 1080x1920 frame. Nothing else is drawn inside it. */
export const STORY_STICKER_BAND = { top: 1410, bottom: 1650 };

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
  /**
   * The family for every non-monospace string, as a canvas font-family list. Required rather than
   * defaulted: a default here is what hid the Archivo bug for as long as it lasted.
   */
  fontFamily: string;
  /**
   * The label's or artist's own logo, for the empty band above the artwork. Dimensions come with it
   * so a wide logo isn't squashed into a square. Never drawn on a Story — see drawLogo.
   */
  logo: { img: CanvasImageSource; width: number; height: number } | null;
  accent: string;
  accent2: string;
  copy: FrameCopy;
  /**
   * Preview only: draw the outline showing where the link sticker goes. Never passed by the
   * renderer — a dashed box baked into the video would be the whole feature backwards.
   */
  stickerGuide?: boolean;
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

/**
 * The link line stays monospace on purpose: a URL set in a proportional face reads as a sentence,
 * and the whole point of that line is that it reads as something you type. System monospace differs
 * between platforms, but "Menlo vs Consolas on a 32px URL" is not a brand problem.
 *
 * Everything else takes `fontFamily` from the caller. It used to be a module constant reading
 * "Archivo, ui-sans-serif, system-ui, …", and Archivo appeared exactly once in this repo — in that
 * string. It was never installed, never declared, never loaded. So every clip fell through to
 * ui-sans-serif, which means the typeface in an artist's video was decided by their operating
 * system: SF Pro on macOS, Segoe UI on Windows, Roboto on Android. Nobody could notice, because
 * each artist only ever sees their own render. clip-forge.tsx now resolves the app's real font off
 * the document and passes it, so a clip matches the share graphics and matches itself everywhere.
 */
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * The label's logo, centred in the empty band between the top of the frame and the artwork.
 *
 * Not drawn on a Story, and that is a measurement rather than a shortcut: a Story's artwork starts
 * at STORY_SAFE_TOP (250px), which is exactly where Instagram's own profile row ends. There is no
 * band above it to draw into, and anything placed there sits *behind* the artist's own avatar and
 * handle — so the logo would be both hidden and redundant.
 *
 * Aspect ratio is preserved from the source. Logos are wide far more often than square, and a logo
 * squashed into a box is worse than no logo: it is the artist's own mark, rendered wrong, by us.
 */
function drawLogo(x: CanvasRenderingContext2D, logo: NonNullable<FrameArgs["logo"]>, W: number, bandTop: number, bandBottom: number, scale: number) {
  const band = bandBottom - bandTop;
  if (band < 70 * scale) return; // No room: better nothing than a logo jammed against the artwork.
  const h = Math.min(Math.round(72 * scale), Math.round(band * 0.42));
  const ratio = logo.height > 0 ? logo.width / logo.height : 1;
  // A very wide mark is bounded by width instead, so it can't run into the edges of the frame.
  const maxW = W * 0.42;
  const w = Math.min(Math.round(h * ratio), Math.round(maxW));
  const drawH = Math.round(w / Math.max(ratio, 0.0001));
  // A mark wide enough to be width-bounded down to a sliver is not legible at 1080 wide, and a
  // 10px-tall smear of someone's logo looks like a rendering fault rather than their brand. Leave
  // it out instead. (A 20:1 wordmark still clears this; 40:1 does not, and shouldn't.)
  if (drawH < 18 * scale) return;
  x.save();
  x.globalAlpha = 0.95;
  x.drawImage(logo.img, Math.round((W - w) / 2), Math.round(bandTop + (band - drawH) / 2), w, drawH);
  x.restore();
}

export function drawClipFrame({ ctx: x, width: W, height: H, progress, bands, kick, art, fontFamily: SANS, logo, accent, accent2, copy, stickerGuide }: FrameArgs) {
  const vertical = H > W;
  const k = kick || 0;
  // A Story lays out differently because it has to make room for something drawn on top of it
  // later. Only ever vertical: there is no link sticker on a feed post, so a square clip that
  // dropped its link would just be a clip with no link.
  const story = vertical && copy.link === null;
  const scale = H / 1920;

  x.fillStyle = BG;
  x.fillRect(0, 0, W, H);

  // Story: smaller art, higher up, to buy the band at the bottom without crowding the top of the
  // frame where Instagram puts the profile row.
  const artSide = story ? 760 : vertical ? 820 : 640;
  const ay = story ? STORY_SAFE_TOP * scale : vertical ? 415 : 150;

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

  // The label's own mark, in the band the composition already leaves empty above the artwork.
  // Before the artwork is drawn, so a tall logo can never sit on top of the cover.
  if (logo && !story) drawLogo(x, logo, W, Math.round(40 * scale), ay, scale);

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
  const barY = ay + artSide + (story ? 100 : vertical ? 120 : 86);
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
  const ty = barY + (story ? 140 : vertical ? 150 : 112);

  x.fillStyle = "#F4F4F5";
  fitText(x, copy.headline, inner, "800", vertical ? 112 : 86, SANS);
  x.fillText(copy.headline, W / 2, ty);

  let linkY = ty;
  if (copy.link !== null) {
    linkY = ty + (vertical ? 62 : 50);
    x.fillStyle = accent;
    fitText(x, copy.link, inner, "600", vertical ? 32 : 27, MONO);
    x.fillText(copy.link, W / 2, linkY);
  }

  const tagY = linkY + (story ? 62 : vertical ? 46 : 38);
  x.fillStyle = "#A1A1AA";
  fitText(x, copy.tagline, inner, "500", vertical ? 28 : 23, SANS);
  x.fillText(copy.tagline, W / 2, tagY);

  if (copy.mark) {
    x.fillStyle = "rgba(244,244,245,.55)";
    x.font = `600 ${vertical ? 24 : 20}px ${SANS}`;
    x.fillText(copy.mark, W / 2, tagY + (vertical ? 44 : 36));
  }

  // Where the sticker goes. Drawn in the preview so the artist can see the room is deliberate,
  // and never in the render — the reserved band's job is to be empty.
  if (story && stickerGuide) {
    const top = STORY_STICKER_BAND.top * scale;
    const h = (STORY_STICKER_BAND.bottom - STORY_STICKER_BAND.top) * scale;
    const side = 70 * scale;
    x.save();
    x.setLineDash([14 * scale, 12 * scale]);
    x.strokeStyle = hexA(accent, 0.5);
    x.lineWidth = Math.max(2, 3 * scale);
    roundRect(x, side, top, W - side * 2, h, 28 * scale);
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = hexA(accent, 0.75);
    x.textAlign = "center";
    x.font = `600 ${Math.round(30 * scale)}px ${SANS}`;
    x.fillText("Your link sticker goes here", W / 2, top + h / 2 + 10 * scale);
    x.restore();
  }

  x.fillStyle = accent;
  x.fillRect(0, H - 14, W * Math.min(1, Math.max(0, progress)), 14);
}

/** The resting frame, before anything is loaded or while the artist is still choosing. */
export const restingFrame = (args: Omit<FrameArgs, "bands" | "kick" | "progress">) =>
  drawClipFrame({ ...args, bands: null, kick: 0, progress: 0 });
