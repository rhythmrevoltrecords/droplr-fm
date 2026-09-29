/**
 * Remix contests: the return leg of a stems pack.
 *
 * A download gate sends stems out. This brings finished remixes back. Same Release record, third
 * front door — no new routing, no new tenant resolution, no second idea of what a release is.
 *
 * **droplr never holds the audio.** An entrant pastes a link to their own upload and droplr stores
 * the URL, the contact, the declaration they ticked and the timestamp. That is not caution for its
 * own sake: Australia has no copyright safe harbour for commercial content hosts. The 2018
 * amendments extended the scheme to carriage service providers, libraries, archives, educational
 * institutions and disability organisations, and left content hosts out on purpose. A US competitor
 * shipping remix uploads sits behind DMCA §512(c); droplr gets no equivalent, and exposure would run
 * through authorisation liability instead. So the file stays where the entrant put it, and droplr
 * holds a record of what was submitted and by whom.
 *
 * Everything here is pure. The state machine, the link rules and the duplicate test are the parts
 * that decide whether an entry counts, so they are the parts a test suite has to be able to reach
 * without a database.
 */

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

/**
 * draft   — the label is still writing it. Nothing public, no URL to find.
 * waiting — published, opens later. Shown, with the date, so people can plan.
 * open    — taking entries.
 * judging — closed to entries, no winner announced. This state exists because the alternative is
 *           a page that says "closed" and nothing else, and every entrant then emails the label to
 *           ask what happened.
 * done    — a winner is announced.
 */
export type ContestState = "draft" | "waiting" | "open" | "judging" | "done";

export type ContestWindow = {
  published: boolean;
  opensAt: Date | null;
  closesAt: Date;
  winnerAnnouncedAt: Date | null;
};

export function contestState(c: ContestWindow, now = new Date()): ContestState {
  if (!c.published) return "draft";
  if (c.winnerAnnouncedAt && c.winnerAnnouncedAt <= now) return "done";
  if (c.opensAt && c.opensAt > now) return "waiting";
  if (c.closesAt <= now) return "judging";
  return "open";
}

export const acceptingEntries = (c: ContestWindow, now = new Date()) => contestState(c, now) === "open";

/**
 * Closing time is the label's own moment, in its own timezone, like releaseDate. A deadline that
 * silently means UTC is how a Brisbane label ends up closing a contest at 10am local.
 */
export function closingMessage(c: ContestWindow, now = new Date()): string {
  const state = contestState(c, now);
  if (state === "waiting") return "Not open yet.";
  if (state === "judging") return "Entries are closed. The winner hasn't been announced yet.";
  if (state === "done") return "This one's finished.";
  const ms = c.closesAt.getTime() - now.getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Closing within the hour.";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left.`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left.`;
}

// ---------------------------------------------------------------------------
// Where an entry is allowed to live
// ---------------------------------------------------------------------------

/**
 * Hosts droplr recognises, and what it knows about each one.
 *
 * `expires` is the one that earns its place. A WeTransfer link dies after seven days; contest
 * windows are usually longer than that, so an entry submitted on day one is a dead link by
 * judging day — and the entrant is never told, because nobody checks until it matters. Flagging it
 * at submission is worth more to an entrant than any other validation in this file.
 *
 * `needsSharing` is second: a Google Drive or OneDrive link set to "restricted" opens for the
 * person who made it and nobody else, which is why the uploader never notices. It is the most
 * common reason a real entry can't be judged.
 */
type HostRule = {
  key: string;
  label: string;
  match: RegExp;
  /** Transfer services that delete the file after a fixed window. */
  expires?: { days: number };
  /** Cloud drives where the default permission is private. */
  needsSharing?: boolean;
  /** Streams in a browser without a download — the nicest thing to receive. */
  streams?: boolean;
};

