"use client";
import { useState } from "react";
import { SITE_URL } from "@/lib/env";
import {
  checkEntryLink, closingMessage, contestState, DECLARATION_TEXT,
  type ContestState, type EntryWarning,
} from "@/lib/contest";

export type ContestView = {
  id: string;
  headline: string;
  brief: string | null;
  prize: string | null;
  rulesUrl: string | null;
  opensAt: string | null;
  closesAt: string;
  winnerAnnouncedAt: string | null;
  published: boolean;
  maxPerEntrant: number;
  entryCount: number;
};

/**
 * The entry form, on the same page the stems came from.
 *
 * Two deliberate choices:
 *
 * 1. **The link is checked as it's typed, not on submit.** Someone pasting a WeTransfer link is
 *    warned while they can still do something about it, and the label isn't left with an entry that
 *    dies before judging day. Warnings never block — an unknown host is usually the artist's own
 *    site, and droplr doesn't get to decide where independent artists host their work.
 * 2. **The declaration is shown in full**, not summarised behind a link. It's the record of what the
 *    entrant agreed to, and a checkbox saying "I agree to the terms" is not that record.
 */
export function ContestEntry({ contest, orgName, accent }: { contest: ContestView; orgName: string; accent: string }) {
  const window_ = {
    published: contest.published,
    opensAt: contest.opensAt ? new Date(contest.opensAt) : null,
    closesAt: new Date(contest.closesAt),
    winnerAnnouncedAt: contest.winnerAnnouncedAt ? new Date(contest.winnerAnnouncedAt) : null,
  };
  const state: ContestState = contestState(window_);

  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ revived: boolean; warnings: EntryWarning[] } | null>(null);

  // Live feedback, only once there's enough typed to judge.
  const probe = link.trim().length > 8 ? checkEntryLink(link, { closesAt: window_.closesAt }) : null;
  const linkError = probe && !probe.ok ? probe.error : null;
  const linkWarnings = probe && probe.ok ? probe.warnings : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contest/${contest.id}/enter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, artistName, link, note: note.trim() || null, declarationAccepted: agreed }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; revived?: boolean; warnings?: EntryWarning[] };
      if (!res.ok) setError(j.error ?? "That didn't go through. Try again in a moment.");
      else setDone({ revived: !!j.revived, warnings: j.warnings ?? [] });
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "draft") return null;

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <section className="mt-7 rounded-2xl border border-white/15 bg-white/[0.04] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>Remix contest</p>
      <h2 className="mt-1.5 text-lg font-semibold">{contest.headline}</h2>
      {children}
    </section>
  );

  if (done) {
    return (
      <Frame>
        <p className="mt-3 text-sm text-emerald-300">
          {done.revived ? "That entry's back in — it'll be judged with the rest." : "You're in. Check your email for the confirmation."}
        </p>
        {done.warnings.map((w) => (
          <p key={w.id} className="mt-2 text-sm text-amber-200">{w.message}</p>
        ))}
        <p className="mt-3 text-xs text-white/50">
          Keep that email — the link in it is the only way to pull or change your entry. Nothing about your remix is
          stored here except the link you gave us.
        </p>
      </Frame>
    );
  }

  if (state !== "open") {
    return (
      <Frame>
        <p className="mt-3 text-sm text-white/70">{closingMessage(window_)}</p>
        {state === "waiting" && window_.opensAt && (
          <p className="mt-1 text-sm text-white/50">Opens {window_.opensAt.toLocaleDateString(undefined, { day: "numeric", month: "long" })}.</p>
        )}
        {contest.brief && <p className="mt-3 whitespace-pre-line text-sm text-white/70">{contest.brief}</p>}
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="mt-2 text-sm text-white/60">
        {closingMessage(window_)}
        {contest.entryCount > 0 && ` ${contest.entryCount} ${contest.entryCount === 1 ? "entry" : "entries"} so far.`}
      </p>
      {contest.prize && <p className="mt-3 text-sm"><span className="text-white/50">Prize: </span>{contest.prize}</p>}
      {contest.brief && <p className="mt-3 whitespace-pre-line text-sm text-white/70">{contest.brief}</p>}
      {contest.rulesUrl && (
        <a href={contest.rulesUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline decoration-white/30 underline-offset-2 hover:text-white">
          Full rules ↗
        </a>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label htmlFor="ce-link" className="block text-sm font-semibold">Link to your remix</label>
          <input
            id="ce-link"
            type="url"
            required
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://soundcloud.com/you/your-remix"
            className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base placeholder:text-white/40 focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: accent }}
          />
          <p className="mt-1.5 text-xs text-white/45">
            Upload it wherever you like and paste the link. {orgName} listens to it there — droplr never holds your audio.
          </p>
          {linkError && <p className="mt-1.5 text-sm text-red-300">{linkError}</p>}
          {linkWarnings.map((w) => (
            <p key={w.id} className="mt-1.5 text-sm text-amber-200">{w.message}</p>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ce-name" className="block text-sm font-semibold">Credit it to</label>
            <input
              id="ce-name" type="text" required maxLength={80} value={artistName}
              onChange={(e) => setArtistName(e.target.value)} placeholder="Your artist name"
              className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base placeholder:text-white/40 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: accent }}
            />
          </div>
          <div>
            <label htmlFor="ce-email" className="block text-sm font-semibold">Email</label>
            <input
              id="ce-email" type="email" required autoComplete="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
              className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base placeholder:text-white/40 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: accent }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="ce-note" className="block text-sm font-semibold">Anything to say about it <span className="font-normal text-white/40">(optional)</span></label>
          <textarea
            id="ce-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What you did with it, gear, whatever."
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-base placeholder:text-white/40 focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: accent }}
          />
        </div>

        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/70">
          <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-white" />
          <span>{DECLARATION_TEXT}</span>
        </label>

        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={busy || !!linkError}
          className="h-12 w-full rounded-xl font-semibold text-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "#fff" }}
        >
          {busy ? "Entering…" : "Enter my remix"}
        </button>
        <p className="text-center text-xs text-white/40">
          {contest.maxPerEntrant === 1
            ? "One entry each. To change your link later, use the withdraw link in your confirmation email."
            : `Up to ${contest.maxPerEntrant} entries each. Your confirmation email is how you change or pull one.`}{" "}
          <a href={`${SITE_URL}/legal/privacy`} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2">Privacy</a>
        </p>
      </form>
    </Frame>
  );
}
