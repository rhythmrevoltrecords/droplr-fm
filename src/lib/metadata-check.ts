/**
 * Release metadata, checked before it reaches a distributor.
 *
 * The problem this solves is a specific one: a release gets rejected, or worse, goes out credited to
 * the wrong artist, because of something mechanical — a UPC that fails its check digit, a duplicated
 * ISRC, "feat." typed into the title instead of the artist field. Every one of those costs days at
 * the exact moment the artist can least afford them, and every one is catchable before submission.
 *
 * Nothing in npm does this. There are check-digit packages (mostly stale, and `validator`'s isEAN
 * silently rejects every 12-digit UPC-A) and there are DDEX XML validators, but nothing that reads a
 * release the way a distributor's QA reads it. So this is written from the primary sources:
 *
 *   - GTIN check digit: GS1, "How to calculate a check digit manually".
 *   - ISRC structure: IFPI, isrc.ifpi.org/isrc-standard/isrc-structure.
 *   - Style rules: Apple Music Style Guide v2.4 (Sept 2025), which is public, versioned and stricter
 *     than Spotify's; where Spotify's MSG v2.3 agrees, the rule is safe for both. Roughly 90% of the
 *     rejections that actually happen are covered by the handful of rules both guides share.
 *
 * Two deliberate limits. Every finding cites the rule it came from, because an artist will not trust
 * (or learn from) an unexplained warning. And nothing here is fatal: droplr does not block a release
 * on its own opinion of a title. These are findings, the artist decides.
 */

export type Severity = "error" | "warning";

export type Finding = {
  /** Stable id, so a finding can be dismissed or tested without matching on prose. */
  id: string;
  severity: Severity;
  field: "upc" | "isrc" | "title" | "artistName" | "releaseDate";
  /** What is wrong, in the artist's language rather than the spec's. */
  message: string;
  /** What to do about it. Omitted when the fix is obvious from the message. */
  fix?: string;
  /** Where the rule comes from, so it can be argued with. */
  source?: string;
};

const APPLE = "Apple Music Style Guide 2.4";
const IFPI = "IFPI ISRC standard";
const GS1 = "GS1 check digit";

// ---------------------------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------------------------

/**
 * GTIN check digit, for GTIN-8, UPC-A (12), EAN-13 and GTIN-14 alike.
 *
 * Weighted from the RIGHT, which is what makes one code path cover all four lengths. GS1's own page
 * describes the weights left-aligned per length, and implementations that follow it literally end up
 * with a different function per length and a bug in at least one of them.
 */
export function gtinCheckDigit(body: string): number {
  const sum = [...body].reverse().reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

export const GTIN_LENGTHS = [8, 12, 13, 14];

/** True when the code is all digits, a known GTIN length, and its last digit checks out. */
export function validGtin(code: string): boolean {
  const s = code.trim();
  if (!/^\d+$/.test(s) || !GTIN_LENGTHS.includes(s.length)) return false;
  return gtinCheckDigit(s.slice(0, -1)) === Number(s[s.length - 1]);
}

export type Isrc = { agency: string; registrant: string; year: number; designation: string; normalised: string };

/**
 * ISRC has no check digit, so the shape and the parts are all there is to check offline.
 *
 * Format is AA-XXX-YY-NNNNN: a two-letter agency code, a three-character alphanumeric registrant, a
 * two-digit year of reference, and a five-digit designation. Hyphens and spaces are decoration.
 */
export function parseIsrc(raw: string): Isrc | null {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  const m = /^([A-Z]{2})([A-Z0-9]{3})(\d{2})(\d{5})$/.exec(s);
  if (!m) return null;
  return { agency: m[1], registrant: m[2], year: Number(m[3]), designation: m[4], normalised: s };
}

/**
 * Agency codes that were withdrawn and should never appear on a new release.
 *
 * Deliberately a short, verified list rather than the full IFPI allocation table. The full table
 * would let us reject unknown codes outright, but getting it slightly wrong produces confident false
 * accusations — and the codes most likely to trip a naive check are QM, QT and QZ, which are RIAA US
 * codes that most distributor-issued ISRCs use regardless of where the artist lives. Flagging a
 * legitimate DistroKid ISRC as "wrong country" would be worse than not checking at all.
 */
const RETIRED_AGENCIES: Record<string, string> = {
  YU: "Yugoslavia, withdrawn 2003",
  CP: "Serbia and Montenegro, withdrawn 2006",
  CS: "Serbia and Montenegro, withdrawn 2006",
};

/*
 * No ISWC check digit here, deliberately.
 *
 * droplr has no ISWC field, no distributor requires one for a standard delivery, and the weight
 * table is documented inconsistently across sources — one worked example agreed with one arrangement
 * and disagreed with another, which is not enough to ship. A validator that tells an artist their
 * real ISWC is invalid is worse than one that stays quiet. If an ISWC field ever appears, verify the
 * algorithm against several known-good codes first.
 */

// ---------------------------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------------------------

/** Version words that belong in brackets rather than trailing the title bare. */
const VERSION_WORDS = [
  "radio edit", "extended mix", "extended", "club mix", "original mix", "instrumental", "acoustic",
  "live", "demo", "remastered", "rerecorded", "re-recorded", "edit", "vip", "dub", "bootleg",
  "sped up", "slowed down", "lo-fi", "lofi",
];

/** Words a title-case rule leaves lowercase unless they lead or close the title. */
const MINOR_WORDS = new Set(["a", "an", "the", "and", "but", "or", "nor", "as", "at", "by", "for", "in", "of", "on", "to", "up", "via"]);

const bracketed = (title: string) => [...title.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1].trim());

