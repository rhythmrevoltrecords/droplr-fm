"use client";
/**
 * Release clips: pick a few seconds of the track, get a video for Reels or the feed.
 *
 * Everything happens in this browser. The audio file is read with FileReader, decoded with Web
 * Audio, analysed, drawn to a canvas and encoded — and never uploaded. That is the promise the
 * rest of droplr is built on (we keep the link, not the file) and it is also why this costs
 * nothing to run, which is why it's included rather than sold as an add-on.
 *
 * The preview is driven by the same analysis the render uses, not a separate live analyser. The
 * prototype had two code paths and they disagreed about what a band was; there is now one.
 */
import { Download, Loader2, Music, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  analyseClip, ASPECTS, type AspectKey, buildPeaks, clampFades, type ClipAnalysis, clipFileName,
  CLIP_LENGTHS, FADE_CHOICES, fadeSummary, FPS, isHex, loudestWindow, mmss, partnerHex,
} from "@/lib/clip";
import { pickMp4Config, renderClip, type RenderResult } from "@/lib/clip-encode";
import { drawClipFrame, type FrameCopy } from "@/lib/clip-frame";
import { cn } from "@/lib/utils";

const FALLBACK_ACCENT = "#8B5CF6";
const WAVE_BUCKETS = 1600;

export type ClipForgeProps = {
  releaseId: string;
  slug: string;
  title: string;
  artistName: string;
  /** Same-origin proxy, so the artwork can't taint the canvas whatever store it came from. */
  coverSrc: string;
  accentColor: string | null;
  link: string;
  live: boolean;
  /** False on Free and Artist: the droplr mark goes under the link. */
  removeBranding: boolean;
};

type Phase = { kind: "idle" } | { kind: "working"; note: string; progress: number } | { kind: "done"; result: RenderResult };

