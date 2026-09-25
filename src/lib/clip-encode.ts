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
import { fadeGain, FPS } from "./clip";

export type EncodeKind = "webcodecs" | "mediarecorder";

export type RenderResult = { blob: Blob; ext: "mp4" | "webm"; how: string; kind: EncodeKind; seconds: number };

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
export async function pickMp4Config(width: number, height: number) {
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
  try {
    const a = await W.AudioEncoder.isConfigSupported({ codec: AAC_CODEC, sampleRate: 44100, numberOfChannels: 2, bitrate: 192_000 });
    if (!a.supported) return null;
  } catch {
    return null;
  }
  return { video, audio: AAC_CODEC };
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

async function renderWebCodecs(args: RenderArgs, codecs: { video: string; audio: string }): Promise<RenderResult> {
  const { canvas, drawFrame, frames, buffer, onProgress, onNote, signal } = args;
  const t0 = performance.now();
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
  const venc = new W.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e.message; },
  });
  venc.configure({ codec: codecs.video, width: canvas.width, height: canvas.height, bitrate: 7_000_000, framerate: FPS });
  const aenc = new W.AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
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

  const slice = sampleRate; // one second at a time
  for (let off = 0; off < total; off += slice) {
    throwIfAborted(signal);
    const n = Math.min(slice, total - off);
    const audio = new W.AudioData({
      format: "f32",
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: Math.round((off / sampleRate) * 1e6),
      data: out.slice(off * channels, (off + n) * channels),
    });
    aenc.encode(audio);
    audio.close();
    onProgress(0.7 + (off / total) * 0.25);
    await yieldToBrowser();
  }

  await venc.flush();
  await aenc.flush();
  muxer.finalize();
  if (encoderError) throw new Error(encoderError);
  onProgress(1);
  return {
    blob: new Blob([muxer.target.buffer], { type: "video/mp4" }),
    ext: "mp4",
    how: `WebCodecs → MP4 (${codecs.video})`,
    kind: "webcodecs",
    seconds: (performance.now() - t0) / 1000,
  };
}

async function renderMediaRecorder(args: RenderArgs): Promise<RenderResult> {
  const { canvas, drawFrame, frames, buffer, clipLen, onProgress, onNote, signal } = args;
  const t0 = performance.now();
  const stream = canvas.captureStream(FPS);
  const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  src.connect(gain);
  gain.connect(dest);

  // The same equal-power curve the offline path uses, sampled into a value curve so the recorded
  // audio and the analysed bars can't drift apart.
  const steps = 200;
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) curve[i] = fadeGain((i / (steps - 1)) * clipLen, clipLen, args.fadeIn, args.fadeOut);
  gain.gain.setValueCurveAtTime(curve, ac.currentTime, clipLen);

  for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
  const mime =
    ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 7_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });

  onNote(`This browser records in real time, so it takes the full ${clipLen} seconds. Leave the tab in front.`);
  rec.start();
  src.start(0, args.start, clipLen);
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
  return {
    blob: new Blob(parts, { type: mime }),
    ext: isMp4 ? "mp4" : "webm",
    how: `MediaRecorder → ${isMp4 ? "MP4" : "WebM"}`,
    kind: "mediarecorder",
    seconds: (performance.now() - t0) / 1000,
  };
}

/** WebCodecs where it exists, MediaRecorder where it doesn't — and if WebCodecs fails mid-way, fall back rather than leaving them with nothing. */
export async function renderClip(args: RenderArgs): Promise<RenderResult> {
  const codecs = await pickMp4Config(args.canvas.width, args.canvas.height);
  if (codecs) {
    try {
      return await renderWebCodecs(args, codecs);
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
  return renderMediaRecorder(args);
}
