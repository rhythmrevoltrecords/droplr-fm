"use client";
/**
 * Lyrics, timed once: paste the words, play the track, tap as each line starts.
 *
 * Lives in the clip panel because timing needs the track, and the clip panel is where the track is
 * already loaded. Like the clip, the audio never leaves this browser: what is saved is the words,
 * the time each line starts, and the length of the file they were timed to (see lib/lyrics).
 *
 * Two modes rather than one, on purpose. Editing the words and timing them in the same box means
 * every keystroke re-matches the times, and a typo mid-word throws a line's time away. So the words
 * are edited as text, and the times are carried over (carryTimes) once, when the artist goes back to
 * timing.
 */
import { Download, Pause, Play, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import {
  carryTimes, LYRIC_LINE_MAX, LYRICS_MAX_LINES, lrcFileName, lyricsText, lyricTime, nudgeLine, parseLyricsText, stampLine, toLrc,
  trackMismatch, type LyricLine,
} from "@/lib/lyrics";
import { mmss } from "@/lib/clip";
import { cn } from "@/lib/utils";

export type LyricsCardProps = {
  releaseId: string;
  slug: string;
  title: string;
  artistName: string;
  /** What's saved on the release. */
  lines: LyricLine[];
  trackMs: number | null;
  /** False on the artist-side clip pages: the label's release stays the label's to edit. */
  editable: boolean;
  /** The decoded track, if one is loaded in the clip panel. */
  getBuffer: () => AudioBuffer | null;
  /** Its length in ms, or null when nothing is loaded. Drives the mismatch check. */
  loadedMs: number | null;
  /** Stops the clip preview so two things never play at once. */
  stopOthers: () => void;
  /** Hands the saved result back to the clip panel. */
  onSaved: (lines: LyricLine[], trackMs: number | null) => void;
  /** The clip's window, so the lines in it can be marked. */
  clipStart: number;
  clipLen: number;
  /** Changes whenever the clip preview starts playing, so the two never play over each other. */
  playToken: number;
};

/** Where tapping resumes: the first untimed line, or past the end when every line has a time. */
const firstUntimed = (lines: LyricLine[]) => { const i = lines.findIndex((l) => l.ms === null); return i === -1 ? lines.length : i; };
const same = (a: LyricLine[], b: LyricLine[]) => a.length === b.length && a.every((l, i) => l.text === b[i].text && l.ms === b[i].ms);

export function LyricsCard(props: LyricsCardProps) {
  const [draft, setDraft] = useState<LyricLine[]>(props.lines);
  const [mode, setMode] = useState<"words" | "timing">(props.lines.length ? "timing" : "words");
  const [text, setText] = useState(lyricsText(props.lines));
  const [cursor, setCursor] = useState(() => firstUntimed(props.lines));
  const [playing, setPlaying] = useState(false);
  // Playing to tap, as opposed to playing to listen. Only "Play and tap" arms the Tap button and
  // Space; "Hear" a line never does, or a reflex Space would retime line 1 to wherever you are.
  const [tapping, setTapping] = useState(false);
  // The length of the file the current times were tapped against. Starts as the saved length; a
  // different file loaded later doesn't change it, only clearing the times and tapping again does.
  // Saving the loaded file's length instead is what would silently switch off the mismatch warning.
  const [timedTo, setTimedTo] = useState<number | null>(props.trackMs);
  const [pos, setPos] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const clockRef = useRef<{ startAt: number; offset: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  // The tap reads the cursor from a ref: two taps inside one render must stamp two lines, not one twice.
  const cursorRef = useRef(cursor);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  const dirty = !same(draft, props.lines) || (mode === "words" && text !== lyricsText(draft));
  const timed = draft.filter((l) => l.ms !== null).length;
  // Only while something is timed: once the times are cleared there is nothing for the file to disagree with.
  const mismatch = timed > 0 && trackMismatch(timedTo, props.loadedMs) === true;
  /** The length these times belong to: what they were tapped against, else the file loaded now. */
  const lengthOfTimes = timedTo ?? props.loadedMs;
  const hasTrack = props.loadedMs !== null;
  const winA = props.clipStart * 1000, winB = (props.clipStart + props.clipLen) * 1000;

  /** Seconds into the track that the listener is hearing right now. */
  const heard = useCallback(() => {
    const ctx = ctxRef.current, c = clockRef.current;
    if (!ctx || !c) return 0;
    // outputLatency is how far behind currentTime the speaker is. A tap is made on what was heard.
    const lag = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.max(0, ctx.currentTime - c.startAt + c.offset - lag);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { srcRef.current?.stop(); } catch { /* already stopped */ }
    srcRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    clockRef.current = null;
    setPlaying(false);
    setTapping(false);
  }, []);

  useEffect(() => () => stop(), [stop]);
  // A new track invalidates whatever was playing.
  useEffect(() => { stop(); }, [props.loadedMs, props.playToken, stop]);

  async function playFrom(seconds: number, toTap = false) {
    const buf = props.getBuffer();
    if (!buf) return;
    stop();
    props.stopOthers();
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    ctxRef.current = ctx;
    // Phones hand back a suspended context; its clock doesn't move until resumed (see clip-forge).
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const offset = Math.max(0, Math.min(buf.duration - 0.05, seconds));
    const startAt = ctx.currentTime + 0.05;
    src.start(startAt, offset);
    src.onended = () => { if (srcRef.current === src) stop(); };
    srcRef.current = src;
    clockRef.current = { startAt, offset };
    setPlaying(true);
    setTapping(toTap);
    const tick = () => { setPos(heard()); rafRef.current = requestAnimationFrame(tick); };
    tick();
  }

  const tap = useCallback(() => {
    if (!clockRef.current) return;
    const ms = heard() * 1000;
    const c = cursorRef.current;
    cursorRef.current = c + 1;
    setDraft((d) => (c >= d.length ? d : stampLine(d, c, ms)));
    setCursor(c + 1);
    // The first tap against a file is what these times now belong to.
    setTimedTo((t) => t ?? props.loadedMs);
  }, [heard, props.loadedMs]);

  // Space taps while timing. Captured at the window so a focused button doesn't also get clicked.
  useEffect(() => {
    if (mode !== "timing" || !tapping) return;
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT");
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) tap();
    };
    // Browsers click a focused button on Space's keyup, not keydown, so that is swallowed too.
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e)) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
  }, [mode, tapping, tap]);

  // Keep the line being tapped in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const playingLine = useMemo(() => {
    if (!playing) return -1;
    const ms = pos * 1000;
    let cur = -1;
    draft.forEach((l, i) => { if (l.ms !== null && l.ms <= ms) cur = i; });
    return cur;
  }, [playing, pos, draft]);

  function toTiming() {
    const parsed = parseLyricsText(text);
    // A pasted .lrc brings its own times; plain words keep the times they already had.
    const next = parsed.some((l) => l.ms !== null) ? parsed : carryTimes(draft, parsed.map((l) => l.text));
    setDraft(next);
    setCursor(firstUntimed(next));
    setMode("timing");
    setNote(null);
  }

  function startTapping() {
    // A second before the line about to be tapped, or the start of the track.
    const before = draft.slice(0, cursor).reverse().find((l) => l.ms !== null)?.ms;
    void playFrom(typeof before === "number" ? Math.max(0, before / 1000 - 1) : 0, true);
  }

  function clearAll() {
    stop();
    setDraft((d) => d.map((l) => ({ ...l, ms: null })));
    setCursor(0);
    setTimedTo(null);
  }

  async function save() {
    stop();
    let lines = draft;
    if (mode === "words") {
      const parsed = parseLyricsText(text);
      lines = parsed.some((l) => l.ms !== null) ? parsed : carryTimes(draft, parsed.map((l) => l.text));
    }
    const anyTimed = lines.some((l) => l.ms !== null);
    // The length goes with the times. A newly timed set is timed to the loaded file; an edit of words
    // alone, with no track loaded, keeps the length it was timed to.
    const trackMs = !anyTimed ? null : lengthOfTimes;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/releases/${props.releaseId}/lyrics`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines, trackMs }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setNote({ kind: "error", text: body.error ?? "Couldn't save the lyrics. Try again." }); return; }
      setDraft(body.lines);
      setText(lyricsText(body.lines));
      props.onSaved(body.lines, body.trackMs);
      setTimedTo(body.trackMs);
      setNote({ kind: "ok", text: body.lines.length ? "Saved. Every clip of this release can use them now." : "Lyrics cleared." });
    } catch {
      setNote({ kind: "error", text: "Couldn't reach droplr. Check your connection and save again." });
    } finally {
      setSaving(false);
    }
  }

  function downloadLrc() {
    const blob = new Blob([toLrc(draft, { title: props.title, artist: props.artistName, trackMs: lengthOfTimes })], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lrcFileName(props.slug);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Lyrics</CardTitle>
        <CardDescription>
          {props.editable
            ? <>Paste the words, play the track, and tap as each line starts. Do it once: the Lyrics style uses them, Type can pick up the lines in your clip, and you can download them as an .lrc file. Only your words and when each line starts are saved — the track never leaves your computer.</>
            : <>Your label times the lyrics on their release. Once they have, the Lyrics style uses them here too.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mismatch && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-300">
            These lyrics were timed to a {mmss(timedTo! / 1000)} file, and the track loaded is {mmss(props.loadedMs! / 1000)}. That&apos;s a different
            master, so every line would land in the wrong place. Load the {mmss(timedTo! / 1000)} file{props.editable ? ", or clear the times and tap them again to this one" : ""}.
          </p>
        )}
        {props.editable && mode === "words" && (
          <div className="space-y-1.5">
            <Label htmlFor="lyrics-words">The words, one line per row</Label>
            <textarea
              id="lyrics-words"
              value={text}
              rows={10}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Paste your lyrics here.\nBlank lines are fine — they're left out.\nAn .lrc file works too, times and all."}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Up to {LYRICS_MAX_LINES} lines of {LYRIC_LINE_MAX} characters. Only put up words you have the right to publish — on a cover or a track you
              didn&apos;t write, they may not be yours.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={toTiming} disabled={!text.trim()}>Next: time them</Button>
              {dirty && <Button size="sm" variant="secondary" onClick={save} disabled={saving}><Save /> Save words</Button>}
            </div>
          </div>
        )}

        {(mode === "timing" || !props.editable) && (
          <>
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lyrics on this release yet.</p>
            ) : (
              <>
                {props.editable && (
                  <div className="space-y-2">
                    {!hasTrack ? (
                      <p className="text-sm text-muted-foreground">Choose the track above and you can tap the lines in.</p>
                    ) : mismatch ? (
                      <Button size="sm" variant="secondary" onClick={clearAll}><RotateCcw /> Clear the times and time them to this file</Button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {playing && tapping ? (
                          <>
                            <Button
                              size="lg"
                              onPointerDown={(e) => { e.preventDefault(); tap(); }}
                              disabled={cursor >= draft.length}
                              className="min-w-48"
                            >
                              {cursor >= draft.length ? "All lines tapped" : `Tap · line ${cursor + 1}`}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={stop}><Pause /> Stop</Button>
                            <span className="font-mono text-xs text-muted-foreground">{lyricTime(pos * 1000)}</span>
                          </>
                        ) : (
                          <>
                            <Button size="sm" onClick={startTapping} disabled={cursor >= draft.length}>
                              <Play /> {cursor >= draft.length ? "Every line is tapped" : cursor === 0 ? "Play and tap from the start" : `Play and tap from line ${cursor + 1}`}
                            </Button>
                            {playing && <Button size="sm" variant="secondary" onClick={stop}><Pause /> Stop listening</Button>}
                          </>
                        )}
                      </div>
                    )}
                    {hasTrack && !mismatch && (
                      <p className="text-xs text-muted-foreground">
                        Tap the button or press <kbd className="rounded border border-border px-1">Space</kbd> as each line starts. Late on one? Nudge it, or
                        pick &ldquo;from here&rdquo; and tap again.
                      </p>
                    )}
                  </div>
                )}
                <ol ref={listRef} className="max-h-96 space-y-0.5 overflow-y-auto rounded-lg bg-black/20 p-1.5 ring-1 ring-white/10">
                  {draft.map((l, i) => {
                    const inClip = l.ms !== null && l.ms >= winA && l.ms < winB;
                    return (
                      <li
                        key={i}
                        data-line={i}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                          playingLine === i && "bg-violet-500/15",
                          props.editable && mode === "timing" && cursor === i && "ring-1 ring-violet-500/60",
                        )}
                      >
                        <span className={cn("w-16 shrink-0 font-mono text-xs", l.ms === null ? "text-muted-foreground/60" : inClip ? "text-violet-300" : "text-muted-foreground")}>
                          {l.ms === null ? "—" : lyricTime(l.ms)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{l.text}</span>
                        {props.editable && mode === "timing" && (
                          <span className="flex shrink-0 items-center gap-1 text-xs">
                            {l.ms !== null && (
                              <>
                                <button type="button" aria-label={`Line ${i + 1} earlier`} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={() => setDraft((d) => nudgeLine(d, i, -50, lengthOfTimes))}>−</button>
                                <button type="button" aria-label={`Line ${i + 1} later`} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={() => setDraft((d) => nudgeLine(d, i, 50, lengthOfTimes))}>+</button>
                                {hasTrack && !mismatch && (
                                  <button type="button" aria-label={`Hear line ${i + 1}`} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={() => void playFrom(Math.max(0, l.ms! / 1000 - 1))}>
                                    <Play className="h-3 w-3" />
                                  </button>
                                )}
                              </>
                            )}
                            <button type="button" className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={() => { stop(); setCursor(i); }}>
                              from here
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-xs text-muted-foreground">
                  {timed} of {draft.length} lines timed{timed < draft.length ? " — untimed lines don't appear in clips" : ""}.
                  {timed > 0 && " Times in purple are in the part of the track your clip uses."}
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {props.editable && (
                <>
                  <Button size="sm" disabled={!dirty || saving} onClick={save}><Save /> {saving ? "Saving…" : "Save lyrics"}</Button>
                  <Button size="sm" variant="secondary" onClick={() => { stop(); setText(lyricsText(draft)); setMode("words"); }}>Edit the words</Button>
                </>
              )}
              {timed > 0 && (
                <Button size="sm" variant="ghost" onClick={downloadLrc}><Download /> Download .lrc</Button>
              )}
            </div>
          </>
        )}
        {note && <p className={cn("text-sm", note.kind === "ok" ? "text-emerald-400" : "text-red-300")}>{note.text}</p>}
      </CardContent>
    </Card>
  );
}