const HOSTS: HostRule[] = [
  { key: "soundcloud", label: "SoundCloud", match: /(^|\.)soundcloud\.com$/i, streams: true },
  { key: "youtube", label: "YouTube", match: /(^|\.)(youtube\.com|youtu\.be)$/i, streams: true },
  { key: "bandcamp", label: "Bandcamp", match: /(^|\.)bandcamp\.com$/i, streams: true },
  { key: "audius", label: "Audius", match: /(^|\.)audius\.co$/i, streams: true },
  { key: "hearthis", label: "hearthis.at", match: /(^|\.)hearthis\.at$/i, streams: true },
  { key: "drive", label: "Google Drive", match: /(^|\.)(drive|docs)\.google\.com$/i, needsSharing: true },
  { key: "dropbox", label: "Dropbox", match: /(^|\.)dropbox\.com$/i },
  { key: "onedrive", label: "OneDrive", match: /(^|\.)(onedrive\.live\.com|1drv\.ms)$/i, needsSharing: true },
  { key: "icloud", label: "iCloud", match: /(^|\.)icloud\.com$/i, needsSharing: true },
  { key: "mega", label: "MEGA", match: /(^|\.)mega(\.co)?\.nz$/i },
  { key: "wetransfer", label: "WeTransfer", match: /(^|\.)we(transfer\.com|\.tl)$/i, expires: { days: 7 } },
  { key: "swisstransfer", label: "SwissTransfer", match: /(^|\.)swisstransfer\.com$/i, expires: { days: 30 } },
  { key: "filemail", label: "Filemail", match: /(^|\.)filemail\.com$/i, expires: { days: 7 } },
  { key: "smash", label: "Smash", match: /(^|\.)fromsmash\.com$/i, expires: { days: 7 } },
  { key: "toffeeshare", label: "ToffeeShare", match: /(^|\.)toffeeshare\.com$/i, expires: { days: 1 } },
];

export const hostRuleFor = (hostname: string) => HOSTS.find((h) => h.match.test(hostname)) ?? null;

/** Proper name for a stored host key ("drive" → "Google Drive"), for anything a person reads. */
export const hostLabelFor = (key: string | null | undefined) =>
  (key ? HOSTS.find((h) => h.key === key)?.label : null) ?? null;

export type EntryLink = {
  /** Stored form: lower-case host, tracking parameters gone, no trailing slash. */
  normalised: string;
  hostname: string;
  /** Recognised host key, or null for somewhere droplr has never heard of. Not an error. */
  host: string | null;
  hostLabel: string | null;
  streams: boolean;
};

export type EntryLinkResult =
  | { ok: false; error: string }
  | { ok: true; link: EntryLink; warnings: EntryWarning[] };

export type EntryWarning = { id: string; message: string };

/**
 * Parameters that identify a campaign rather than a track. Stripping them is what makes duplicate
 * detection work: the same SoundCloud link shared from the app and from the website differs only
 * by these, and without this an entrant can submit the same remix five times by accident.
 */
const JUNK_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "fbclid", "gclid", "igshid", "si", "ref", "ref_src", "referrer", "share_source",
  "_branch_match_id", "in", "feature", "app",
];

export function normaliseEntryUrl(raw: string): { url: URL; normalised: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  for (const p of JUNK_PARAMS) u.searchParams.delete(p);
  // Sorted so ?a=1&b=2 and ?b=2&a=1 are one link.
  u.searchParams.sort();
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  out = out.replace(/\?$/, "");
  return { url: u, normalised: out };
}

/**
 * Judge a pasted entry link.
 *
 * Refusals are kept to things that are certainly wrong — not a URL, not http(s), pointed back at
 * droplr, or a bare domain with no path (someone pasting "soundcloud.com" instead of their track).
 * Everything else that looks risky comes back as a warning the entrant sees and can act on, because
 * an unknown host is usually an artist's own website, and rejecting those would be droplr deciding
 * which services independent artists are allowed to use.
 */
