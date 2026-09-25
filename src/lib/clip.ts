/**
 * Release clips: the maths behind the video, with no DOM in it.
 *
 * Everything here runs in the artist's own browser. The audio is decoded, analysed, drawn and
 * encoded on their machine and never uploaded — that is the whole reason this feature can exist
 * at all. droplr keeps the link, not the file, and accepting masters would put a DMCA surface
 * and a storage bill on a product that has neither today.
 *
 * This module is deliberately DOM-free so the parts that are easy to get wrong — band edges,
 * fades, the analysis — can be tested in Node. See scripts/test-clip.ts.
 */

export const CLIP_LENGTHS = [15, 30, 60] as const;
export type ClipLength = (typeof CLIP_LENGTHS)[number];

export const ASPECTS = {
  square: { key: "square", label: "Feed", ratio: "1 / 1", width: 1080, height: 1080, hint: "Instagram feed, Facebook" },
  tall: { key: "tall", label: "Reel / Story", ratio: "9 / 16", width: 1080, height: 1920, hint: "Reels, TikTok, Shorts, Stories" },
} as const;
export type AspectKey = keyof typeof ASPECTS;

/** 30fps. Higher costs render time for something nobody watching a reel can see. */
export const FPS = 30;
/** Spectrum bars. Also the number of bands the analysis produces. */
export const BANDS = 44;
/** FFT size. 2048 at 44.1kHz is ~21Hz per bin, which is enough to separate the low bands. */
export const FFT_SIZE = 2048;

export const FADE_CHOICES = [0, 0.25, 0.5, 1, 2] as const;

// ---------------------------------------------------------------------------------------------
// Fades
// ---------------------------------------------------------------------------------------------

/**
 * Equal-power (raised-cosine) fade. A linear ramp on music dips audibly in the middle, because
 * perceived loudness follows power and power falls off as the square of amplitude. This keeps the
 * level steady through the fade.
 */
export function fadeGain(t: number, clipLen: number, fadeIn: number, fadeOut: number) {
  let g = 1;
  if (fadeIn > 0 && t < fadeIn) g *= Math.sin((Math.PI / 2) * (t / fadeIn));
  const rem = clipLen - t;
  if (fadeOut > 0 && rem < fadeOut) g *= Math.sin(((Math.PI / 2) * Math.max(0, rem)) / fadeOut);
  return g;
}

/** Two fades can't fill the clip. Trims the fade out rather than silently producing a clip that never opens up. */
export function clampFades(clipLen: number, fadeIn: number, fadeOut: number) {
  const budget = clipLen * 0.9;
  if (fadeIn + fadeOut <= budget) return { fadeIn, fadeOut, trimmed: false };
  const cappedIn = Math.min(fadeIn, budget);
  const cappedOut = Math.max(0, Math.round((budget - cappedIn) * 100) / 100);
  return { fadeIn: cappedIn, fadeOut: cappedOut, trimmed: true };
}

export function fadeSummary(fadeIn: number, fadeOut: number) {
  return `${fadeIn > 0 ? `${fadeIn}s in` : "no fade in"}, ${fadeOut > 0 ? `${fadeOut}s out` : "no fade out"}`;
}

// ---------------------------------------------------------------------------------------------
// Spectrum
// ---------------------------------------------------------------------------------------------

/**
 * Log-spaced FFT bin boundaries, forced strictly increasing.
 *
 * Without the guard the low edges round to the same bin (2,2,3,3,4,4…), so every second band spans
 * zero bins and sits dead at the floor for the whole clip. That bug shipped twice in the prototype
 * before it was named properly, which is why the guard has a comment instead of being "obvious".
 *
 * Used by the live preview and the offline render both, so the two can never disagree about what a
 * band is.
 */
export function bandEdges(binCount: number, bands = BANDS) {
  const lo = 2;
  const hi = Math.max(bands + lo + 1, Math.min(binCount - 1, Math.round(binCount * 0.66)));
  const edges: number[] = [];
  let prev = lo - 1;
  for (let i = 0; i <= bands; i++) {
    let e = Math.round(lo * Math.pow(hi / lo, i / bands));
    if (e <= prev) e = prev + 1;
    edges.push(e);
    prev = e;
  }
  return edges;
}

/** Iterative radix-2 FFT, in place. Length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Waveform overview
// ---------------------------------------------------------------------------------------------

/** Peak envelope for the scrubber. Strided inside each bucket: this runs on the whole track. */
export function buildPeaks(channel: Float32Array, buckets = 1600) {
  const step = Math.max(1, Math.floor(channel.length / buckets));
  const out = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const s = i * step;
    const e = Math.min(channel.length, s + step);
    for (let j = s; j < e; j += 7) {
      const v = Math.abs(channel[j]);
      if (v > m) m = v;
    }
    out[i] = m;
  }
  return out;
}

