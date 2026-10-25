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
  clipAudioBuffer, CLIP_LENGTHS, FADE_CHOICES, fadeSummary, FPS, isHex, loudestWindow, mmss,
} from "@/lib/clip";
import { pickMp4Config, renderClip, type RenderResult } from "@/lib/clip-encode";
import { drawClipFrame, type FrameCopy } from "@/lib/clip-frame";
import { CLIP_STYLES, CLIP_STYLE_LABELS, drawMotionFrame, MOTION_ENDING_LABELS, MOTION_ENDINGS, MOTION_ENTRANCE_LABELS, MOTION_ENTRANCES, motionCues, type ClipStyle, type MotionCues, type MotionEnding, type MotionEntrance } from "@/lib/clip-motion";
import { CLIP_LOOKS, clipColourWarnings, clipPalette, DEFAULT_CLIP_LOOK, type ClipColourOverrides, type ClipLookId } from "@/lib/clip-theme";
import {
  beatGrid, DEFAULT_TYPE_FONT, DEFAULT_TYPE_PALETTE, demoAnalysis, drawTypeFrame, loadTypeFont, TYPE_BACKGROUND_LABELS, TYPE_BACKGROUNDS,
  TYPE_CUT_LABELS, TYPE_CUTS, TYPE_FONTS, TYPE_PALETTES, typeColourWarnings, typeFontStack, typePalette, typeTimeline, typeWords,
  type BeatGrid, type TypeBackground, type TypeColourOverrides, type TypeCut, type TypeFontId, type TypePaletteId, type TypeStep,
} from "@/lib/clip-type";
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
  /** The same proxy for the org's logo, or null when there isn't one. Same tainting rule applies. */
  logoSrc: string | null;
  accentColor: string | null;
  link: string;
  live: boolean;
  /** False on Free and Artist: the droplr mark goes under the link. */
  removeBranding: boolean;
  /** The Type style: paid plans, the same line as page looks (plan.pageLooks). */
  typeStyle: boolean;
  /** "Fri 30 Oct" in the label's timezone, for the Type end card before release. */
  releaseDay: string | null;
};

type Phase = { kind: "idle" } | { kind: "working"; note: string; progress: number } | { kind: "done"; result: RenderResult };

