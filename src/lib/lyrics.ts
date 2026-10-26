/**
 * A release's lyrics, timed once, used by every clip.
 *
 * The artist pastes the words and taps along to the track; each tap stamps the start of a line.
 * There is no speech-to-text and no lyrics service. A model good enough for sung vocals over a full
 * mix is a download of hundreds of megabytes and still gets it wrong, and a lyrics provider means a
 * licence and words droplr didn't get from the artist. Tapping is a minute's work, it is exact,
 * and the words are only ever the ones the artist typed.
 *
 * Times are milliseconds from the start of the file the artist timed against. That file is never
 * uploaded, so all droplr keeps of it is its length (`trackMs`). A clip made from a different file —
 * the radio edit, the extended mix — would put every line in the wrong place, and the length is the
 * only thing that can tell: see trackMismatch().
 *
 * Pure and client-safe. No database, no fetch, no React.
 */

export type LyricLine = { text: string; ms: number | null };

export const LYRICS_MAX_LINES = 300;
export const LYRIC_LINE_MAX = 150;
/** No release is an hour long; anything past this is a bad number, not a long track. */
export const LYRICS_MAX_TRACK_MS = 60 * 60 * 1000;
/**
 * How long a line stays up when the next one is far away. A line has a start and no end — tapping
 * the end of every line doubles the work and nobody would do it — so a line runs until the next
 * one starts, or this long, whichever is first. Long enough for a held note, short enough that a
 * verse line doesn't sit over a 30-second instrumental.
 */
export const LYRIC_LINE_HOLD_MS = 7000;
/** Two files whose lengths differ by more than this are not the same master. */
export const TRACK_MATCH_TOLERANCE_MS = 1000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** One line as it will be stored: no control or direction characters, single spaces, trimmed. */
export const cleanLine = (s: string) => s.replace(CONTROL, "").replace(/\s+/g, " ").trim();

const LRC_TAG = /^\s*\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const LRC_META = /^\s*\[[a-z]+:[^\]]*\]\s*$/i;
const LRC_OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i;
/** Enhanced LRC's per-word times, "<00:12.34>". droplr times lines, so they're dropped. */
const WORD_TAGS = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
/**
 * A row that is only a section label: "[Chorus]", "[Verse 2: Ototo]", "(x2)". Lyric sites put these
 * in, nobody sings them, and a clip that flashes "[Chorus]" looks broken.
 */
const SECTION_LABEL = /^\s*(\[[^\]]*\]|\((?:x\s*\d+|\d+\s*x|repeat[^)]*)\))\s*$/i;

/** "[01:02.34]" → 62340. Hundredths and milliseconds both appear in the wild. */
function lrcMs(m: RegExpMatchArray) {
  const frac = m[3] ? Number(m[3].padEnd(3, "0").slice(0, 3)) : 0;
  return (Number(m[1]) * 60 + Number(m[2])) * 1000 + frac;
}

/**
 * Pasted text → lines. Blank lines are verse breaks and are dropped: a break has nothing to time.
 *
 * If the paste is already an .lrc (Musixmatch and most lyric editors export one), the times come
 * with it, so an artist who has timed the song somewhere else doesn't do it twice. That is decided
 * per paste, not per line: a paste where most lines carry a tag is an LRC, and its untagged lines
 * stay untimed rather than having their brackets read as words.
 */
export function parseLyricsText(raw: string): LyricLine[] {
  const lines = raw.split(/\r?\n/);
  // LRC's offset: a positive offset makes every line come in earlier.
  const offsetRow = lines.find((r) => LRC_OFFSET.test(r));
  const offset = offsetRow ? Number(LRC_OFFSET.exec(offsetRow)![1]) : 0;
  const rows = lines.filter((r) => !LRC_META.test(r)).map((r) => r.replace(WORD_TAGS, ""));
  const filled = rows.filter((r) => cleanLine(r) && !SECTION_LABEL.test(r));
  const tagged = filled.filter((r) => LRC_TAG.test(r)).length;
  const lrc = filled.length > 0 && tagged / filled.length >= 0.5;
  const out: LyricLine[] = [];
  for (const row of filled) {
    if (lrc) {
      // A line can carry several tags (a chorus written once, sung three times). Each one is a line.
      const times: number[] = [];
      let rest = row;
      for (let m = rest.match(LRC_TAG); m; m = rest.match(LRC_TAG)) {
        times.push(Math.max(0, lrcMs(m) - offset));
        rest = rest.slice(m[0].length);
      }
      const text = cleanLine(rest).slice(0, LYRIC_LINE_MAX);
      if (!text) continue;
      if (!times.length) out.push({ text, ms: null });
      for (const ms of times) out.push({ text, ms });
    } else {
      out.push({ text: cleanLine(row).slice(0, LYRIC_LINE_MAX), ms: null });
    }
  }
  if (lrc) out.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  return out.slice(0, LYRICS_MAX_LINES);
}

