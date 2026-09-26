/**
 * Encoding a release clip, in the artist's browser.
 *
 * Two paths. WebCodecs (`VideoEncoder` + `AudioEncoder`) with mp4-muxer writing the container is
 * the fast one — it runs off the main thread and finishes well ahead of real time. Where WebCodecs
 * isn't available, `MediaRecorder` records the canvas and a Web Audio graph in real time and
 * produces WebM, which every platform accepts but Instagram handles less cleanly.
 *
 * Nothing here uploads anything. The audio is decoded from a File the artist picked, analysed,
 * drawn and encoded locally, and the result is a Blob they save. That is not an implementation
 * detail — it is the reason droplr can offer this at all without becoming a host for other
 * people's masters. See droplr/release-clips-feature.md.
 */
import { clipAudioBuffer, fadeGain, FPS } from "./clip";

export type EncodeKind = "webcodecs" | "mediarecorder";

/**
 * "audible" — decoded and measured, there is signal.
 * "silent"  — decoded and measured, there is none. Don't post it.
 * "unknown" — the browser wouldn't decode its own output, so nothing was proven either way.
 *
 * The third state exists because pretending it doesn't is what let a silent clip through: the check
 * used to fall back to scanning the header for a codec entry, which can't tell a silent track from
 * a loud one, and reported "has audio" on a clip that had none. Safari routinely refuses to
 * decodeAudioData an MP4 that has video in it, so that fallback fired exactly where it mattered.
 */
export type AudioVerdict = { state: "audible" | "silent" | "unknown"; peak: number | null; why?: string };

export type RenderDiagnostics = {
  path: EncodeKind;
  videoCodec: string | null;
  audioCodec: string | null;
  /** How AudioData was handed to the encoder. Safari and Chrome don't agree about this. */
  audioLayout: string | null;
  /** Chunks the audio encoder actually emitted. Zero means it accepted everything and made nothing. */
  audioChunks: number | null;
  /**
   * Total bytes across those chunks, and the mean per chunk. This is the number that separates the
   * two ways a clip goes silent. AAC spends almost nothing on silence — a quiet frame is tens of
   * bytes — and hundreds on music. So a healthy mean says the encoder was given real audio and the
   * problem is further down (muxing, or the player), while a tiny one says it was handed silence.
   */
  audioBytes: number | null;
  /**
   * Whether the encoder supplied a decoder configuration on its first chunk, and how long its
   * description is. mp4-muxer writes that description into the file's audio sample entry; without
   * it, or with a shape the muxer doesn't expect, the track is there and nothing can decode it.
   */
  audioConfig: string | null;
  sampleRate: number;
  channels: number;
  audio: AudioVerdict;
};

export type RenderResult = { blob: Blob; ext: "mp4" | "webm"; how: string; kind: EncodeKind; seconds: number; hasAudio: boolean; diagnostics: RenderDiagnostics };

/**
 * Does the finished file actually make a sound?
 *
 * Belt and braces over the encoder checks, because a silent clip is the one failure an artist
 * doesn't notice until it's posted — the video looks perfect.
 */
export async function verifyAudio(blob: Blob): Promise<AudioVerdict> {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    let peak = 0;
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const d = decoded.getChannelData(c);
      // Every 97th sample: a prime stride, so it can't land on a period of the signal and miss it.
      for (let i = 0; i < d.length; i += 97) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    }
    return { state: peak > 0.001 ? "audible" : "silent", peak: +peak.toFixed(4) };
  } catch (e) {
    return { state: "unknown", peak: null, why: String((e as Error).message || e).slice(0, 120) };
  }
}

export async function blobHasAudio(blob: Blob) {
  // Decode it and look for actual signal first. A track can be present and silent — that is exactly
  // what happened when the fade was scheduled on a GainNode instead of baked into the samples, and
  // a header scan said "has audio" the whole time it was inaudible. Falls back to the scan when the
  // browser can't decode its own output, and in Node (where there is no window) for the tests.
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    let peak = 0;
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const d = decoded.getChannelData(c);
      // Every 97th sample: a prime stride, so it can't land on a period of the signal and miss it.
      for (let i = 0; i < d.length; i += 97) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    }
    return peak > 0.001;
  } catch {
    /* fall through to the header scan */
  }
  const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 4 * 1024 * 1024)).arrayBuffer());
  // Kept to what droplr actually produces — AAC in MP4, Opus or Vorbis in WebM, and Opus in MP4,
  // which some MediaRecorder implementations emit. A longer list would raise the chance of matching
  // these bytes by accident, and a false positive here silently switches the safety net off.
  const markers = ["mp4a", "Opus", "A_OPUS", "A_VORBIS", "A_AAC"].map((m) => Array.from(m, (c) => c.charCodeAt(0)));
  for (const m of markers) {
    outer: for (let i = 0; i + m.length <= head.length; i++) {
      for (let j = 0; j < m.length; j++) if (head[i + j] !== m[j]) continue outer;
      return true;
    }
  }
  return false;
}