/**
 * The loudest window of `clipLen` seconds — a first guess at where the drop is, so the artist starts
 * somewhere useful instead of at 0:00. They can drag it anywhere; this is only the opening position.
 */
export function loudestWindow(peaks: Float32Array, duration: number, clipLen: number) {
  if (duration <= clipLen) return 0;
  const perBucket = duration / peaks.length;
  const win = Math.max(1, Math.round(clipLen / perBucket));
  let sum = 0;
  for (let i = 0; i < win && i < peaks.length; i++) sum += peaks[i];
  let best = sum, bestAt = 0;
  for (let i = win; i < peaks.length; i++) {
    sum += peaks[i] - peaks[i - win];
    if (sum > best) { best = sum; bestAt = i - win + 1; }
  }
  // Back off slightly so the clip leads into the loud part rather than starting on top of it.
  return Math.max(0, Math.min(duration - clipLen, bestAt * perBucket - clipLen * 0.15));
}

// ---------------------------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------------------------

export type ClipAnalysis = { low: number[]; bands: number[][]; bandCount: number };

export type AnalyseArgs = {
  channel: Float32Array;
  sampleRate: number;
  start: number; // seconds into the track
  clipLen: number;
  frames: number;
  fadeIn: number;
  fadeOut: number;
};

/**
 * One FFT per video frame: per-band levels for the spectrum, plus a low-end level that drives the
 * artwork pulse.
 *
 * The fade is applied to the analysis as well as the audio. Without that the bars stand at full
 * height over what the viewer hears as silence, which looks broken in the first second of every clip.
 */
export function analyseClip({ channel, sampleRate, start, clipLen, frames, fadeIn, fadeOut }: AnalyseArgs): ClipAnalysis {
  const from = Math.floor(start * sampleRate);
  const edges = bandEdges(FFT_SIZE / 2, BANDS);
  const hop = Math.floor((clipLen * sampleRate) / frames);
  const han = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) han[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));

  const spec: Float32Array[] = [];
  const low = new Float32Array(frames);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frames; f++) {
    const s = from + f * hop;
    const fg = fadeGain((f / frames) * clipLen, clipLen, fadeIn, fadeOut);
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (channel[s + i] || 0) * han[i] * fg;
      im[i] = 0;
    }
    fft(re, im);
    const band = new Float32Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      let sum = 0, n = 0;
      for (let i = edges[b]; i < edges[b + 1]; i++) { sum += Math.hypot(re[i], im[i]); n++; }
      band[b] = n ? sum / n : 0;
    }
    let lo = 0;
    for (let i = 2; i < 12; i++) lo += Math.hypot(re[i], im[i]);
    low[f] = lo / 10;
    spec.push(band);
  }

  // Normalise each band against its own 5th–97th percentile: a track with a quiet hat and a loud
  // kick should still show movement in the top bands rather than a flat line under the kick.
  const norm = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const lo = s[Math.floor(s.length * 0.05)] ?? 0;
    const hi = s[Math.floor(s.length * 0.97)] || 1;
    return arr.map((v) => Math.max(0, Math.min(1, (v - lo) / Math.max(hi - lo, 1e-9))));
  };
  const smooth = (a: number[]) => a.map((v, i) => (a[Math.max(0, i - 1)] + v + a[Math.min(a.length - 1, i + 1)]) / 3);

  const bands: number[][] = [];
  for (let b = 0; b < BANDS; b++) bands.push(smooth(norm(spec.map((f) => Math.log1p(f[b] * 400)))));
  // The artwork pulse is smoothed twice: one pass still reads as a twitch rather than a bounce.
  return { low: smooth(smooth(norm(Array.from(low)))), bands, bandCount: BANDS };
}

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mixHex(h1: string, h2: string, t: number) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = clampByte(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = clampByte(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = clampByte((a & 255) * (1 - t) + (b & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

/** A second colour derived from the accent, so a release with one stored colour still gets a gradient. */
export function partnerHex(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Rotate the channels: cheap, stable, and always lands somewhere that reads as a different hue.
  [r, g, b] = [b, r, g];
  const mx = Math.max(r, g, b);
  if (mx < 150) { const k = 150 / Math.max(mx, 1); r *= k; g *= k; b *= k; }
  const h = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export const isHex = (v: string | null | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

/** A filename an artist can find again in their downloads folder six weeks later. */
export function clipFileName(slug: string, aspect: AspectKey, seconds: number, ext: string) {
  const safe = slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "release";
  return `${safe}-${ASPECTS[aspect].width}x${ASPECTS[aspect].height}-${seconds}s.${ext}`;
}

/** mm:ss, for the scrubber. */
export function mmss(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