/** The lines as the artist edits them: one per row, no times. */
export const lyricsText = (lines: LyricLine[]) => lines.map((l) => l.text).join("\n");

/**
 * Re-typing the words must not throw away the timing. Each new line takes the time of the old line
 * with the same words, in order, so fixing a typo loses one line's time and inserting a line
 * shifts nothing. Times that would now run backwards are dropped, not kept: a clip can't play
 * line 5 before line 4.
 */
export function carryTimes(old: LyricLine[], texts: string[]): LyricLine[] {
  const used = new Set<number>();
  let from = 0;
  let last = -1;
  return texts.map((text) => {
    let found = -1;
    for (let j = from; j < old.length; j++) {
      if (!used.has(j) && old[j].text === text) { found = j; break; }
    }
    if (found === -1) return { text, ms: null };
    used.add(found);
    from = found + 1;
    const ms = old[found].ms;
    if (ms === null || ms < last) return { text, ms: null };
    last = ms;
    return { text, ms };
  });
}

export type LyricsCheck = { ok: true; lines: LyricLine[] } | { ok: false; error: string };

/**
 * What the server stores, and the sentence the artist sees when it won't. Lines are cleaned here
 * too: the route is the only writer and the browser is not trusted to have done it.
 */
export function checkLyrics(input: { text: string; ms: number | null }[], trackMs: number | null): LyricsCheck {
  if (input.length > LYRICS_MAX_LINES) return { ok: false, error: `That's more than ${LYRICS_MAX_LINES} lines. Leave out the repeats you won't put in a clip.` };
  if (trackMs !== null && (!Number.isInteger(trackMs) || trackMs <= 0 || trackMs > LYRICS_MAX_TRACK_MS)) {
    return { ok: false, error: "That track length doesn't look right. Load the track again and re-save." };
  }
  const lines: LyricLine[] = [];
  let last = -1;
  for (let i = 0; i < input.length; i++) {
    const text = cleanLine(input[i].text);
    if (!text) continue;
    if (text.length > LYRIC_LINE_MAX) return { ok: false, error: `Line ${i + 1} is longer than ${LYRIC_LINE_MAX} characters. Split it in two.` };
    const ms = input[i].ms;
    if (ms !== null) {
      if (!Number.isInteger(ms) || ms < 0 || ms > (trackMs ?? LYRICS_MAX_TRACK_MS)) {
        return { ok: false, error: `Line ${i + 1} is timed past the end of the track. Clear its time and tap it again.` };
      }
      if (ms < last) return { ok: false, error: `Line ${i + 1} starts before the line above it. Nudge it or tap it again.` };
      last = ms;
    }
    lines.push({ text, ms });
  }
  if (lines.some((l) => l.ms !== null) && trackMs === null) {
    return { ok: false, error: "Timed lines need the track's length. Load the track and save again." };
  }
  return { ok: true, lines };
}

/** Reading the column back. Anything that isn't the shape stored is treated as no lyrics at all. */
export function lyricsOf(raw: unknown): LyricLine[] {
  if (!Array.isArray(raw)) return [];
  const out: LyricLine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { text, ms } = r as { text?: unknown; ms?: unknown };
    if (typeof text !== "string" || !text) continue;
    out.push({ text, ms: typeof ms === "number" && Number.isFinite(ms) ? ms : null });
  }
  return out.slice(0, LYRICS_MAX_LINES);
}

/**
 * Does the loaded file look like the one these lyrics were timed to? `null` is "I can't tell":
 * no track length was stored (nothing was timed) or nothing is loaded yet.
 */