export type RenderArgs = {
  canvas: HTMLCanvasElement;
  /** Draws frame `i` onto the canvas. Owned by the component so the preview and the render agree. */
  drawFrame: (i: number) => void;
  frames: number;
  buffer: AudioBuffer;
  start: number;
  clipLen: number;
  fadeIn: number;
  fadeOut: number;
  /** 0..1. Called often enough to animate a bar, not every frame. */
  onProgress: (fraction: number) => void;
  onNote: (note: string) => void;
  signal?: AbortSignal;
};

/**
 * iOS, including an iPad reporting itself as a Mac.
 *
 * Every browser on iOS runs Safari's engine, so this is a platform test rather than a browser one:
 * Chrome on an iPhone hits exactly the same walls because it is Safari underneath.
 */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const webCodecsAvailable = () =>
  typeof window !== "undefined" &&
  typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === "function" &&
  typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder === "function";

/**
 * H.264 profiles to try, best first. High, then Main, then Baseline — and a Level 4.2 variant of
 * each, because 1080×1920 is 8160 macroblocks and Level 4.0 allows 8192: it fits, but only just,
 * and some encoders refuse it. Baseline is what older Android and some Linux builds actually have,
 * and every platform an artist posts to accepts it.
 */
const H264_CODECS = ["avc1.640028", "avc1.64002A", "avc1.4d0028", "avc1.4d002A", "avc1.42002A", "avc1.42E01E"];
const AAC_CODEC = "mp4a.40.2";

/**
 * Whether this browser can actually make an MP4, as opposed to merely having the API.
 *
 * The API existing is not the same question. Chromium built without proprietary codecs — which is
 * what ships in some Linux distributions and every headless container — exposes VideoEncoder and
 * AudioEncoder and then refuses to create an H.264 or AAC encoder, with "Encoder creation error."
 * and nothing else. Asking first means those artists go straight to the real-time path with an
 * honest message instead of waiting for a failure.
 */
export async function pickMp4Config(width: number, height: number, sampleRate = 44100, channels = 2) {
  if (!webCodecsAvailable()) return null;
  const W = window as unknown as { VideoEncoder: typeof VideoEncoder; AudioEncoder: typeof AudioEncoder };
  let video: string | null = null;
  for (const codec of H264_CODECS) {
    try {
      const s = await W.VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 7_000_000, framerate: FPS });
      if (s.supported) { video = codec; break; }
    } catch { /* an unknown codec string throws rather than answering false */ }
  }
  if (!video) return null;
  // Asked at the rate and channel count the track actually has. Probing a fixed 44.1kHz stereo and
  // then configuring 48kHz mono is how you get a config that passed and an encoder that produces nothing.
  try {
    const a = await W.AudioEncoder.isConfigSupported({ codec: AAC_CODEC, sampleRate, numberOfChannels: channels, bitrate: 192_000 });
    if (!a.supported) return null;
  } catch {
    return null;
  }
  return { video, audio: AAC_CODEC };
}

/**
 * Which AudioData layout this browser takes.
 *
 * Chrome accepts interleaved "f32". Not every implementation does, and one that refuses it throws
 * on construction rather than answering a question, so the only way to find out is to try.
 */
function audioDataFormat(W: { AudioData: typeof AudioData }): "f32" | "f32-planar" {
  try {
    const probe = new W.AudioData({ format: "f32", sampleRate: 48000, numberOfFrames: 1, numberOfChannels: 2, timestamp: 0, data: new Float32Array(2) });
    probe.close();
    return "f32";
  } catch {
    return "f32-planar";
  }
}

/** One slice of the interleaved buffer, laid out the way this browser's AudioData wants it. */
function sliceFor(out: Float32Array, off: number, n: number, channels: number, format: "f32" | "f32-planar") {
  const inter = out.slice(off * channels, (off + n) * channels);
  if (format === "f32") return inter;
  const planar = new Float32Array(n * channels);
  for (let c = 0; c < channels; c++) for (let i = 0; i < n; i++) planar[c * n + i] = inter[i * channels + c];
  return planar;
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
};

const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

/**
 * The clip's audio, interleaved and faded, as one Float32Array.
 *
 * getChannelData() is hoisted out of the sample loop deliberately: calling it per sample is 1.4
 * million property lookups on a 30-second clip and it dominated the render before it was moved.
 */
