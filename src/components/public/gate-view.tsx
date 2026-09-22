import { SITE_URL } from "@/lib/env";
import { GATE_PLATFORMS, isGatePlatform, stepLabel, type Proof } from "@/lib/gate-steps";
import { ArtworkHero, ArtworkPageShell, ShellFooter, type PublicTheme } from "./artwork-shell";
import { PlatformIcon } from "./platform-icon";
import { TimezoneField } from "./timezone-field";

export type GateStepView = {
  id: string;
  platform: string;
  action: string;
  target: string | null;
  required: boolean;
  done: boolean;
  /** Only false when a SoundCloud step exists but no API key is connected — hide rather than break. */
  available: boolean;
};

export type GateViewData = {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string;
  accentColor: string | null;
  downloadNote: string | null;
  org: { name: string; metaPixelId: string | null; tiktokPixelId: string | null; ga4Id: string | null; timezone?: string | null };
};

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  email: { tone: "ok", text: "Thanks — that's your email step done." },
  soundcloud: { tone: "ok", text: "Done on SoundCloud." },
  "soundcloud-cancelled": { tone: "warn", text: "You cancelled on SoundCloud, so that step isn't done yet." },
  "soundcloud-failed": { tone: "warn", text: "SoundCloud didn't complete that. Try again, or use another step if there is one." },
  "soundcloud-unavailable": { tone: "warn", text: "The SoundCloud step isn't available right now." },
  error: { tone: "warn", text: "Something went wrong. Please try again." },
};

/**
 * A download gate: the actions first, the file second.
 *
 * Two things this page does that competing gates don't:
 *
 * 1. It says which steps are checked and which are taken on trust — a small line under the
 *    unverified ones. An artist's fans are being asked to do something in exchange for a file,
 *    and pretending a click was verified is the kind of small lie that costs a scene's trust.
 * 2. The download URL is nowhere in this HTML. The button points at the unlock route, which
 *    only discloses the destination once the steps are actually recorded server-side. Gates
 *    normally leak here: the real link sits in a hidden element and View Source skips the gate.
 */
export function GateView({
  release, steps, unlocked, query, showBranding, theme = "dark", demo,
}: {
  release: GateViewData;
  steps: GateStepView[];
  unlocked: boolean;
  query: Record<string, string | undefined>;
  showBranding: boolean;
  theme?: PublicTheme;
  demo?: boolean;
}) {
  const accent = release.accentColor ?? "#8B5CF6";
  const notice = NOTICES[query.done ?? query.notice ?? ""];
  const shown = steps.filter((s) => s.available);
  const left = shown.filter((s) => s.required && !s.done).length;

  return (
    <ArtworkPageShell
      theme={theme}
      imageUrl={release.coverUrl}
      accentColor={release.accentColor}
      footer={<ShellFooter showBranding={showBranding} orgName={release.org.name} />}
      pixels={demo ? null : { meta: release.org.metaPixelId, tiktok: release.org.tiktokPixelId, ga4: release.org.ga4Id, contentName: `${release.artistName} - ${release.title}` }}
    >
      <ArtworkHero
        imageUrl={release.coverUrl}
        accentColor={release.accentColor}
        alt={`${release.title} artwork`}
        eyebrow="Free download"
        title={release.title}
        subtitle={release.artistName}
      />

      {notice && (
        <div role="status" className={`mt-5 rounded-xl px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30"}`}>
          {notice.text}
        </div>
      )}

      {release.downloadNote && <p className="mt-5 text-sm text-white/70">{release.downloadNote}</p>}

      {unlocked ? (
        <div className="mt-7 space-y-3">
          <a
            href={demo ? "#" : `/api/gate/unlock/${release.id}`}
            className="flex h-14 w-full items-center justify-center rounded-xl text-base font-semibold text-black transition active:scale-[0.99]"
            style={{ backgroundColor: "#fff" }}
          >
            Download now
          </a>
          <p className="text-center text-xs text-white/50">Thanks for doing the bit above — the link stays open on this device.</p>
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          <p className="text-sm font-semibold">
            {left === 1 ? "One step and it's yours" : `${left} steps and it's yours`}
          </p>

          <ul className="space-y-2.5">
            {shown.map((s) => (
              <li key={s.id}>
                <GateStepRow step={s} release={release} accent={accent} demo={demo} query={query} />
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled
            aria-disabled
            className="flex h-14 w-full cursor-not-allowed items-center justify-center rounded-xl border border-white/15 bg-white/5 text-base font-semibold text-white/40"
          >
            Download
          </button>
        </div>
      )}
    </ArtworkPageShell>
  );
}

function ProofNote({ proof }: { proof: Proof }) {
  if (proof === "performed") return <span className="block text-[11px] text-emerald-300/80">Done for you, properly — not just a link</span>;
  if (proof === "given") return null;
  return <span className="block text-[11px] text-white/45">Opens the link. We can&apos;t check this one — we trust you.</span>;
}

function GateStepRow({
  step, release, accent, demo, query,
}: {
  step: GateStepView; release: GateViewData; accent: string; demo?: boolean; query: Record<string, string | undefined>;
}) {
  const spec = isGatePlatform(step.platform) ? GATE_PLATFORMS[step.platform] : null;
  const proof: Proof = spec?.proof ?? "unverified";
  const label = stepLabel(step.platform, step.action, release.artistName);

  if (step.done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3.5 text-sm">
        <span aria-hidden className="text-emerald-300">✓</span>
        <span className="flex-1 text-white/80">{label}</span>
        <span className="text-xs font-semibold text-emerald-300">Done</span>
      </div>
    );
  }

  if (step.platform === "email") {
    return (
      <form method="post" action={demo ? undefined : "/api/gate/email"} className="glass space-y-3 rounded-2xl p-4">
        <input type="hidden" name="releaseId" value={release.id} />
        <TimezoneField />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        {query.utm_source && <input type="hidden" name="utm_source" value={query.utm_source} />}

        <label htmlFor="gate-email" className="block text-sm font-semibold">{label}</label>
        <input
          id="gate-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          className="h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base placeholder:text-white/40 focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: accent }}
        />
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/70">
          <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 accent-white" />
          <span>Send me the download and let {release.org.name} email me about new music. Unsubscribe anytime. <a href={`${SITE_URL}/legal/privacy`} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white">Privacy</a></span>
        </label>
        <button type="submit" className="h-12 w-full rounded-xl font-semibold text-black transition active:scale-[0.99]" style={{ backgroundColor: "#fff" }}>
          Continue
        </button>
      </form>
    );
  }

  const href =
    demo ? "#"
    : step.platform === "soundcloud" ? `/api/gate/soundcloud/login?step=${step.id}`
    : `/api/gate/visit/${step.id}`;
  const external = step.platform !== "soundcloud";

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] p-3.5 text-sm transition hover:bg-white/[0.08]"
    >
      <PlatformIcon platform={step.platform} />
      <span className="flex-1">
        <span className="block font-semibold">{label}</span>
        <ProofNote proof={proof} />
      </span>
      <span className="text-xs font-semibold" style={{ color: accent }}>
        {step.platform === "soundcloud" ? "Connect" : "Open ↗"}
      </span>
    </a>
  );
}