export function trackMismatch(timedTrackMs: number | null, loadedMs: number | null): boolean | null {
  if (!timedTrackMs || !loadedMs) return null;
  return Math.abs(timedTrackMs - loadedMs) > TRACK_MATCH_TOLERANCE_MS;
}

/** When a line stops being shown: the next timed line, or the hold, whichever comes first. */
export function lineEnds(lines: LyricLine[]): (number | null)[] {
  return lines.map((l, i) => {
    if (l.ms === null) return null;
    const next = lines.slice(i + 1).find((n) => n.ms !== null && n.ms > l.ms!);
    return Math.min(l.ms + LYRIC_LINE_HOLD_MS, next?.ms ?? Infinity);
  });
}

export type WindowLine = { text: string; at: number; until: number };

/**
 * The lines a clip of [startS, startS + lenS) shows, in seconds from the start of the clip. A line
 * already being sung when the clip starts is included from 0, so a clip cut mid-line doesn't open
 * on a blank screen. Untimed lines can't be placed and are left out.
 */
export function linesInWindow(lines: LyricLine[], startS: number, lenS: number): WindowLine[] {
  const ends = lineEnds(lines);
  const a = startS * 1000, b = (startS + lenS) * 1000;
  const out: WindowLine[] = [];
  lines.forEach((l, i) => {
    const end = ends[i];
    if (l.ms === null || end === null) return;
    if (end <= a || l.ms >= b) return;
    out.push({ text: l.text, at: Math.max(0, (l.ms - a) / 1000), until: Math.min(lenS, (end - a) / 1000) });
  });
  return out;
}

/**
 * Move one line's time, never past its neighbours: the order the artist tapped is the order it's
 * sung, and nudging is for fixing a late tap, not for reordering.
 */
export function nudgeLine(lines: LyricLine[], i: number, deltaMs: number, trackMs: number | null): LyricLine[] {
  const l = lines[i];
  if (!l || l.ms === null) return lines;
  const before = lines.slice(0, i).reverse().find((x) => x.ms !== null)?.ms ?? 0;
  const after = lines.slice(i + 1).find((x) => x.ms !== null)?.ms ?? trackMs ?? LYRICS_MAX_TRACK_MS;
  const ms = Math.round(Math.max(before, Math.min(after, l.ms + deltaMs)));
  return lines.map((x, j) => (j === i ? { ...x, ms } : x));
}

/**
 * Stamp line i at `ms` and clear any later line now timed before it, so a re-tap can't reorder.
 * A tap earlier than the line above it (tapping again "from here" starts a second before that line)
 * lands on that line's time instead: two lines at once is fixable with a nudge, a line before the
 * one above it is refused by the server.
 */
export function stampLine(lines: LyricLine[], i: number, ms: number): LyricLine[] {
  const floor = lines.slice(0, i).reverse().find((x) => x.ms !== null)?.ms ?? 0;
  const t = Math.max(floor, Math.round(ms));
  return lines.map((x, j) => (j === i ? { ...x, ms: t } : j > i && x.ms !== null && x.ms < t ? { ...x, ms: null } : x));
}

/** "1:02.34" for the editor. */
export function lyricTime(ms: number) {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** "[01:02.34]", the LRC form. */
function lrcTag(ms: number) {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}]`;
}

/** Brackets in a title would end a metadata tag early. */
const meta = (s: string) => cleanLine(s).replace(/[[\]]/g, "");

/**
 * An .lrc file of the timed lines: the common format for synced lyrics. Untimed lines are left out
 * because LRC has no way to say "somewhere in here".
 */
export function toLrc(lines: LyricLine[], info: { title: string; artist: string; trackMs: number | null }) {
  const head = [`[ar:${meta(info.artist)}]`, `[ti:${meta(info.title)}]`];
  if (info.trackMs) {
    const s = Math.round(info.trackMs / 1000);
    head.push(`[length:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}]`);
  }
  const body = lines.filter((l) => l.ms !== null).map((l) => `${lrcTag(l.ms!)}${l.text}`);
  return [...head, ...body].join("\n") + "\n";
}

export const lrcFileName = (slug: string) => `${slug.replace(/[^a-z0-9-]/gi, "") || "lyrics"}.lrc`;