function interleave(buffer: AudioBuffer, start: number, clipLen: number, fadeIn: number, fadeOut: number) {
  const sampleRate = buffer.sampleRate;
  const channels = Math.min(2, buffer.numberOfChannels);
  const from = Math.floor(start * sampleRate);
  const total = Math.floor(clipLen * sampleRate);
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));
  const out = new Float32Array(total * channels);
  for (let i = 0; i < total; i++) {
    const g = fadeGain(i / sampleRate, clipLen, fadeIn, fadeOut);
    for (let c = 0; c < channels; c++) out[i * channels + c] = (data[c][from + i] || 0) * g;
  }
  return { out, total, channels, sampleRate };
}

async function renderWebCodecs(args: RenderArgs, codecs: { video: string; audio: string }, diag: RenderDiagnostics): Promise<RenderResult> {
  const { canvas, drawFrame, frames, buffer, onProgress, onNote, signal } = args;
  const t0 = performance.now();
  diag.videoCodec = codecs.video;
  diag.audioCodec = codecs.audio;
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const { out, total, channels, sampleRate } = interleave(buffer, args.start, args.clipLen, args.fadeIn, args.fadeOut);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: canvas.width, height: canvas.height },
    audio: { codec: "aac", sampleRate, numberOfChannels: channels },
    // The whole file is held in memory and the index written at the front, so the MP4 plays
    // immediately instead of needing the tail first. A 60s clip is tens of megabytes; that's fine.
    fastStart: "in-memory",
  });

  const W = window as unknown as {
    VideoEncoder: typeof VideoEncoder;
    AudioEncoder: typeof AudioEncoder;
    VideoFrame: typeof VideoFrame;
    AudioData: typeof AudioData;
  };

  let encoderError: string | null = null;
  let audioChunks = 0;
  const venc = new W.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e.message; },
  });
  venc.configure({ codec: codecs.video, width: canvas.width, height: canvas.height, bitrate: 7_000_000, framerate: FPS });
  let audioBytes = 0;
  let audioConfig = "never sent";
  const aenc = new W.AudioEncoder({
    output: (chunk, meta) => {
      audioChunks++;
      audioBytes += chunk.byteLength;
      if (audioConfig === "never sent" && meta?.decoderConfig) {
        const d = meta.decoderConfig.description;
        const len = d ? (d as ArrayBuffer).byteLength ?? (d as Uint8Array).length : 0;
        audioConfig = `${meta.decoderConfig.codec ?? "?"} desc=${d ? `${len}B` : "none"}`;
      }
      muxer.addAudioChunk(chunk, meta);
    },
    error: (e) => { encoderError = e.message; },
  });
  aenc.configure({ codec: codecs.audio, sampleRate, numberOfChannels: channels, bitrate: 192_000 });

  onNote(`Encoding ${codecs.video.startsWith("avc") ? "H.264" : codecs.video} — no need to keep the tab in front.`);
  for (let i = 0; i < frames; i++) {
    throwIfAborted(signal);
    if (encoderError) throw new Error(encoderError);
    drawFrame(i);
    const frame = new W.VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    // A keyframe every two seconds: enough for platforms to scrub and re-encode cleanly.
    venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    if (i % 10 === 0) { onProgress((i / frames) * 0.7); await yieldToBrowser(); }
    // Without this the queue grows unbounded and the tab's memory goes with it.
    if (venc.encodeQueueSize > 30) await new Promise((r) => setTimeout(r, 8));
  }

  const format = audioDataFormat(W);
  diag.audioLayout = format;
  const slice = sampleRate; // one second at a time
  for (let off = 0; off < total; off += slice) {
    throwIfAborted(signal);
    if (encoderError) throw new Error(encoderError);
    const n = Math.min(slice, total - off);
    const audio = new W.AudioData({
      format,
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: Math.round((off / sampleRate) * 1e6),
      data: sliceFor(out, off, n, channels, format),
    });
    aenc.encode(audio);
    audio.close();
    onProgress(0.7 + (off / total) * 0.25);
    await yieldToBrowser();
    if (aenc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 8));
  }

  await venc.flush();
  await aenc.flush();
  if (encoderError) throw new Error(encoderError);
  // An encoder that accepted the config, accepted every AudioData and emitted nothing leaves a file
  // with an audio track declared and no samples in it: it plays, it looks right, and it is silent.
  // Found on Safari. Throwing here falls back to MediaRecorder rather than handing over a mute clip.
  diag.audioChunks = audioChunks;
  diag.audioBytes = audioBytes;
  diag.audioConfig = audioConfig;
  if (!audioChunks) throw new Error("the audio encoder produced nothing");
  muxer.finalize();
  onProgress(1);
  const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
  diag.audio = await verifyAudio(blob);
  return {
    blob,
    ext: "mp4",
    how: `WebCodecs → MP4 (${codecs.video})`,
    kind: "webcodecs",
    seconds: (performance.now() - t0) / 1000,
    hasAudio: diag.audio.state !== "silent",
    diagnostics: diag,
  };
}