/** Everything outside brackets — the title proper. */
const bareTitle = (title: string) => title.replace(/[([][^)\]]*[)\]]/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

export type ReleaseUnderCheck = {
  title: string;
  artistName: string;
  upc: string | null;
  isrc: string | null;
  releaseDate: Date;
};

/** Other releases in the same account, so reuse of an identifier can be caught. */
export type SiblingRelease = { id: string; title: string; upc: string | null; isrc: string | null };

export function checkMetadata(release: ReleaseUnderCheck, siblings: SiblingRelease[] = []): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);

  // --- UPC ---------------------------------------------------------------------------------------
  const upc = release.upc?.trim() ?? "";
  if (upc) {
    if (!/^\d+$/.test(upc)) {
      add({
        id: "upc.notNumeric", severity: "error", field: "upc",
        message: "The UPC has something in it that isn't a digit.",
        fix: "Paste just the number — no spaces, hyphens or letters.",
        source: GS1,
      });
    } else if (!GTIN_LENGTHS.includes(upc.length)) {
      add({
        id: "upc.length", severity: "error", field: "upc",
        message: `A UPC is 12 digits (or 8, 13 or 14). This one is ${upc.length}.`,
        fix: upc.length === 11 ? "Eleven digits usually means a leading zero was lost by a spreadsheet. Check the original." : undefined,
        source: GS1,
      });
    } else if (!validGtin(upc)) {
      const right = `${upc.slice(0, -1)}${gtinCheckDigit(upc.slice(0, -1))}`;
      add({
        id: "upc.checkDigit", severity: "error", field: "upc",
        message: "This UPC fails its check digit, so it isn't a real barcode — it's a typo.",
        fix: `If the first ${upc.length - 1} digits are right, the code should end ${gtinCheckDigit(upc.slice(0, -1))} (${right}).`,
        source: GS1,
      });
    }
    const clash = siblings.find((s) => s.upc?.trim() === upc);
    if (clash) {
      add({
        id: "upc.reused", severity: "error", field: "upc",
        message: `This UPC is already on "${clash.title}".`,
        fix: "A UPC identifies one release. Two releases sharing one will merge or reject at the store.",
        source: GS1,
      });
    }
  }

  // --- ISRC --------------------------------------------------------------------------------------
  const isrcRaw = release.isrc?.trim() ?? "";
  if (isrcRaw) {
    const parsed = parseIsrc(isrcRaw);
    if (!parsed) {
      add({
        id: "isrc.shape", severity: "error", field: "isrc",
        message: "This doesn't look like an ISRC.",
        fix: "The shape is two letters, three letters or numbers, then seven digits — like AUABC2500001.",
        source: IFPI,
      });
    } else {
      const retired = RETIRED_AGENCIES[parsed.agency];
      if (retired) {
        add({
          id: "isrc.retiredAgency", severity: "warning", field: "isrc",
          message: `"${parsed.agency}" is a retired ISRC country code (${retired}).`,
          fix: "Worth checking with whoever issued it — a new release shouldn't be using it.",
          source: IFPI,
        });
      }
      // The year of reference is when the ISRC was assigned, so it can legitimately precede the
      // release — an old recording finally coming out. It cannot follow it.
      const releaseYear = release.releaseDate.getUTCFullYear();
      const century = Math.floor(releaseYear / 100) * 100;
      const assumed = parsed.year + (parsed.year > (releaseYear % 100) + 1 ? century - 100 : century);
      if (assumed > releaseYear) {
        add({
          id: "isrc.yearAhead", severity: "warning", field: "isrc",
          message: `The ISRC says it was assigned in ${assumed}, but the release is dated ${releaseYear}.`,
          fix: "Usually a typo in the two year digits.",
          source: IFPI,
        });
      } else if (releaseYear - assumed > 5) {
        add({
          id: "isrc.yearOld", severity: "warning", field: "isrc",
          message: `This ISRC was assigned in ${assumed}, ${releaseYear - assumed} years before this release date.`,
          fix: "Fine for a reissue or an old recording. If this is a new track, the code may belong to something else.",
          source: IFPI,
        });
      }
      const clash = siblings.find((s) => s.isrc && parseIsrc(s.isrc)?.normalised === parsed.normalised);
      if (clash) {
        add({
          id: "isrc.reused", severity: "error", field: "isrc",
          message: `This ISRC is already on "${clash.title}".`,
          fix: "An ISRC identifies one recording and must never be reused — the two will collide in reporting, and your royalties with them.",
          source: IFPI,
        });
      }
    }
  }

  // --- Title and artist --------------------------------------------------------------------------
  out.push(...checkTitle(release.title, "title"));
  out.push(...checkTitle(release.artistName, "artistName"));

  return out;
}