export function checkEntryLink(raw: string, opts: { closesAt?: Date; now?: Date } = {}): EntryLinkResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste the link to your remix." };

  const parsed = normaliseEntryUrl(trimmed);
  if (!parsed) {
    return { ok: false, error: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }
  const { url, normalised } = parsed;

  if (/(^|\.)droplr\.fm$/i.test(url.hostname)) {
    return { ok: false, error: "That's a droplr link. Paste the link to where your remix is — SoundCloud, Drive, Dropbox." };
  }
  if (/^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname) || /\.local$/i.test(url.hostname)) {
    return { ok: false, error: "That link only works on your own computer. Upload it somewhere the label can open." };
  }
  if (!url.hostname.includes(".")) {
    return { ok: false, error: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }

  const rule = hostRuleFor(url.hostname);

  // A bare domain is never a track. Catching it here saves the label opening a homepage.
  const bare = url.pathname === "/" || url.pathname === "";
  if (bare && !url.search) {
    return {
      ok: false,
      error: rule
        ? `That's just ${rule.label}'s homepage. Open your remix there and copy the link to the track itself.`
        : "That's a homepage, not a track. Copy the link that opens your remix.",
    };
  }

  const warnings: EntryWarning[] = [];
  const now = opts.now ?? new Date();

  if (rule?.expires) {
    const dies = new Date(now.getTime() + rule.expires.days * 86_400_000);
    const past = opts.closesAt && dies < opts.closesAt;
    warnings.push({
      id: "link.expires",
      message: past
        ? `${rule.label} links stop working after ${rule.expires.days} days — this one will be dead before entries close, and the label won't be able to hear it. Upload to SoundCloud or Drive instead.`
        : `${rule.label} links stop working after ${rule.expires.days} days. Something permanent is safer.`,
    });
  }
  if (rule?.needsSharing) {
    warnings.push({
      id: "link.sharing",
      message: `Check the sharing on this: ${rule.label} files are private by default, so it opens for you and nobody else. Set it to anyone with the link.`,
    });
  }
  if (!rule) {
    warnings.push({
      id: "link.unknown",
      message: "droplr doesn't know this host. Open the link in a private window first and make sure it plays without a login.",
    });
  }

  return {
    ok: true,
    warnings,
    link: {
      normalised,
      hostname: url.hostname,
      host: rule?.key ?? null,
      hostLabel: rule?.label ?? null,
      streams: rule?.streams ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// The declaration
// ---------------------------------------------------------------------------

/**
 * What the entrant ticks, stored verbatim with a version.
 *
 * Verbatim and versioned because the whole point is being able to say, later, exactly what this
 * person agreed to on the day they entered. A foreign key to whatever the current wording happens
 * to be would quietly rewrite history the next time the text is improved.
 */
export const DECLARATION_VERSION = 2;

export const DECLARATION_TEXT =
  "This remix is my own work. I made it from the stems the label provided, I haven't used any sample " +
  "or vocal I don't have the right to use, and I'm happy for my track to be listed publicly on this " +
  "page once entries close, under the artist name I gave, where anyone can play it and vote for it. " +
  "I understand droplr only stores my link and my contact details, not my audio.";

/**
 * The first wording, kept because entries made under it are still on record.
 *
 * v1 said "happy for the label to listen to it and share it if I win" — which is NOT consent to being
 * listed in a public gallery with a vote button on it. So `galleryEligible` below excludes them. There
 * were no live v1 entries when v2 shipped, which is exactly why it was cheap to do properly; the point
 * is that the version column now earns its place instead of being decoration.
 */
export const DECLARATION_V1_TEXT =
  "This remix is my own work. I made it from the stems the label provided, I haven't used any sample " +
  "or vocal I don't have the right to use, and I'm happy for the label to listen to it and share it " +
  "if I win. I understand droplr only stores my link and my contact details, not my audio.";

/** The version from which an entrant agreed to being listed publicly. */
export const PUBLIC_GALLERY_FROM_VERSION = 2;

export const galleryEligible = (e: { declarationVersion: number; withdrawnAt: Date | null }) =>
  !e.withdrawnAt && e.declarationVersion >= PUBLIC_GALLERY_FROM_VERSION;

/**
 * Is the public allowed to see the entries yet?
 *
 * Only once entries have closed. While a contest is open, a visible gallery would mean later entrants
 * can hear what's already been done, and the first entry submitted collects weeks more plays than the
 * last — neither of which is a contest. After the deadline it's pure promotion for everyone in it.
 */
export function galleryVisible(c: ContestWindow, now = new Date()): boolean {
  const state = contestState(c, now);
  return state === "judging" || state === "done";
}

export type EntryDraft = {
  email: string;
  artistName: string;
  link: string;
  declarationAccepted: boolean;
  note?: string | null;
};

export const ENTRY_LIMITS = { artistName: 80, note: 500, link: 1000 };

/** Problems that stop an entry being recorded at all, in the order a person reads the form. */
export function entryProblem(d: EntryDraft): string | null {
  if (!d.email.trim()) return "We need an email address to tell you if you've won.";
  if (!d.artistName.trim()) return "What name should the label credit you under?";
  if (d.artistName.trim().length > ENTRY_LIMITS.artistName) return `Keep the artist name under ${ENTRY_LIMITS.artistName} characters.`;
  if ((d.note ?? "").length > ENTRY_LIMITS.note) return `Keep the note under ${ENTRY_LIMITS.note} characters.`;
  if (!d.declarationAccepted) return "Tick the box to confirm the remix is yours.";
  return null;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/**
 * The embed URL for an entry, or null when the host can't be embedded from a URL alone.
 *
 * Only SoundCloud and YouTube make it. SoundCloud's player takes any track URL as a parameter, and a
 * YouTube id is sitting in the URL. Bandcamp and Audius embeds need a numeric release id that their
 * public URLs don't carry — it takes an API call each — so those entries get a link instead of a
 * player. That is deliberate: a dead iframe on a contest page looks like the entrant's track is
 * broken, which is a worse outcome for them than an honest "open in Bandcamp" button.
 *
 * Every returned URL is built from parts this function validated, never by interpolating the entrant's
 * string into a src attribute.
 */
export function embedFor(link: string): { kind: "soundcloud" | "youtube"; src: string; tall: boolean } | null {
  const parsed = normaliseEntryUrl(link);
  if (!parsed) return null;
  const { url } = parsed;

  if (/(^|\.)soundcloud\.com$/i.test(url.hostname)) {
    // The visual player is 300px+ of artwork; the compact one is a 20px bar. Compact is right here:
    // twenty entries in a row of giant waveforms is a page nobody scrolls to the bottom of.
    const p = new URLSearchParams({
      url: url.toString(),
      color: "%23ffffff",
      auto_play: "false",
      hide_related: "true",
      show_comments: "false",
      show_user: "true",
      show_reposts: "false",
      show_teaser: "false",
      visual: "false",
    });
    return { kind: "soundcloud", src: `https://w.soundcloud.com/player/?${p.toString()}`, tall: false };
  }

  if (/(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtu\.be$/i.test(url.hostname)) {
    const id =
      url.hostname.endsWith("youtu.be")
        ? url.pathname.slice(1).split("/")[0]
        : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? "";
    // YouTube ids are 11 characters of [A-Za-z0-9_-]. Refusing anything else is what keeps a crafted
    // path out of the iframe src.
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, tall: true };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/**
 * One vote per visitor per contest, movable.
 *
 * Not a heart on every entry: that rewards whoever asks the most people to tap the most buttons. One
 * pick, changeable, is the closest a public vote gets to meaning "this is the best one" — and it makes
 * the count legible to the label, because the numbers across a contest add up to the number of people
 * who voted rather than to nothing in particular.
 *
 * It is still only a signal. `voteConcentration` below is why: the label sees how few distinct
 * addresses those votes came from before treating them as a verdict.
 */
export type VoteVerdict =
  | { kind: "new" }
  | { kind: "moved"; from: string }
  | { kind: "same" };

export function voteVerdict(existingEntryId: string | null, entryId: string): VoteVerdict {
  if (!existingEntryId) return { kind: "new" };
  if (existingEntryId === entryId) return { kind: "same" };
  return { kind: "moved", from: existingEntryId };
}

/**
 * How suspicious a vote count is, from the spread of hashed addresses behind it.
 *
 * Deliberately a description, not a judgement: droplr can't tell a share in a group chat on one office
 * network from one person with a VPN, so it reports the shape and lets the label decide. Anything under
 * four votes says nothing at all, because on small numbers every ratio looks alarming.
 */
export function voteConcentration(ipHashes: (string | null)[]): { votes: number; sources: number; note: string | null } {
  const votes = ipHashes.length;
  const sources = new Set(ipHashes.filter(Boolean)).size;
  if (votes < 4 || sources === 0) return { votes, sources, note: null };
  const ratio = votes / sources;
  if (ratio >= 3) return { votes, sources, note: `${votes} votes from only ${sources} network${sources === 1 ? "" : "s"} — worth a look.` };
  if (ratio >= 2) return { votes, sources, note: `${votes} votes from ${sources} networks.` };
  return { votes, sources, note: null };
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export type ExistingEntry = { id: string; email: string; linkNormalised: string; withdrawnAt: Date | null };

export type DuplicateVerdict =
  | { kind: "none" }
  /** Same link, whoever pasted it. Always refused — two people can't both own one upload. */
  | { kind: "link"; entryId: string }
  /** This entrant is at their limit. Refused, and told how to change what they already sent. */
  | { kind: "limit"; count: number }
  /** Their OWN withdrawn entry, same link, pasted again: revive that row rather than add a second. */
  | { kind: "revive"; entryId: string };

/**
 * Whether this submission may be recorded, and against which row.
 *
 * **Nothing here ever overwrites a live entry, and that is the whole design.** An email address is
 * not proof of anything: the form takes it unverified, so treating it as a key to *mutate* a row
 * would let anyone who knows an entrant's address replace that person's remix with a dead link an
 * hour before the deadline, reset the label's shortlist mark, and — worse — rewrite the declaration
 * record that says who claimed authorship. The only proof an entrant holds is the withdraw token in
 * their own receipt, so changing an entry goes: withdraw with that token, then enter again.
 *
 * `revive` is the one exception and it is additive: their own already-withdrawn entry, with the same
 * link, put back. Nothing is lost if it fires for someone else, because the row's content doesn't
 * change — only `withdrawnAt`.
 *
 * A withdrawn entry frees its slot but keeps its link reserved: re-using a withdrawn link is how one
 * person's remix ends up entered under someone else's name.
 */
export function duplicateVerdict(
  d: { email: string; linkNormalised: string },
  existing: ExistingEntry[],
  maxPerEntrant: number,
): DuplicateVerdict {
  const email = d.email.trim().toLowerCase();
  const sameLink = existing.find((e) => e.linkNormalised === d.linkNormalised);
  if (sameLink) {
    if (sameLink.email.trim().toLowerCase() !== email) return { kind: "link", entryId: sameLink.id };
    if (!sameLink.withdrawnAt) return { kind: "link", entryId: sameLink.id };
    return { kind: "revive", entryId: sameLink.id };
  }

  const mine = existing.filter((e) => e.email.trim().toLowerCase() === email && !e.withdrawnAt);
  if (mine.length >= maxPerEntrant) return { kind: "limit", count: mine.length };
  return { kind: "none" };
}

export function duplicateMessage(v: DuplicateVerdict, maxPerEntrant: number): string | null {
  if (v.kind === "link") return "That link has already been entered. If it was you, check your email for the confirmation.";
  if (v.kind === "limit") {
    return maxPerEntrant === 1
      ? "You've already entered. To swap your link, use the withdraw link in your confirmation email and then enter again."
      : `You've entered ${v.count} remix${v.count === 1 ? "" : "es"}, which is the limit for this one (${maxPerEntrant}). To swap one, withdraw it using the link in that entry's confirmation email.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Judging
// ---------------------------------------------------------------------------

/** new → shortlisted → winner, with rejected as a side exit. Withdrawn is the entrant's own doing. */
export const ENTRY_STATUSES = ["new", "shortlisted", "winner", "rejected"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export const isEntryStatus = (v: unknown): v is EntryStatus =>
  typeof v === "string" && (ENTRY_STATUSES as readonly string[]).includes(v);

/** Reachability, recorded from a HEAD request at submission and again when entries close. */
export const LINK_CHECKS = ["unchecked", "ok", "gone", "blocked"] as const;
export type LinkCheck = (typeof LINK_CHECKS)[number];

export function linkCheckFromStatus(status: number): LinkCheck {
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "gone";
  // 401/403 usually means a private Drive file; 405 means the host refuses HEAD, which proves nothing.
  return status === 405 ? "unchecked" : "blocked";
}

export function linkCheckNote(c: LinkCheck): string | null {
  if (c === "gone") return "This link is dead — the file has been deleted or moved.";
  if (c === "blocked") return "This link wouldn't open without signing in. Ask the entrant to make it public.";
  return null;
}

/** What the label is actually waiting on, for the entries list header. */
export function judgingSummary(entries: { status: string; linkCheck: string; withdrawnAt: Date | null }[]) {
  const live = entries.filter((e) => !e.withdrawnAt);
  return {
    total: live.length,
    unheard: live.filter((e) => e.status === "new").length,
    shortlisted: live.filter((e) => e.status === "shortlisted").length,
    winner: live.filter((e) => e.status === "winner").length,
    broken: live.filter((e) => e.linkCheck === "gone" || e.linkCheck === "blocked").length,
    withdrawn: entries.length - live.length,
  };
}