async function renderMediaRecorder(args: RenderArgs, diag: RenderDiagnostics): Promise<RenderResult> {
  const { canvas, drawFrame, frames, buffer, clipLen, onProgress, onNote, signal } = args;
  const t0 = performance.now();
  const stream = canvas.captureStream(FPS);
  const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  // A suspended context has a clock that never advances, so everything below would be scheduled in
  // the past and the recording would come out silent. Phones do this even inside a tap handler.
  if (ac.state === "suspended") await ac.resume().catch(() => {});
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  // The clip's samples with the fade already in them, exactly as the WebCodecs path does it. No
  // GainNode and no automation: a curve scheduled on an AudioParam is what recorded silence.
  src.buffer = clipAudioBuffer(ac, buffer, args.start, clipLen, args.fadeIn, args.fadeOut);
  src.connect(dest);
  const startAt = ac.currentTime + 0.06;

  for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
  // Adding an audio track to a canvas capture stream is not universally supported, and where it
  // silently doesn't take you get a perfect-looking video with no sound. Say so before recording.
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) onNote("This browser wouldn't attach the audio to the recording — the clip will have no sound.");
  const mime =
    ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  diag.audioCodec = stream.getAudioTracks().length ? "from the audio graph" : "no audio track attached";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 7_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });

  onNote(`This browser records in real time, so it takes the full ${clipLen} seconds. Leave the tab in front.`);
  rec.start();
  src.start(startAt);
  const t1 = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) return reject(new DOMException("Cancelled", "AbortError"));
      const elapsed = (performance.now() - t1) / 1000;
      drawFrame(Math.min(frames - 1, Math.floor(elapsed * FPS)));
      onProgress(Math.min(0.97, elapsed / clipLen));
      if (elapsed >= clipLen) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  }).finally(() => {
    rec.stop();
    try { src.stop(); } catch { /* already stopped */ }
    ac.close().catch(() => {});
  });
  await stopped;
  onProgress(1);
  const isMp4 = mime.includes("mp4");
  const blob = new Blob(parts, { type: mime });
  diag.path = "mediarecorder";
  diag.videoCodec = mime;
  diag.audio = await verifyAudio(blob);
  return {
    blob,
    ext: isMp4 ? "mp4" : "webm",
    how: `MediaRecorder → ${isMp4 ? "MP4" : "WebM"}`,
    kind: "mediarecorder",
    seconds: (performance.now() - t0) / 1000,
    hasAudio: diag.audio.state !== "silent",
    diagnostics: diag,
  };
}

/** WebCodecs where it exists, MediaRecorder where it doesn't — and if WebCodecs fails mid-way, fall back rather than leaving them with nothing. */
export async function renderClip(args: RenderArgs): Promise<RenderResult> {
  const channels = Math.min(2, args.buffer.numberOfChannels);
  const diag: RenderDiagnostics = {
    path: "webcodecs", videoCodec: null, audioCodec: null, audioLayout: null, audioChunks: null, audioBytes: null, audioConfig: null,
    sampleRate: args.buffer.sampleRate, channels, audio: { state: "unknown", peak: null },
  };
  const codecs = await pickMp4Config(args.canvas.width, args.canvas.height, args.buffer.sampleRate, channels);
  if (codecs) {
    try {
      const out = await renderWebCodecs(args, codecs, diag);
      // An encoder can accept everything, emit chunks, and still produce a track with no signal in
      // it. If we could prove that, don't hand it over — record it in real time instead.
      if (out.diagnostics.audio.state !== "silent") return out;
      args.onNote("The fast encoder produced a silent track. Recording in real time instead.");
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      args.onNote(`The fast encoder stopped (${(e as Error).message}). Recording in real time instead.`);
    }
  } else {
    args.onNote(
      webCodecsAvailable()
        ? "This browser can't encode H.264, so the clip is recorded in real time and comes out as WebM. Chrome, Edge or Safari give you an MP4."
        : "This browser doesn't have WebCodecs, so the clip is recorded in real time and comes out as WebM.",
    );
  }
  return renderMediaRecorder(args, diag);
}
