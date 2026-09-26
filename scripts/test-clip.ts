/**
 * Release clips: the maths that decides whether the video looks right.
 *
 * What this defends:
 *  - **band edges must be strictly increasing.** Log-spaced FFT bin boundaries round to the same
 *    value at the low end (2,2,3,3,4,4…), so every second band spans zero bins and sits dead at
 *    the floor for the whole clip. That bug shipped twice in the prototype — once unnoticed, once
 *    reported by ear ("its first one 3rd one 5th than 7th that don't go up at all"). It is the
 *    single thing most likely to come back if anyone rewrites the maths;
 *  - fades are equal-power, not linear. A linear ramp dips audibly in the middle;
 *  - the fade applies to the analysis as well as the audio, or the bars stand at full height over
 *    what the viewer hears as silence;
 *  - the FFT actually resolves a frequency, rather than returning plausible-looking noise;
 *  - the droplr mark is on exactly the plans the pricing decision says it is.
 *
 * No database, no server, no browser: this is all pure functions by design.
 */
import {
  analyseClip, ASPECTS, BANDS, bandEdges, buildPeaks, clampFades, clipFileName, CLIP_LENGTHS,
  clipAudioBuffer, fadeGain, fadeSummary, FFT_SIZE, fft, FPS, hexA, isHex, loudestWindow, mixHex, mmss, partnerHex,
} from "../src/lib/clip";
import { blobHasAudio, verifyAudio } from "../src/lib/clip-encode";
import { planOf } from "../src/lib/plans";

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