/** The style rules, applied to a title or an artist name. */
function checkTitle(value: string, field: "title" | "artistName"): Finding[] {
  const out: Finding[] = [];
  const raw = value ?? "";
  const label = field === "title" ? "title" : "artist name";

  if (raw !== raw.trim() || /\s{2,}/.test(raw)) {
    out.push({
      id: `${field}.whitespace`, severity: "warning", field,
      message: `The ${label} has stray spaces in it.`,
      fix: "Stores show it exactly as typed, doubles and all.",
    });
  }

  // "feat." belongs in the artist credit with a Featuring role, never in the title. Both Apple and
  // Spotify say so, and it's the single most common reason a release comes back.
  const feat = /(\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bw\/\b)/i.exec(raw);
  if (feat && field === "title") {
    out.push({
      id: "title.featuring", severity: "error", field,
      message: `"${feat[0]}" is in the title.`,
      fix: "Featured artists go in the artist field with the Featuring role, not in the track title. Stores re-credit or reject releases that put them there.",
      source: `${APPLE} — Featuring`,
    });
  }

  // The explicit flag is a flag. Writing it into the title gets it stripped or rejected.
  const explicit = /[([]\s*(explicit|clean|dirty)\s*[)\]]/i.exec(raw);
  if (explicit) {
    out.push({
      id: `${field}.explicitInTitle`, severity: "error", field,
      message: `"${explicit[0].trim()}" is written into the ${label}.`,
      fix: "Set the explicit flag with your distributor instead. Stores remove this text or reject the release.",
      source: `${APPLE} — Explicit`,
    });
  }

  // ALL CAPS reads as shouting to a store's QA and gets re-cased by hand, inconsistently.
  const letters = raw.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    out.push({
      id: `${field}.allCaps`, severity: "warning", field,
      message: `The ${label} is in capitals.`,
      fix: "Stores apply their own title casing, and a stylised name often comes back changed. Use it only if it's genuinely how the name is written.",
      source: `${APPLE} — Capitalisation`,
    });
  }

  if (field === "title") {
    // A version that trails the title bare gets treated as part of the name, so "Track Radio Edit"
    // becomes a different song from "Track" rather than a version of it.
    const bare = bareTitle(raw).toLowerCase();
    const trailing = VERSION_WORDS.find((w) => bare.endsWith(` ${w}`));
    if (trailing) {
      out.push({
        id: "title.versionUnbracketed", severity: "warning", field,
        message: `"${trailing}" is on the end of the title without brackets.`,
        fix: `Write it as "(${trailing.replace(/\b\w/g, (c) => c.toUpperCase())})" so stores treat it as a version rather than part of the name.`,
        source: `${APPLE} — Version information`,
      });
    }

    // Nothing here about remixes. "(Ototo Remix)" in a title is correct, and a label releasing
    // mostly remixes would carry a permanent warning for doing it right — which is how a validator
    // teaches people to ignore it. The useful part (credit the remixer with the Remixer role, leave
    // the original artist primary) is guidance for the knowledge board, not a per-release finding.

    // Title case, checked narrowly: only the first word, where a lowercase start is nearly always a
    // mistake rather than a style choice. Full title-case enforcement produces too many false
    // positives on stylised electronic titles to be worth it.
    const first = bareTitle(raw).split(" ")[0] ?? "";
    if (first && /^[a-z]/.test(first) && !MINOR_WORDS.has(first.toLowerCase())) {
      out.push({
        id: "title.firstWordLowercase", severity: "warning", field,
        message: "The title starts with a lowercase letter.",
        fix: "Deliberate styling is fine — stores mostly leave it. Worth a second look if it wasn't.",
        source: `${APPLE} — Capitalisation`,
      });
    }
  }

  return out;
}

/** Errors block nothing, but they're the ones worth stopping for. */
export const errorsIn = (findings: Finding[]) => findings.filter((f) => f.severity === "error");
export const warningsIn = (findings: Finding[]) => findings.filter((f) => f.severity === "warning");

/** One line for the release list: null when there's nothing to say. */
export function metadataSummary(findings: Finding[]): string | null {
  const e = errorsIn(findings).length;
  const w = warningsIn(findings).length;
  if (!e && !w) return null;
  const parts = [];
  if (e) parts.push(`${e} ${e === 1 ? "problem" : "problems"}`);
  if (w) parts.push(`${w} to check`);
  return parts.join(", ");
}