export function ClipForge(props: ClipForgeProps) {
  const [aspect, setAspect] = useState<AspectKey>("tall");
  const [clipLen, setClipLen] = useState<number>(30);
  const [selStart, setSelStart] = useState(0);
  const [fadeIn, setFadeIn] = useState(0.25);
  const [fadeOut, setFadeOut] = useState(1);
  const [fadeNote, setFadeNote] = useState<string | null>(null);
  const [headline, setHeadline] = useState(props.live ? "OUT NOW" : "PRE-SAVE NOW");
  const [tagline, setTagline] = useState(`${props.artistName} — ${props.title}`);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [mp4, setMp4] = useState<boolean | null>(null);

  const frameRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const analysisRef = useRef<ClipAnalysis | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const accent = isHex(props.accentColor) ? props.accentColor : FALLBACK_ACCENT;
  const accent2 = useMemo(() => partnerHex(accent), [accent]);
  const size = ASPECTS[aspect];
  const frames = Math.round(clipLen * FPS);

  const copy: FrameCopy = useMemo(
    () => ({
      headline: headline.trim() || (props.live ? "OUT NOW" : "PRE-SAVE NOW"),
      link: props.link.replace(/^https?:\/\//, ""),
      tagline: tagline.trim(),
      mark: props.removeBranding ? null : "droplr.fm",
    }),
    [headline, tagline, props.link, props.live, props.removeBranding],
  );

  /** One frame of the composition. Index -1 means the resting state. */
  const paint = useCallback(
    (i: number) => {
      const canvas = frameRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const a = analysisRef.current;
      drawClipFrame({
        ctx,
        width: canvas.width,
        height: canvas.height,
        progress: i < 0 || !frames ? 0 : i / frames,
        bands: a && i >= 0 ? a.bands.map((b) => b[Math.min(i, b.length - 1)]) : null,
        kick: a && i >= 0 ? a.low[Math.min(i, a.low.length - 1)] : 0,
        art: artRef.current,
        accent,
        accent2,
        copy,
      });
    },
    [accent, accent2, copy, frames],
  );

  // Ask the browser whether it can actually encode H.264, not just whether the API exists. A
  // Chromium built without proprietary codecs has WebCodecs and still can't make an MP4, and the
  // artist should know that before they wait through a real-time render to find out.
  useEffect(() => {
    let live = true;
    pickMp4Config(size.width, size.height).then((c) => { if (live) setMp4(!!c); }).catch(() => { if (live) setMp4(false); });
    return () => { live = false; };
  }, [size.width, size.height]);

  // --- artwork ---------------------------------------------------------------------------------
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { artRef.current = img; setArtReady(true); };
    img.onerror = () => setError("Couldn't load the artwork for this release. The clip will render without it.");
    img.src = props.coverSrc;
    return () => { img.onload = null; img.onerror = null; };
  }, [props.coverSrc]);

  // --- canvas size and repaint -----------------------------------------------------------------
  useEffect(() => {
    const canvas = frameRef.current;
    if (!canvas) return;
    canvas.width = size.width;
    canvas.height = size.height;
    paint(-1);
  }, [size.width, size.height, paint, artReady]);

  // --- waveform --------------------------------------------------------------------------------
  const drawWave = useCallback(() => {
    const canvas = waveRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!peaks || !duration) {
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(0, H / 2 - 1, W, 2);
      return;
    }
    const from = selStart / duration, to = Math.min(1, (selStart + clipLen) / duration);
    for (let i = 0; i < peaks.length; i++) {
      const f = i / peaks.length;
      const h = Math.max(2, peaks[i] * H * 0.86);
      ctx.fillStyle = f >= from && f <= to ? accent : "rgba(255,255,255,.16)";
      ctx.fillRect(Math.round((i / peaks.length) * W), (H - h) / 2, Math.max(1, W / peaks.length - 0.5), h);
    }
  }, [peaks, duration, selStart, clipLen, accent]);

  useEffect(() => { drawWave(); }, [drawWave]);

  // --- audio -----------------------------------------------------------------------------------
  async function onAudio(file: File | undefined) {
    if (!file) return;
    stop();
    setError(null);
    setAudioName(file.name);
    setDecoding(true);
    analysisRef.current = null;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      await ctx.close();
      bufferRef.current = buf;
      const channel = buf.getChannelData(0);
      const p = buildPeaks(channel, WAVE_BUCKETS);
      setPeaks(p);
      setDuration(buf.duration);
      // Open on the loudest window, so they land near the drop instead of on the intro.
      setSelStart(loudestWindow(p, buf.duration, Math.min(clipLen, buf.duration)));
      if (buf.duration < clipLen) {
        const fits = [...CLIP_LENGTHS].reverse().find((l) => l <= buf.duration);
        if (fits) setClipLen(fits);
      }
    } catch {
      setError("Couldn't read that audio file. WAV, MP3, M4A and FLAC all work — try exporting a WAV.");
      bufferRef.current = null;
      setPeaks(null);
      setDuration(0);
    } finally {
      setDecoding(false);
    }
  }

  /** Any change to what the clip contains invalidates the analysis the preview and render share. */
  const invalidate = () => { analysisRef.current = null; };

  const ensureAnalysis = useCallback(() => {
    const buf = bufferRef.current;
    if (!buf) return null;
    if (!analysisRef.current) {
      analysisRef.current = analyseClip({
        channel: buf.getChannelData(0),
        sampleRate: buf.sampleRate,
        start: selStart,
        clipLen,
        frames,
        fadeIn,
        fadeOut,
      });
    }
    return analysisRef.current;
  }, [selStart, clipLen, frames, fadeIn, fadeOut]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { sourceRef.current?.stop(); } catch { /* already stopped */ }
    sourceRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => { stop(); abortRef.current?.abort(); }, [stop]);

  function play() {
    const buf = bufferRef.current;
    if (!buf) return;
    stop();
    ensureAnalysis();
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const steps = 200;
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const t = (i / (steps - 1)) * clipLen;
      let g = 1;
      if (fadeIn > 0 && t < fadeIn) g *= Math.sin((Math.PI / 2) * (t / fadeIn));
      const rem = clipLen - t;
      if (fadeOut > 0 && rem < fadeOut) g *= Math.sin(((Math.PI / 2) * Math.max(0, rem)) / fadeOut);
      curve[i] = g;
    }
    gain.gain.setValueCurveAtTime(curve, ctx.currentTime, clipLen);
    src.connect(gain);
    gain.connect(ctx.destination);
    sourceRef.current = src;
    src.start(0, selStart, clipLen);
    setPlaying(true);
    const t0 = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      if (elapsed >= clipLen) { stop(); paint(-1); return; }
      paint(Math.min(frames - 1, Math.floor(elapsed * FPS)));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  // --- scrubbing -------------------------------------------------------------------------------
  const scrubbing = useRef(false);

  const moveTo = useCallback(
    (clientX: number) => {
      const canvas = waveRef.current;
      if (!canvas || !duration) return;
      const box = canvas.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      // Centre the window on the pointer, then clamp so it never runs past either end.
      const next = Math.max(0, Math.min(Math.max(0, duration - clipLen), f * duration - clipLen / 2));
      setSelStart(next);
      invalidate();
    },
    [duration, clipLen],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => { if (scrubbing.current) moveTo(e.clientX); };
    const up = () => { scrubbing.current = false; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [moveTo]);

  function setLength(n: number) {
    stop();
    setClipLen(n);
    const { fadeIn: fi, fadeOut: fo, trimmed } = clampFades(n, fadeIn, fadeOut);
    setFadeIn(fi);
    setFadeOut(fo);
    setFadeNote(trimmed ? `Fade out trimmed to ${fo}s — the two fades can't fill a ${n}s clip.` : null);
    if (duration) setSelStart((s) => Math.max(0, Math.min(Math.max(0, duration - n), s)));
    invalidate();
  }

  function setFade(which: "in" | "out", v: number) {
    stop();
    const next = which === "in" ? clampFades(clipLen, v, fadeOut) : clampFades(clipLen, fadeIn, v);
    setFadeIn(next.fadeIn);
    setFadeOut(next.fadeOut);
    setFadeNote(next.trimmed ? `Trimmed to ${fadeSummary(next.fadeIn, next.fadeOut)} — the two fades can't fill a ${clipLen}s clip.` : null);
    invalidate();
  }

  // --- render ----------------------------------------------------------------------------------
  async function render() {
    const buf = bufferRef.current;
    const canvas = frameRef.current;
    if (!buf || !canvas || phase.kind === "working") return;
    stop();
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "working", note: "Analysing the audio…", progress: 0.02 });
    try {
      // Canvas text uses the app's fonts; measuring before they load gives the wrong size.
      await document.fonts?.ready;
      await new Promise((r) => setTimeout(r, 0));
      ensureAnalysis();
      const result = await renderClip({
        canvas,
        drawFrame: paint,
        frames,
        buffer: buf,
        start: selStart,
        clipLen,
        fadeIn,
        fadeOut,
        signal: controller.signal,
        onProgress: (p) => setPhase((cur) => (cur.kind === "working" ? { ...cur, progress: Math.max(cur.progress, p) } : cur)),
        onNote: (note) => setPhase((cur) => (cur.kind === "working" ? { ...cur, note } : cur)),
      });
      setPhase({ kind: "done", result });
    } catch (e) {
      setPhase({ kind: "idle" });
      if ((e as Error).name !== "AbortError") setError(`The render stopped: ${(e as Error).message}`);
    } finally {
      abortRef.current = null;
      paint(-1);
    }
  }

  const result = phase.kind === "done" ? phase.result : null;
  const downloadUrl = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  const fileName = result ? clipFileName(props.slug, aspect, clipLen, result.ext) : "";

  const ready = !!peaks && !decoding;
  const selEnd = Math.min(duration, selStart + clipLen);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Release clip</CardTitle>
          <CardDescription>
            Pick {CLIP_LENGTHS.join(", ")} or so seconds of the track and droplr makes a video from it — the artwork pulsing on the kick, a spectrum
            following the audio, and the glow pulled from the artwork&apos;s own colour. <strong className="text-foreground">The audio never leaves your
            computer.</strong> It&apos;s read, rendered and saved here, so nothing is uploaded and nothing is stored.
            {!props.removeBranding && " A small droplr.fm line sits under your link; Artist Pro and the label plans render it clean."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <label className="cursor-pointer">
                <Music /> {audioName ? "Choose another track" : "Choose the track"}
                <input type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.aiff" className="sr-only" onChange={(e) => onAudio(e.target.files?.[0])} />
              </label>
            </Button>
            <span className="text-sm text-muted-foreground">
              {decoding ? "Decoding…" : audioName ? `${audioName} · ${mmss(duration)}` : "WAV, MP3, M4A or FLAC. Use the master you'd send to a store."}
            </span>
          </div>
          {mp4 === false && (
            <p className="text-sm text-amber-400">
              This browser can&apos;t encode H.264, so the clip records in real time and comes out as WebM. It still uploads everywhere, but Instagram
              re-encodes it — Chrome, Edge or Safari 16.4+ on a computer give you an MP4 in a fraction of the time.
            </p>
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">The bit you want</CardTitle>
              <CardDescription>
                {ready ? `Drag along the waveform. Using ${mmss(selStart)}–${mmss(selEnd)}.` : "Choose a track and the waveform appears here."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <canvas
                ref={waveRef}
                width={1200}
                height={140}
                aria-label="Track waveform — drag to choose the part of the track to use"
                className={cn("h-28 w-full rounded-lg bg-black/30 ring-1 ring-white/10", ready ? "cursor-ew-resize" : "cursor-default")}
                onPointerDown={(e) => { if (!ready) return; scrubbing.current = true; moveTo(e.clientX); }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={!ready} onClick={() => (playing ? stop() : play())}>
                  {playing ? <><Square /> Stop</> : <><Play /> Play it</>}
                </Button>
                <span className="text-xs text-muted-foreground">Play shows exactly what renders — same analysis, same bars.</span>
              </div>

              <Choices label="Length" value={clipLen} onChange={setLength} options={CLIP_LENGTHS.map((n) => ({ value: n, label: `${n}s` }))} disabled={!ready} />
              <Choices
                label="Shape"
                value={aspect}
                onChange={(v: AspectKey) => { setAspect(v); }}
                options={(Object.keys(ASPECTS) as AspectKey[]).map((k) => ({ value: k, label: ASPECTS[k].label, hint: ASPECTS[k].hint }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choices label="Fade in" value={fadeIn} onChange={(v: number) => setFade("in", v)} options={FADE_CHOICES.map((n) => ({ value: n, label: n ? `${n}s` : "None" }))} />
                <Choices label="Fade out" value={fadeOut} onChange={(v: number) => setFade("out", v)} options={FADE_CHOICES.map((n) => ({ value: n, label: n ? `${n}s` : "None" }))} />
              </div>
              {fadeNote && <p className="text-sm text-amber-400">{fadeNote}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What it says</CardTitle>
              <CardDescription>Your link is always on it — that&apos;s the point of the clip.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="clip-headline">Headline</Label>
                <Input id="clip-headline" value={headline} maxLength={24} onChange={(e) => setHeadline(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clip-tagline">Line underneath</Label>
                <Input id="clip-tagline" value={tagline} maxLength={60} onChange={(e) => setTagline(e.target.value)} />
              </div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">Link on the clip: <code className="text-foreground">{copy.link}</code></p>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>{size.width}×{size.height} · {clipLen}s · {fadeSummary(fadeIn, fadeOut)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="mx-auto overflow-hidden rounded-lg ring-1 ring-white/10" style={{ aspectRatio: size.ratio, maxWidth: aspect === "tall" ? 260 : 340 }}>
              {result && downloadUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={downloadUrl} controls playsInline className="h-full w-full bg-black" />
              ) : (
                <canvas ref={frameRef} className="h-full w-full" />
              )}
            </div>

            {phase.kind === "working" && (
              <div className="space-y-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{phase.note}</p>
                <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>Cancel</Button>
              </div>
            )}

            {result && (
              <p className="text-xs text-muted-foreground">
                {result.how} · {(result.blob.size / 1048576).toFixed(1)} MB · rendered in {result.seconds.toFixed(1)}s.
                {result.ext === "webm" && " WebM uploads to Instagram but re-encodes; an MP4 from Chrome or Edge posts cleaner."}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button disabled={!ready || phase.kind === "working"} onClick={render}>
                {phase.kind === "working" ? <><Loader2 className="animate-spin" /> Rendering…</> : result ? "Render again" : "Render the clip"}
              </Button>
              {result && downloadUrl && (
                <Button asChild variant="secondary">
                  <a href={downloadUrl} download={fileName}><Download /> Save</a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Rendering uses this computer&apos;s CPU — a 30-second clip takes roughly that long or less. On a phone it&apos;s slow and gets hot, so do it on a laptop.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Choices<T extends string | number>({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            aria-pressed={value === o.value}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-50",
              value === o.value ? "border-violet-500/60 bg-violet-500/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