async function main() {
  console.log("1. Band edges — the bug that shipped twice");
  for (const [bins, bands] of [[FFT_SIZE / 2, BANDS], [1024, 44], [512, 44], [256, 44], [128, 32], [64, 44], [2048, 64]] as const) {
    const e = bandEdges(bins, bands);
    const increasing = e.every((v, i) => i === 0 || v > e[i - 1]);
    const noEmpty = e.slice(0, -1).every((v, i) => e[i + 1] - v >= 1);
    check(`${bins} bins × ${bands} bands: strictly increasing`, increasing, e.slice(0, 10).join(","));
    check(`${bins} bins × ${bands} bands: no band spans zero bins`, noEmpty);
    check(`${bins} bins × ${bands} bands: ${bands} bands from ${bands + 1} edges`, e.length === bands + 1);
  }
  const edges = bandEdges(FFT_SIZE / 2, BANDS);
  check("the first band skips DC and bin 1", edges[0] === 2, String(edges[0]));
  check("the top edge stays inside the spectrum", edges[edges.length - 1] <= FFT_SIZE / 2, String(edges[edges.length - 1]));
  // The unguarded version produced exactly this at the low end. Named so nobody reintroduces it.
  check("the low edges climb one bin at a time, not 2,2,3,3", edges.slice(0, 8).join(",") === "2,3,4,5,6,7,8,9", edges.slice(0, 8).join(","));

  console.log("\n2. Fades are equal-power, not linear");
  check("silent at the very start of a fade in", near(fadeGain(0, 30, 1, 1), 0));
  check("full by the end of the fade in", near(fadeGain(1, 30, 1, 1), 1));
  // sin(π/4) = 0.7071. A linear ramp would give 0.5 here, and that is what dips audibly.
  check("halfway through a fade is 0.707, not 0.5", near(fadeGain(0.5, 30, 1, 1), Math.SQRT1_2, 1e-6), String(fadeGain(0.5, 30, 1, 1)));
  check("full through the middle of the clip", near(fadeGain(15, 30, 1, 1), 1));
  check("silent at the very end of a fade out", near(fadeGain(30, 30, 1, 1), 0, 1e-9));
  check("halfway through the fade out is 0.707", near(fadeGain(29.5, 30, 1, 1), Math.SQRT1_2, 1e-6));
  check("no fades means no attenuation anywhere", [0, 1, 15, 29.999].every((t) => near(fadeGain(t, 30, 0, 0), 1)));
  check("gain never leaves 0..1", [0, 0.1, 5, 14.9, 29.9, 30].every((t) => { const g = fadeGain(t, 30, 2, 2); return g >= 0 && g <= 1; }));

  console.log("\n3. Two fades can't fill the clip");
  check("fades that fit are left alone", JSON.stringify(clampFades(30, 1, 2)) === JSON.stringify({ fadeIn: 1, fadeOut: 2, trimmed: false }));
  const tight = clampFades(15, 8, 8);
  check("fades that overflow are trimmed", tight.trimmed && tight.fadeIn + tight.fadeOut <= 15 * 0.9 + 1e-9, JSON.stringify(tight));
  check("the fade in is the one kept", tight.fadeIn === 8);
  const extreme = clampFades(15, 20, 2);
  check("a fade in longer than the clip is itself capped", extreme.fadeIn <= 15 * 0.9 && extreme.fadeOut === 0, JSON.stringify(extreme));
  check("the summary reads in plain words", fadeSummary(0, 1) === "no fade in, 1s out" && fadeSummary(0.25, 0) === "0.25s in, no fade out");

  console.log("\n4. The FFT resolves a real frequency");
  const re = new Float32Array(1024), im = new Float32Array(1024);
  const targetBin = 64;
  for (let i = 0; i < 1024; i++) re[i] = Math.sin((2 * Math.PI * targetBin * i) / 1024);
  fft(re, im);
  const mags = Array.from({ length: 512 }, (_, i) => Math.hypot(re[i], im[i]));
  const peak = mags.indexOf(Math.max(...mags));
  check("a pure sine peaks in its own bin", peak === targetBin, `peak at ${peak}`);
  const others = mags.filter((_, i) => Math.abs(i - targetBin) > 2);
  check("and nowhere else", Math.max(...others) < mags[targetBin] / 50, `${Math.max(...others).toFixed(2)} vs ${mags[targetBin].toFixed(2)}`);

  console.log("\n5. Analysis of a real-shaped signal");
  const SR = 44100, LEN = 4, frames = LEN * FPS;
  const channel = new Float32Array(SR * (LEN + 2));
  // 60Hz kick fundamental plus a 4kHz hat, so the low band and a high band both have something.
  for (let i = 0; i < channel.length; i++) {
    const t = i / SR;
    channel[i] = 0.7 * Math.sin(2 * Math.PI * 60 * t) + 0.2 * Math.sin(2 * Math.PI * 4000 * t);
  }
  const a = analyseClip({ channel, sampleRate: SR, start: 0, clipLen: LEN, frames, fadeIn: 0, fadeOut: 0, });
  check("one low value per frame", a.low.length === frames, String(a.low.length));
  check("one series per band", a.bands.length === BANDS && a.bands.every((b) => b.length === frames));
  check("everything is normalised into 0..1", a.bands.every((b) => b.every((v) => v >= 0 && v <= 1)) && a.low.every((v) => v >= 0 && v <= 1));
  check("nothing is NaN", a.low.every(Number.isFinite) && a.bands.every((b) => b.every(Number.isFinite)));
  const bandEnergy = a.bands.map((b) => b.reduce((s, v) => s + v, 0) / b.length);
  check("the bands aren't all identical — the spectrum has shape", Math.max(...bandEnergy) - Math.min(...bandEnergy) > 0.05, bandEnergy.slice(0, 5).map((v) => v.toFixed(2)).join(","));

  // The fade has to reach the analysis, or the bars stand at full height over silence.
  const faded = analyseClip({ channel, sampleRate: SR, start: 0, clipLen: LEN, frames, fadeIn: 1, fadeOut: 1 });
  const early = (x: number[]) => x.slice(0, 5).reduce((s, v) => s + v, 0);
  const middle = (x: number[]) => x.slice(Math.floor(frames / 2) - 2, Math.floor(frames / 2) + 3).reduce((s, v) => s + v, 0);
  check("a faded-in clip starts quieter than its middle", early(faded.low) < middle(faded.low), `${early(faded.low).toFixed(2)} vs ${middle(faded.low).toFixed(2)}`);
  check("and quieter than the same clip with no fade", early(faded.low) <= early(a.low) + 1e-9);

  console.log("\n6. Finding the loud part");
  const track = new Float32Array(SR * 60);
  for (let i = 0; i < track.length; i++) track[i] = (i > SR * 30 && i < SR * 45 ? 0.9 : 0.05) * Math.sin(i / 20);
  const peaks = buildPeaks(track, 1600);
  check("peaks come back at the size asked for", peaks.length === 1600);
  check("peaks are magnitudes, never negative", peaks.every((v) => v >= 0));
  const at = loudestWindow(peaks, 60, 15);
  check("the opening window lands on the loud section", at > 20 && at < 32, `${at.toFixed(1)}s`);
  check("it leads into the loud part rather than starting on top of it", at < 30, `${at.toFixed(1)}s`);
  check("the window never runs past the end", loudestWindow(peaks, 60, 15) + 15 <= 60 + 1e-9);
  check("a track shorter than the clip starts at zero", loudestWindow(peaks, 10, 30) === 0);

  console.log("\n7. Colour");
  check("hexA keeps the channels and takes the alpha", hexA("#8B5CF6", 0.5) === "rgba(139,92,246,0.5)", hexA("#8B5CF6", 0.5));
  check("mixHex at 0 is the first colour", mixHex("#000000", "#FFFFFF", 0) === "rgb(0,0,0)");
  check("mixHex at 1 is the second", mixHex("#000000", "#FFFFFF", 1) === "rgb(255,255,255)");
  check("mixHex halfway is halfway", mixHex("#000000", "#FFFFFF", 0.5) === "rgb(128,128,128)", mixHex("#000000", "#FFFFFF", 0.5));
  check("a partner colour is a valid hex", isHex(partnerHex("#8B5CF6")), partnerHex("#8B5CF6"));
  check("a partner colour differs from its source", partnerHex("#8B5CF6").toLowerCase() !== "#8b5cf6");
  check("a near-black accent still yields something visible", (() => { const p = partnerHex("#0A0A0A"); return isHex(p) && parseInt(p.slice(1, 3), 16) + parseInt(p.slice(3, 5), 16) + parseInt(p.slice(5, 7), 16) > 200; })(), partnerHex("#0A0A0A"));
  check("isHex rejects what isn't one", !isHex("8B5CF6") && !isHex("#8B5CF") && !isHex(null) && !isHex("") && isHex("#8b5cf6"));

  console.log("\n8. Output");
  check("the filename says what it is", clipFileName("ototo-messitup", "tall", 30, "mp4") === "ototo-messitup-1080x1920-30s.mp4", clipFileName("ototo-messitup", "tall", 30, "mp4"));
  check("a square clip says so", clipFileName("x", "square", 15, "webm") === "x-1080x1080-15s.webm");
  check("a hostile slug can't escape the filename", clipFileName("../../etc/passwd", "square", 30, "mp4") === "etc-passwd-1080x1080-30s.mp4", clipFileName("../../etc/passwd", "square", 30, "mp4"));
  check("an empty slug still produces a name", clipFileName("", "square", 30, "mp4") === "release-1080x1080-30s.mp4");
  check("timestamps read as minutes and seconds", mmss(0) === "0:00" && mmss(65) === "1:05" && mmss(-4) === "0:00" && mmss(3600) === "60:00");

  console.log("\n9. Shape and length presets");
  check("both shapes are 1080 on the short edge", Object.values(ASPECTS).every((s) => Math.min(s.width, s.height) === 1080));
  check("the reel is 9:16 and the feed is 1:1", ASPECTS.tall.height / ASPECTS.tall.width === 16 / 9 && ASPECTS.square.width === ASPECTS.square.height);
  check("every length is a whole number of frames", CLIP_LENGTHS.every((n) => Number.isInteger(n * FPS)));
  check("the longest preset fits what platforms take", Math.max(...CLIP_LENGTHS) <= 60);

  console.log("\n10. The fade is baked into the samples, not scheduled");
  // The preview and the real-time recorder used to fade with setValueCurveAtTime on a GainNode.
  // That is the one thing they had in common that the WebCodecs path — which bakes the fade into
  // the samples and worked — did not, and both of them came out silent on Safari and on phones.
  // Automation depends on the context clock and on each browser's curve implementation; samples
  // don't. These checks are here so nobody reintroduces a GainNode to do this job.
  const SR2 = 48000, LEN2 = 4;
  const fake = { sampleRate: SR2, numberOfChannels: 2, length: SR2 * 10,
    getChannelData: (c: number) => srcChannels[c] } as unknown as AudioBuffer;
  const srcChannels = [new Float32Array(SR2 * 10).fill(1), new Float32Array(SR2 * 10).fill(1)];
  const made: { ch: Float32Array[]; frames: number } = { ch: [], frames: 0 };
  const ctxStub = { createBuffer: (channels: number, frames: number) => {
    made.frames = frames;
    made.ch = Array.from({ length: channels }, () => new Float32Array(frames));
    return { numberOfChannels: channels, length: frames, sampleRate: SR2, getChannelData: (c: number) => made.ch[c] } as unknown as AudioBuffer;
  } } as unknown as BaseAudioContext;

  const clip = clipAudioBuffer(ctxStub, fake, 1, LEN2, 1, 1);
  check("the clip is exactly the length asked for", clip.length === LEN2 * SR2, String(clip.length));
  check("every channel comes across", clip.numberOfChannels === 2);
  const ch0 = made.ch[0];
  check("it opens from silence", Math.abs(ch0[0]) < 0.01, String(ch0[0]));
  check("it is at full level through the middle", Math.abs(ch0[Math.floor(ch0.length / 2)] - 1) < 1e-6);
  check("it ends in silence", Math.abs(ch0[ch0.length - 1]) < 0.01, String(ch0[ch0.length - 1]));
  // The failure that started all this: gain stuck at its final value for the whole clip.
  check("the middle is NOT silent — the bug this replaces", Math.abs(ch0[Math.floor(ch0.length / 2)]) > 0.9);
  const halfway = ch0[Math.floor(0.5 * SR2)];
  check("halfway through the fade in is equal-power, not linear", Math.abs(halfway - Math.SQRT1_2) < 1e-3, String(halfway));
  check("both channels are faded the same", made.ch[1].every((v, i) => Math.abs(v - ch0[i]) < 1e-9));
  const noFade = clipAudioBuffer(ctxStub, fake, 1, LEN2, 0, 0);
  check("with no fades every sample is untouched", made.ch[0].every((v) => Math.abs(v - 1) < 1e-9) && noFade.length === LEN2 * SR2);
  const past = clipAudioBuffer(ctxStub, fake, 9.5, LEN2, 0, 0);
  check("a selection running off the end is clamped, not overrun", past.length <= LEN2 * SR2 && past.length > 0, String(past.length));

  console.log("\n11. The silent-clip safety net");
  // A clip with no sound is the one failure an artist doesn't catch: the video looks perfect and
  // they find out from the post. Reported on Safari, where the audio encoder accepted everything
  // and emitted nothing. This detector is the last line before they download it.
  const withAac = new Blob([new Uint8Array(400).fill(1), new TextEncoder().encode("mp4a"), new Uint8Array(400)]);
  const withOpusWebm = new Blob([new Uint8Array(200), new TextEncoder().encode("A_OPUS"), new Uint8Array(200)]);
  const videoOnly = new Blob([new Uint8Array(4000).fill(7)]);
  check("an MP4 carrying AAC is seen as having audio", await blobHasAudio(withAac));
  check("a WebM carrying Opus is too", await blobHasAudio(withOpusWebm));
  check("a file with no audio track is not", !(await blobHasAudio(videoOnly)));
  check("an empty file is not", !(await blobHasAudio(new Blob([]))));
  check("a marker split across the scan boundary isn't invented", !(await blobHasAudio(new Blob([new TextEncoder().encode("mp4")]))));

  // The third state is the point. Reporting "has audio" when nothing could be decoded is what let a
  // silent clip through: the header scan finds mp4a in a silent track exactly as it does in a loud
  // one, and Safari refuses to decodeAudioData an MP4 containing video, so the weak check fired
  // precisely where it mattered. In Node there is no window, so every verdict here is "unknown".
  const verdict = await verifyAudio(withAac);
  check("a file that can't be decoded is 'unknown', never 'audible'", verdict.state === "unknown", verdict.state);
  check("an unverified file reports no peak rather than a made-up one", verdict.peak === null);
  check("and says why", !!verdict.why);
  check("'unknown' is not treated as silent either", verdict.state !== "silent");

  console.log("\n12. The droplr mark is on the plans the pricing decision says");
  // Free gets clips on purpose: every marked reel is distribution that costs nothing, because the
  // render happens on the artist's own machine. The mark is the limit, not a render cap.
  for (const p of ["free", "artist"]) check(`${p}: clip carries the mark`, !planOf(p).removeBranding);
  for (const p of ["artist_pro", "pro", "label", "enterprise"]) check(`${p}: clip renders clean`, planOf(p).removeBranding);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