export function ClipForge(props: ClipForgeProps) {
  const [aspect, setAspect] = useState<AspectKey>("tall");
  // "sticker" drops the printed URL and leaves room for Instagram's link sticker. Only meaningful
  // on a 9:16: a feed post has no sticker, so a square clip without its link has no link at all.
  const [linkMode, setLinkMode] = useState<"printed" | "sticker">("printed");
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
  const [logoReady, setLogoReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [mp4, setMp4] = useState<boolean | null>(null);


  const frameRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const logoRef = useRef<{ img: HTMLImageElement; width: number; height: number } | null>(null);
  const analysisRef = useRef<ClipAnalysis | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ensureAnalysisRef = useRef<(() => ClipAnalysis | null) | null>(null);

  const accent = isHex(props.accentColor) ? props.accentColor : FALLBACK_ACCENT;
  const [look, setLook] = useState<ClipLookId>(DEFAULT_CLIP_LOOK);
  const [style, setStyle] = useState<ClipStyle>("waveform");
  const [entrance, setEntrance] = useState<MotionEntrance>("fade");
  const [ending, setEnding] = useState<MotionEnding>("hold");
  const cuesRef = useRef<{ from: ClipAnalysis | null; cues: MotionCues }>({ from: null, cues: { firstKick: 0, drop: 0 } });
  // --- Type style ---
  // Before release the end card says when it's out; after, OUT NOW. Worked out from the release
  // date when the page loads, so nobody has to remember to change it. It's still a field: an
  // artist may want "OUT NOW ON SOUNDCLOUD" or "FRIDAY".
  const endDefault = props.live ? "OUT NOW" : props.releaseDay ? `OUT ${props.releaseDay.replace(/,/g, "").toUpperCase()}` : "PRE-SAVE NOW";
  const [typeText, setTypeText] = useState("");
  const [endLine, setEndLine] = useState(endDefault);
  const [typeFont, setTypeFont] = useState<TypeFontId>(DEFAULT_TYPE_FONT);
  const [typeCut, setTypeCut] = useState<TypeCut>(2);
  const [typeBg, setTypeBg] = useState<TypeBackground>("scratch");
  const [typeLoops, setTypeLoops] = useState(true);
  const [typeGlitch, setTypeGlitch] = useState(true);
  const [typePaletteId, setTypePaletteId] = useState<TypePaletteId>(DEFAULT_TYPE_PALETTE);
  const [typeOverrides, setTypeOverrides] = useState<TypeColourOverrides>({});
  const [fontsLoaded, setFontsLoaded] = useState<Partial<Record<TypeFontId, boolean>>>({});
  const [typeLockedNote, setTypeLockedNote] = useState(false);
  const [gridInfo, setGridInfo] = useState<BeatGrid | null>(null);
  const timelineRef = useRef<{ key: string; from: ClipAnalysis | null; steps: TypeStep[]; grid: BeatGrid | null }>({ key: "", from: null, steps: [], grid: null });
  const [overrides, setOverrides] = useState<ClipColourOverrides>({});
  const palette = useMemo(() => clipPalette(look, accent, overrides), [look, accent, overrides]);
  const typeColours = useMemo(() => typePalette(typePaletteId, accent, typeOverrides), [typePaletteId, accent, typeOverrides]);
  const typeColourNotes = useMemo(() => typeColourWarnings(typeColours), [typeColours]);
  const words = useMemo(() => typeWords(typeText, [props.title, props.artistName]), [typeText, props.title, props.artistName]);
  const colourWarnings = useMemo(() => clipColourWarnings(palette), [palette]);
  const size = ASPECTS[aspect];
  const frames = Math.round(clipLen * FPS);
  // Moves the preview before a track is chosen. Never reaches a render: render() needs the track.
  const demo = useMemo(() => demoAnalysis(frames, FPS), [frames]);

  const story = aspect === "tall" && linkMode === "sticker";
  const copyLink = props.link.replace(/^https?:\/\//, "");
  const copy: FrameCopy = useMemo(
    () => ({
      headline: headline.trim() || (props.live ? "OUT NOW" : "PRE-SAVE NOW"),
      link: story ? null : props.link.replace(/^https?:\/\//, ""),
      tagline: tagline.trim(),
      mark: props.removeBranding ? null : "droplr.fm",
    }),
    [headline, tagline, props.link, props.live, props.removeBranding, story],
  );

  /**
   * The family canvas text is drawn in. Read off the document rather than written down, because
   * next/font serves Geist under a generated family name that nothing can hardcode — and a
   * hardcoded name is what produced the Archivo bug, where the name was never loaded at all and
   * every clip silently fell back to the operating system's default face.
   *
   * Resolved in an effect, not at module scope: on the server there is no document, and reading it
   * during render would differ between the server and client passes.
   */
  const [fontFamily, setFontFamily] = useState("ui-sans-serif, system-ui, sans-serif");
  useEffect(() => {
    const resolved = getComputedStyle(document.body).fontFamily;
    if (resolved) setFontFamily(resolved);
  }, []);

  /**
   * One frame of the composition. Index -1 means the resting state. `demo` is the looping preview:
   * it uses the track's analysis when there is one and a made-up 128 BPM one when there isn't.
   */
  const paint = useCallback(
    (i: number, guide = true, demoLoop = false) => {
      const canvas = frameRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const a: ClipAnalysis | null = analysisRef.current ?? (demoLoop ? demo : null);
      const common = {
        ctx,
        width: canvas.width,
        height: canvas.height,
        progress: i < 0 || !frames ? 0 : i / frames,
        bands: a && i >= 0 ? a.bands.map((b) => b[Math.min(i, b.length - 1)]) : null,
        kick: a && i >= 0 ? a.low[Math.min(i, a.low.length - 1)] : 0,
        art: artRef.current,
        fontFamily,
        logo: logoRef.current,
        palette,
        copy,
        stickerGuide: guide,
      };
      if (style === "type") {
        if (a && cuesRef.current.from !== a) cuesRef.current = { from: a, cues: motionCues(a.low, FPS) };
        const drop = a ? cuesRef.current.cues.drop : Math.round(frames * 0.45);
        const key = JSON.stringify([words, typeCut, typeLoops, !!logoRef.current, frames, fadeOut]);
        if (timelineRef.current.key !== key || timelineRef.current.from !== a) {
          const grid = a ? beatGrid(a.low, FPS) : beatGrid([], FPS);
          timelineRef.current = {
            key,
            from: a,
            grid: a && a !== demo ? grid : null,
            steps: typeTimeline({ frames, fps: FPS, grid, drop, words, every: typeCut, hasLogo: !!logoRef.current, loops: typeLoops, fadeOut }),
          };
        }
        drawTypeFrame({
          ...common,
          i,
          frames,
          fps: FPS,
          timeline: timelineRef.current.steps,
          options: { font: typeFont, background: typeBg, glitch: typeGlitch, colours: typeColours, endLine, fadeIn, fadeOut },
        });
      } else if (style === "motion") {
        // Cues follow the analysis they came from: worked out once per analysis, not per frame.
        if (a && cuesRef.current.from !== a) cuesRef.current = { from: a, cues: motionCues(a.low, FPS) };
        const cues = a ? cuesRef.current.cues : { firstKick: 0, drop: Math.round(frames * 0.45) };
        drawMotionFrame({ ...common, i, frames, fps: FPS, cues, options: { entrance, ending, fadeIn, fadeOut } });
      } else {
        drawClipFrame(common);
      }
    },
    // logoRef is a ref on purpose: it must not re-run the paint callback identity on load. logoReady
    // is the dependency that triggers the repaint, the same way artReady does for the cover.
    [palette, copy, frames, fontFamily, logoReady, style, entrance, ending, fadeIn, fadeOut, demo, words, typeCut, typeLoops, typeFont, typeBg, typeGlitch, typeColours, endLine, fontsLoaded],
  );

  // The tempo the Type cuts follow, for the line under the style. Read after a paint has built it.
  useEffect(() => {
    if (style !== "type" || !peaks) { setGridInfo(null); return; }
    const a = ensureAnalysisRef.current?.();
    setGridInfo(a ? beatGrid(a.low, FPS) : null);
  }, [style, peaks, selStart, clipLen]);

  // Type fonts are files, loaded when picked. The render waits for them too (see render()).
  useEffect(() => {
    if (style !== "type" || fontsLoaded[typeFont]) return;
    let live = true;
    void loadTypeFont(typeFont).then((ok) => {
      if (!live) return;
      if (ok) setFontsLoaded((f) => ({ ...f, [typeFont]: true }));
      else setError("Couldn't load that font, so the preview is using a stand-in. Try another, or reload the page.");
    });
    return () => { live = false; };
  }, [style, typeFont, fontsLoaded]);

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

  // --- the label's logo ------------------------------------------------------------------------
  // A missing or broken logo is not an error worth telling the artist about: the clip is complete
  // without it, and the cover loader above already owns the one image whose absence matters.
  useEffect(() => {
    if (!props.logoSrc) { logoRef.current = null; setLogoReady(false); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoRef.current = { img, width: img.naturalWidth, height: img.naturalHeight };
      setLogoReady(true);
    };
    img.onerror = () => { logoRef.current = null; setLogoReady(false); };
    img.src = props.logoSrc;
    return () => { img.onload = null; img.onerror = null; };
  }, [props.logoSrc]);

  // --- canvas size and repaint -----------------------------------------------------------------
  useEffect(() => {
    const canvas = frameRef.current;
    if (!canvas) return;
    canvas.width = size.width;
    canvas.height = size.height;
    paint(-1);
  }, [size.width, size.height, paint, artReady]);

  // The preview moves on its own while nothing is playing or rendering, so picking a style shows
  // that style moving. It used to sit on one still frame until Play, and Motion's still frame read
  // as "nothing changed". Silent, and off for anyone who has asked their device for less motion.
  const previewing = !playing && phase.kind === "idle";
  useEffect(() => {
    if (!previewing || !frames) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      paint(Math.floor(((now - t0) / 1000) * FPS) % frames, true, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewing, paint, frames]);

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
  ensureAnalysisRef.current = ensureAnalysis;

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

  async function play() {
    const buf = bufferRef.current;
    if (!buf) return;
    stop();
    ensureAnalysis();
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtxRef.current = ctx;
    // Phones hand back a suspended AudioContext even when it's created inside a tap, and a suspended
    // context's clock doesn't move. Scheduling a fade against currentTime then puts the whole curve in
    // the past, so the gain sits at its last value — which, with a fade out, is silence. That is why
    // preview had no sound on a phone, and why a clip recorded in real time came out mute.
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    // The clip's own samples, fade already in them. No gain node and nothing scheduled on an
    // AudioParam: automation is what was silencing this on Safari and on phones.
    const src = ctx.createBufferSource();
    src.buffer = clipAudioBuffer(ctx, buf, selStart, clipLen, fadeIn, fadeOut);
    src.connect(ctx.destination);
    sourceRef.current = src;
    const startAt = ctx.currentTime + 0.06;
    src.start(startAt);
    setPlaying(true);
    // Driven by the audio clock, not performance.now(): if the context stalls (a phone locking, a tab
    // backgrounding) the picture stalls with the sound instead of running away from it.
    const tick = () => {
      const elapsed = ctx.currentTime - startAt;
      if (elapsed >= clipLen) { stop(); paint(-1); return; }
      paint(Math.max(0, Math.min(frames - 1, Math.floor(elapsed * FPS))));
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
    if (phase.kind === "working") return; // Already going: the button says so.
    // Say something. A click that returns silently is indistinguishable from a dead button, and
    // that is exactly how the unmounted-canvas bug above survived — the artist could only report
    // "it does nothing", which is true and tells nobody where to look.
    if (!buf) { setError("The track isn't loaded yet. Pick the file again and wait for the waveform."); return; }
    if (!canvas) { setError("The preview canvas went missing, which is a bug — please reload the page and tell us."); return; }
    stop();
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "working", note: "Analysing the audio…", progress: 0.02 });
    try {
      // Canvas text uses the app's fonts; measuring before they load gives the wrong size.
      await document.fonts?.ready;
      if (style === "type" && !(await loadTypeFont(typeFont))) setPhase((cur) => (cur.kind === "working" ? { ...cur, note: "The font didn't load, so this uses a stand-in face." } : cur));
      await new Promise((r) => setTimeout(r, 0));
      ensureAnalysis();
      const result = await renderClip({
        canvas,
        // Guide off: the dashed box is a note to the artist, not part of the video.
        drawFrame: (i: number) => paint(i, false),
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
  const fileName = result ? clipFileName(props.slug, aspect, clipLen, result.ext, story ? "story" : undefined) : "";

  const ready = !!peaks && !decoding;
  const selEnd = Math.min(duration, selStart + clipLen);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Release clip</CardTitle>
          <CardDescription>
            Pick {CLIP_LENGTHS.join(", ")} or so seconds of the track and droplr makes a video from it: either the waveform style, with the artwork
            pulsing on the kick and a spectrum following the audio, or Motion, where the artwork drifts in, the title lands on the first kick and
            your link on the drop. <strong className="text-foreground">The audio never leaves your
            computer.</strong> It&apos;s read, rendered and saved here, so nothing is uploaded and nothing is stored.
            {!props.removeBranding && " A small droplr.fm line sits under your link; Artist Pro and the label plans render it clean."}
            {" "}For a Story, switch the link to a sticker and droplr leaves the room for it.
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
          {/* No "use a computer" warning. Measured on an iPhone: a 30-second clip renders in 5-10
              seconds, because iOS has a hardware H.264 encoder and WebCodecs reaches it. The earlier
              copy here assumed phones fall back to real-time recording, which was left over from the
              prototype and was never true once this used WebCodecs. */}
          {mp4 === false ? (
            <p className="text-sm text-amber-400">
              This browser can&apos;t encode H.264, so the clip records in real time and comes out as WebM. It still uploads everywhere, but Instagram
              re-encodes it — Chrome, Edge or Safari 16.4+ on a computer give you an MP4 in a fraction of the time.
            </p>
          ) : null}
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
                <Button size="sm" variant="secondary" disabled={!ready} onClick={() => { if (playing) stop(); else void play(); }}>
                  {playing ? <><Square /> Stop</> : <><Play /> Play it</>}
                </Button>
                <span className="text-xs text-muted-foreground">Play shows exactly what renders — same analysis, same bars.</span>
              </div>

              <Choices
                label="Style"
                value={style}
                onChange={(v: ClipStyle) => {
                  // The renderer runs in the browser, so this is a door, not a lock: the gate is on the
                  // option, and the plan page is where it opens.
                  if (v === "type" && !props.typeStyle) { setTypeLockedNote(true); return; }
                  setTypeLockedNote(false);
                  setStyle(v);
                }}
                options={CLIP_STYLES.map((k) => ({ value: k, label: k === "type" && !props.typeStyle ? `${CLIP_STYLE_LABELS[k].name} · paid` : CLIP_STYLE_LABELS[k].name, hint: CLIP_STYLE_LABELS[k].hint }))}
              />
              <p className="-mt-2 text-xs text-muted-foreground">{CLIP_STYLE_LABELS[style].hint}</p>
              {typeLockedNote && (
                <p className="-mt-2 text-xs text-amber-400">
                  Type is on every paid plan. <a href="/admin/settings/billing" className="underline">See plans</a> — Waveform and Motion stay free.
                </p>
              )}
              {style === "type" && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  {!peaks
                    ? "The preview is cutting to a stand-in 128 BPM beat. Choose the track and it follows yours."
                    : gridInfo?.sure
                      ? `Cutting to your track: about ${Math.round(gridInfo.bpm)} BPM.`
                      : "Couldn't find a clear beat in this part of the track, so it cuts at 128 BPM from the first kick. Try a section with drums."}
                </p>
              )}
              {style === "motion" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choices label="Artwork comes in" value={entrance} onChange={(v: MotionEntrance) => setEntrance(v)} options={MOTION_ENTRANCES.map((k) => ({ value: k, label: MOTION_ENTRANCE_LABELS[k] }))} />
                  <Choices label="Ending" value={ending} onChange={(v: MotionEnding) => setEnding(v)} options={MOTION_ENDINGS.map((k) => ({ value: k, label: MOTION_ENDING_LABELS[k] }))} />
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    The picture fades in with the audio fade-in. Fade out, Fly out and Zoom out run over the audio fade-out, so set that to 1s or 2s for a slower exit.
                  </p>
                </div>
              )}
              <Choices label="Length" value={clipLen} onChange={setLength} options={CLIP_LENGTHS.map((n) => ({ value: n, label: `${n}s` }))} disabled={!ready} />
              <Choices
                label="Shape"
                value={aspect}
                onChange={(v: AspectKey) => { setAspect(v); }}
                options={(Object.keys(ASPECTS) as AspectKey[]).map((k) => ({ value: k, label: ASPECTS[k].label, hint: ASPECTS[k].hint }))}
              />
              {/* Only on a 9:16. There is no link sticker on a feed post, so offering it there
                  would just be an option that removes your link and gives nothing back. */}
              {aspect === "tall" && (
                <div className="space-y-1.5">
                  <Choices
                    label="The link"
                    value={linkMode}
                    onChange={(v: "printed" | "sticker") => setLinkMode(v)}
                    options={[
                      { value: "printed" as const, label: "Printed on it", hint: "Your link across the clip — for Reels, TikTok and Shorts, where you can't attach one" },
                      { value: "sticker" as const, label: "Room for a sticker", hint: "For Instagram Stories: the clip leaves a clear space and you drop the link sticker on it" },
                    ]}
                  />
                  {story && (
                    <p className="text-xs text-muted-foreground">
                      Post it to your Story, tap the sticker button, choose <strong className="text-foreground">Link</strong> and paste{" "}
                      <code className="text-foreground">{copyLink}</code>. Drop it in the space we&apos;ve left. The dashed box is only in this preview — it isn&apos;t in the video.
                    </p>
                  )}
                </div>
              )}
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
              {style === "type" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="clip-endline">End card</Label>
                  <Input id="clip-endline" value={endLine} maxLength={28} onChange={(e) => setEndLine(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="clip-headline">Headline</Label>
                  <Input id="clip-headline" value={headline} maxLength={24} onChange={(e) => setHeadline(e.target.value)} />
                </div>
              )}
              {style === "type" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="clip-words">Words, one per line</Label>
                  <textarea
                    id="clip-words"
                    value={typeText}
                    rows={4}
                    maxLength={240}
                    placeholder={`${props.title}\n${props.artistName}`}
                    onChange={(e) => setTypeText(e.target.value)}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Up to 8 lines, flashed one per cut. A hook from the vocal works best. Empty, it uses the title and your name.
                    {props.live ? "" : ` The end card says ${endDefault} — change it if you like.`}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="clip-tagline">Line underneath</Label>
                <Input id="clip-tagline" value={tagline} maxLength={60} onChange={(e) => setTagline(e.target.value)} />
              </div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                {copy.link
                  ? <>Link on the clip: <code className="text-foreground">{copy.link}</code></>
                  : <>No link printed on this one — you&apos;ll add it as a sticker. It&apos;s <code className="text-foreground">{copyLink}</code>.</>}
              </p>
            </CardContent>
          </Card>

          {style === "type" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Type</CardTitle>
                <CardDescription>The font, the colours and how hard it cuts. The two colours swap places on every cut.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Font</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TYPE_FONTS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={typeFont === f.id}
                        title={f.hint}
                        onClick={() => setTypeFont(f.id)}
                        onMouseEnter={() => { void loadTypeFont(f.id).then((ok) => ok && setFontsLoaded((l) => ({ ...l, [f.id]: true }))); }}
                        className={cn(
                          "truncate rounded-md border px-3 py-2 text-left text-lg leading-tight transition",
                          typeFont === f.id ? "border-violet-500/60 bg-violet-500/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        style={{ fontFamily: fontsLoaded[f.id] ? typeFontStack(f.id) : undefined }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
                <Choices
                  label="Colours"
                  value={typePaletteId}
                  onChange={(v: TypePaletteId) => { setTypePaletteId(v); setTypeOverrides({}); }}
                  options={TYPE_PALETTES.map((p) => ({ value: p.id, label: p.name }))}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <ColourPick id="type-a" label="Colour 1" value={typeColours.a} changed={!!typeOverrides.a} onChange={(c) => setTypeOverrides((o) => ({ ...o, a: c ?? undefined }))} />
                  <ColourPick id="type-b" label="Colour 2" value={typeColours.b} changed={!!typeOverrides.b} onChange={(c) => setTypeOverrides((o) => ({ ...o, b: c ?? undefined }))} />
                  <ColourPick id="type-pop" label="Pop" value={typeColours.pop} changed={!!typeOverrides.pop} onChange={(c) => setTypeOverrides((o) => ({ ...o, pop: c ?? undefined }))} />
                </div>
                {typeColourNotes.map((w) => <p key={w} className="text-sm text-amber-400">{w}</p>)}
                <p className="-mt-2 text-xs text-muted-foreground">Pop goes on the glitch, the progress bar and the link over the loops.</p>
                <Choices label="Cut" value={typeCut} onChange={(v: TypeCut) => setTypeCut(v)} options={TYPE_CUTS.map((n) => ({ value: n, label: TYPE_CUT_LABELS[n] }))} />
                <Choices label="Texture" value={typeBg} onChange={(v: TypeBackground) => setTypeBg(v)} options={TYPE_BACKGROUNDS.map((b) => ({ value: b, label: TYPE_BACKGROUND_LABELS[b] }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choices label="Tunnel and spiral breaks" value={typeLoops ? "on" : "off"} onChange={(v: string) => setTypeLoops(v === "on")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
                  <Choices label="Glitch on the kick" value={typeGlitch ? "on" : "off"} onChange={(v: string) => setTypeGlitch(v === "on")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {props.logoSrc ? "Your logo slams in on the drop, and the artwork shows once before it." : "The artwork slams in on the drop. Add a logo in Settings and it takes the drop instead."}
                  {" "}However fast the track, the colours never swap more than three times a second — faster flashing is a seizure risk.
                </p>
              </CardContent>
            </Card>
          )}

          {style !== "type" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Colours</CardTitle>
              <CardDescription>Start from a look, then change the background, spectrum, text or glow to match your artwork or brand. The glow starts as the colour from your artwork.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Choices
                label="Look"
                value={look}
                onChange={(v: ClipLookId) => { setLook(v); setOverrides({}); }}
                options={CLIP_LOOKS.map((l) => ({ value: l.id, label: l.name, hint: l.blurb }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <ColourPick id="clip-bg" label="Background" value={palette.bg} changed={!!overrides.background} onChange={(c) => setOverrides((o) => ({ ...o, background: c }))} />
                <ColourPick id="clip-spectrum" label={style === "motion" ? "Accent" : "Spectrum"} value={palette.spectrumFrom} changed={!!overrides.spectrum} onChange={(c) => setOverrides((o) => ({ ...o, spectrum: c }))} />
                <ColourPick id="clip-text" label="Text" value={palette.text} changed={!!overrides.text} onChange={(c) => setOverrides((o) => ({ ...o, text: c }))} />
                {palette.glow ? (
                  <ColourPick id="clip-glow" label="Glow" value={palette.glow} changed={!!overrides.glow} onChange={(c) => setOverrides((o) => ({ ...o, glow: c }))} />
                ) : (
                  <p className="self-end text-xs text-muted-foreground">Mono has no glow. Pick Glow or Light to colour it.</p>
                )}
              </div>
              {colourWarnings.map((w) => <p key={w} className="text-sm text-amber-400">{w}</p>)}
              <p className="text-xs text-muted-foreground">
                {style === "motion"
                  ? "The accent colour goes on your link card and the progress bar, unless it would be hard to read — then the link uses your text colour."
                  : "The spectrum colour also goes on your link and the progress bar, unless it would be hard to read — then the link uses your text colour."}
              </p>
            </CardContent>
          </Card>
          )}
        </div>

        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>{size.width}×{size.height} · {clipLen}s · {fadeSummary(fadeIn, fadeOut)}{story && " · link sticker"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/*
              The canvas stays mounted for the life of the panel and the finished video is laid over
              it, rather than the two swapping places.

              Swapping is what broke "Render again". render() reads frameRef.current, and a canvas
              inside the false branch of a ternary unmounts the moment a result exists — so after one
              successful render the ref was null, render() hit its early return, and the button did
              nothing at all. Leaving the tab and coming back remounted the panel at phase "idle",
              which is why that looked like the only way to get a second clip.
            */}
            <div className="relative mx-auto overflow-hidden rounded-lg ring-1 ring-white/10" style={{ aspectRatio: size.ratio, maxWidth: aspect === "tall" ? 260 : 340 }}>
              <canvas ref={frameRef} className="h-full w-full" />
              {result && downloadUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={downloadUrl} controls playsInline className="absolute inset-0 h-full w-full bg-black" />
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

            {result?.diagnostics.audio.state === "silent" && (
              <p className="rounded-lg border border-red-500/40 bg-red-500/5 p-2 text-sm text-red-300">
                <strong>This clip has no sound.</strong> We decoded it and measured silence — don&apos;t post it. Chrome or Edge on a computer will
                render it with audio. Tell us if that doesn&apos;t fix it.
              </p>
            )}
            {result?.diagnostics.audio.state === "unknown" && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-300">
                <strong>Play it before you post it.</strong> This browser wouldn&apos;t let us check the sound on the finished file, so we can&apos;t
                promise it has any. Press play above with the volume up.
              </p>
            )}
            {result && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  {result.how} · {(result.blob.size / 1048576).toFixed(1)} MB · rendered in {result.seconds.toFixed(1)}s.
                  {result.ext === "webm" && " WebM uploads to Instagram but re-encodes; an MP4 from Chrome or Edge posts cleaner."}
                </p>
                {/* Only when something is actually wrong with the sound. Every browser encodes this
                    differently and the last bug here was invisible from the outside — one line a
                    person can read out was worth more than any amount of guessing from afar. When
                    the clip is fine, none of it belongs on the artist's screen. */}
                {result.diagnostics.audio.state !== "audible" && (
                  <details>
                    <summary className="cursor-pointer select-none">If you report this, copy this line</summary>
                    <code className="mt-1 block break-all rounded bg-black/30 p-2 leading-relaxed">
                      path={result.diagnostics.path} video={result.diagnostics.videoCodec ?? "—"} audio={result.diagnostics.audioCodec ?? "—"}{" "}
                      layout={result.diagnostics.audioLayout ?? "—"} chunks={result.diagnostics.audioChunks ?? "—"}{" "}
                      {result.diagnostics.audioBytes !== null && (
                        <>bytes={Math.round(result.diagnostics.audioBytes / 1024)}KB avg=
                          {result.diagnostics.audioChunks ? Math.round(result.diagnostics.audioBytes / result.diagnostics.audioChunks) : 0}B{" "}
                        </>
                      )}
                      {result.diagnostics.audioConfig && <>cfg=[{result.diagnostics.audioConfig}]{" "}</>}
                      {result.diagnostics.sampleRate}Hz×{result.diagnostics.channels} sound={result.diagnostics.audio.state}
                      {result.diagnostics.audio.peak !== null && ` peak=${result.diagnostics.audio.peak}`}
                      {result.diagnostics.audio.why && ` (${result.diagnostics.audio.why})`}
                    </code>
                  </details>
                )}
              </div>
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
            <p className="text-xs text-muted-foreground">Rendering happens on this device. A 30-second clip takes seconds on a laptop and on a recent phone; older hardware and very long tracks take longer.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * One colour override. Shows the colour actually in use (the look's own until it's changed), and a
 * reset that only appears once there is something to reset.
 */
function ColourPick({ id, label, value, changed, onChange }: { id: string; label: string; value: string; changed: boolean; onChange: (c: string | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1" />
        <code className="text-xs text-muted-foreground">{value}</code>
        {changed && (
          <button type="button" onClick={() => onChange(null)} className="ml-auto text-xs text-muted-foreground underline hover:text-foreground">
            Reset
          </button>
        )}
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
