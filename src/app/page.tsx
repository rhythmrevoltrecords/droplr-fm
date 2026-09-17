import Link from "next/link";
import { ArrowRight, AtSign, BarChart3, ChevronDown, Disc3, Globe, Mail, Users } from "lucide-react";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { PlatformIcon } from "@/components/public/platform-icon";
import { Button } from "@/components/ui/button";
import { ctaCopy, type CtaCopy } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";
import { artistsLine, clicksLine, planPrice, priceSuffix, releasesLine } from "@/lib/plan-copy";
import { platformMeta } from "@/lib/platforms";
import { PLAN_LIMITS, PLAN_ORDER } from "@/lib/plans";
import { cn } from "@/lib/utils";

const DEMO_COVER = "/demo/two-step-theory.svg";

/* ---------- Content ---------- */

const STEPS = [
  { title: "Paste the Spotify link", body: "Unreleased is fine. Title, artwork and colour fill in. Add Beatport, Traxsource or Bandcamp once." },
  { title: "Share a link per placement", body: "/ig in your story, /tiktok in bio, a QR on the flyer. Each one is tracked on its own." },
  { title: "Release day runs itself", body: "Store links fill in from your UPC and every pre-saver gets the release-day email." },
];

// Only things that exist in the product today. `pro` marks plan-gated features (see PLAN_LIMITS).
const AVAILABLE: { icon: typeof Disc3; title: string; body: string; pro?: string }[] = [
  {
    icon: Disc3,
    title: "Smart links + DJ stores",
    body: "One page for every release. Beatport, Traxsource and Bandcamp get the same big button as Spotify, in whatever order you want.",
  },
  {
    icon: Mail,
    title: "Email pre-save + release-day email",
    body: "Fans leave their email and pick where they listen. At 9am their time on release day they get a one-tap link to that store, plus a Follow on Spotify button so Spotify tells them about the next one.",
  },
  {
    icon: AtSign,
    title: "Link variants + QR codes",
    body: "/ig, /tiktok, /bio or any placement you name, each with its own stats, so you know which post moved people.",
    pro: "QR on Pro",
  },
  {
    icon: Users,
    title: "Label roster + artist logins",
    body: "The label runs every release across the roster. Artists log in to copy their links and see their own stats. Only the label edits links.",
  },
  {
    icon: BarChart3,
    title: "Pixels + data export",
    body: "Set Meta, TikTok and GA4 pixels once for the whole label. Export pre-save emails and click data as CSV.",
    pro: "Pro",
  },
  {
    icon: Globe,
    title: "Custom domain, set up for you",
    body: "presave.yourlabel.com/track-name. Add one DNS record and we connect the domain and its certificate on our side.",
    pro: "Pro",
  },
];

type Status = "In build" | "Next" | "Later";
const ROADMAP: { status: Status; blurb: string; items: { title: string; body: string }[] }[] = [
  {
    status: "In build",
    blurb: "Being built now",
    items: [
      { title: "Artist roster profiles", body: "A profile for every artist, with or without a login: bio, photos, contacts and stats." },
      { title: "Release planning", body: "Task timelines from 6-week and 4-week templates, with separate tasks for the label and the artist." },
      { title: "Artist portal", body: "One place for artists to see their releases, links and the tasks assigned to them." },
    ],
  },
  {
    status: "Next",
    blurb: "Up after that",
    items: [
      { title: "Caption & knowledge board", body: "Captions, key messages and release notes, pushed to your artists." },
      { title: "Demo inbox", body: "Take demo submissions in and sort them next to your releases." },
      { title: "Royalties ledger", body: "Track earnings per release and send artists clear statements." },
      { title: "Notifications", body: "A heads-up when tasks are due, releases go live or a statement is ready." },
    ],
  },
  {
    status: "Later",
    blurb: "On the list",
    items: [{ title: "Contracts", body: "Artist agreements kept alongside the roster and their releases." }],
  },
];

const STATUS_STYLE: Record<Status, { chip: string; dot: string }> = {
  "In build": { chip: "border-violet-400/40 bg-violet-500/15 text-violet-100", dot: "bg-violet-400 shadow-[0_0_0_3px_rgba(167,139,250,.25)]" },
  Next: { chip: "border-sky-400/30 bg-sky-500/10 text-sky-100", dot: "bg-sky-400" },
  Later: { chip: "border-white/15 bg-white/5 text-zinc-300", dot: "bg-zinc-400" },
};

/* ---------- Pieces ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{children}</p>;
}

function ProTag({ children = "Pro" }: { children?: React.ReactNode }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">{children}</span>;
}

function StatusChip({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", s.chip)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {status}
    </span>
  );
}

function PrimaryActions({ cta, secondary, className }: { cta: CtaCopy; secondary: { label: string; href: string }; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <Button asChild size="lg" variant="white" className="h-auto min-h-12 w-full whitespace-normal py-3 text-center sm:w-auto">
        <Link href={cta.primary.href}>{cta.primary.label} <ArrowRight aria-hidden /></Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-auto min-h-12 w-full whitespace-normal border-white/15 py-3 text-center hover:bg-white/5 sm:w-auto">
        <Link href={secondary.href}>{secondary.label}</Link>
      </Button>
    </div>
  );
}

function InviteHint({ cta, className }: { cta: CtaCopy; className?: string }) {
  if (!cta.hint) return null;
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {cta.hint.text}{" "}
      <Link href={cta.hint.link.href} className="font-medium text-foreground underline decoration-white/30 underline-offset-4 hover:decoration-white">{cta.hint.link.label}</Link>
    </p>
  );
}

function PhoneMock() {
  const links = ["spotify", "appleMusic", "beatport", "traxsource", "bandcamp"];
  return (
    <div className="relative mx-auto w-[272px] max-w-full rounded-[2.5rem] border border-white/10 bg-black p-3 shadow-[0_40px_120px_-30px_rgba(168,85,247,.6)] sm:w-[280px]">
      <div
        className="relative overflow-hidden rounded-[2rem] bg-black px-4 pb-6 pt-8"
        // Same artwork-coloured wash the real public pages use: gradients only, no blurred image copy.
        style={{ background: "radial-gradient(130% 70% at 50% 0%, rgba(168,85,247,.5) 0%, rgba(236,72,153,.18) 45%, transparent 75%), linear-gradient(180deg, rgba(0,0,0,.1) 0%, #000 70%)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={DEMO_COVER} alt="Example release artwork" width={176} height={176} fetchPriority="high" decoding="async" className="mx-auto aspect-square w-44 rounded-xl shadow-[0_20px_50px_-15px_rgba(168,85,247,.7)]" />
        <p className="mt-3 text-center text-[10px] uppercase tracking-[.2em] text-white/60">Out now</p>
        <p className="text-center font-semibold">Two Step Theory</p>
        <p className="text-center text-xs text-white/70">Your Artist</p>
        <div className="mt-4 space-y-2">
          {links.map((p) => {
            const m = platformMeta(p);
            return (
              <div key={p} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] p-1.5 pr-2 text-xs">
                <PlatformIcon platform={p} className="h-7 w-7 text-xs" />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-black">{m.action}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Landing() {
  const cta = ctaCopy();
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "Do Spotify pre-saves go straight into fans' libraries?",
      a: (
        <>
          <p>
            Not for most fans, and we&apos;d rather tell you now than have you find out on release day. Since February 2026, Spotify only lets a new app save music for 5 people you allowlist by hand. Lifting that needs Spotify&apos;s Extended Quota, which is only for registered businesses with 250,000+ monthly users. Any newer pre-save service without that approval has the same limit.
          </p>
          <p className="mt-3">
            So droplr.fm is built around what works for every fan: an email pre-save where they choose their store, a release-day email at 9am in their own timezone once the track has unlocked there, and a Follow on Spotify button so new releases show up for them in Spotify. You can still connect your own Spotify app on Pro for your team and VIPs. <Link href="/docs/spotify-byo" className="text-foreground underline underline-offset-4">How it works</Link>
          </p>
        </>
      ),
    },
    {
      q: "What currency are the prices in?",
      a: <p>Australian dollars (AUD), including any tax. Paid plans are billed monthly or yearly and you can cancel any time. There are no per-release fees.</p>,
    },
    {
      q: "Can we use our own domain?",
      a: (
        <p>
          Yes, on Pro and above. Point a subdomain like presave.yourlabel.com at droplr.fm with one DNS record, and we connect it and issue the certificate for you. <Link href="/docs/custom-domain" className="text-foreground underline underline-offset-4">Domain setup</Link>
        </p>
      ),
    },
    {
      q: "Can our artists log in?",
      a: (
        <p>
          Yes. Invite artists from your roster and they get their own login to copy their links and see stats for their releases. Only the label edits links and settings. Free includes {PLAN_LIMITS.free.artists} artist, Pro up to {PLAN_LIMITS.pro.artists}, and Label has no limit.
        </p>
      ),
    },
    ...(cta.open
      ? []
      : [
          {
            q: "Can anyone sign up?",
            a: (
              <p>
                Not yet. We&apos;re onboarding a small group of labels first. <Link href={cta.primary.href} className="text-foreground underline underline-offset-4">Request early access</Link> and we&apos;ll email you when there&apos;s room, or email {CONTACT.hello}. Have an invite? <Link href={cta.hint!.link.href} className="text-foreground underline underline-offset-4">Sign up</Link>.
              </p>
            ),
          },
        ]),
  ];

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(70% 60% at 50% 0%, rgba(139,92,246,.38) 0%, rgba(139,92,246,.12) 45%, transparent 75%), radial-gradient(35% 45% at 88% 35%, rgba(217,70,239,.14) 0%, transparent 70%)" }}
        />
        <div className="container relative grid items-center gap-12 py-14 md:py-24 lg:grid-cols-[1.1fr_.9fr]">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden /> Built for independent labels
            </p>
            <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">Run your label&apos;s releases from one place.</h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">Smart links and email pre-saves today. Roster, release planning and royalties next.</p>
            <div className="mt-8">
              <PrimaryActions cta={cta} secondary={{ label: "See a live demo", href: "/demo/demo-track" }} />
            </div>
            <InviteHint cta={cta} className="mt-4" />
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 border-y border-white/5 bg-white/[0.02]">
        <div className="container py-14">
          <Eyebrow>How it works</Eyebrow>
          <ol className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-black" aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Available now */}
      <section id="product" className="container scroll-mt-16 py-20">
        <Eyebrow>Available now</Eyebrow>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">Everything a release needs, live today</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">One label account runs the links, the fan data and the artist logins.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors duration-300 hover:border-violet-500/30 hover:bg-violet-500/[0.05]">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/10">
                  <f.icon className="h-[18px] w-[18px] text-violet-300" aria-hidden />
                </span>
                {f.pro && <ProTag>{f.pro}</ProTag>}
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What's coming */}
      <section id="roadmap" className="scroll-mt-16 border-y border-white/5 bg-white/[0.02]">
        <div className="container py-20">
          <Eyebrow>What&apos;s coming</Eyebrow>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">From smart links to the whole label</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            The rest of the label back office is being built into the same account. This is the order we&apos;re working in. We&apos;ll share dates when things ship, not before.
          </p>

          <div className="relative mt-10 grid gap-4 lg:grid-cols-3">
            {ROADMAP.map((col) => (
              <div key={col.status} className={cn("flex flex-col rounded-2xl border p-5", col.status === "In build" ? "border-violet-500/30 bg-violet-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusChip status={col.status} />
                  <span className="text-xs text-muted-foreground">{col.blurb}</span>
                </div>
                <ul className="mt-5 space-y-4 border-l border-white/10 pl-4">
                  {col.items.map((it) => (
                    <li key={it.title} className="relative">
                      <span aria-hidden className={cn("absolute -left-[21px] top-1.5 h-2 w-2 rounded-full", STATUS_STYLE[col.status].dot.split(" ")[0])} />
                      <h3 className="font-semibold leading-snug">{it.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Running a label and want a say in what ships first?</span>{" "}
              {cta.open ? "Start with smart links and pre-saves today, and tell us what you need next." : "Request early access and tell us what you need next."}
            </p>
            <Button asChild variant="white" className="h-auto min-h-10 w-full shrink-0 whitespace-normal py-2 text-center sm:w-auto">
              <Link href={cta.primary.href}>{cta.open ? cta.primaryShort.label : cta.primary.label}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" className="container scroll-mt-16 py-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">Priced for labels, not per release</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">Monthly prices in Australian dollars, including tax. Every plan includes email pre-saves and the release-day email.</p>
          </div>
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-200 hover:text-white">
            Compare plans <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((k) => {
            const p = PLAN_LIMITS[k];
            const featured = k === "pro";
            return (
              <li key={k}>
                <Link
                  href="/pricing"
                  className={cn(
                    "flex h-full flex-col rounded-2xl border p-4 transition-colors",
                    featured ? "border-violet-500/60 bg-violet-500/[0.08] hover:bg-violet-500/[0.12]" : "border-white/10 bg-white/[0.03] hover:border-white/20",
                  )}
                >
                  <span className="text-sm font-medium text-muted-foreground">{p.name}</span>
                  <span className="mt-1 text-2xl font-bold">
                    {planPrice(k)}
                    <span className="text-sm font-normal text-muted-foreground">{priceSuffix(k)}</span>
                  </span>
                  <span className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {k === "enterprise" ? "Contact us for a quote" : `${releasesLine(k)} · ${artistsLine(k)}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* FAQ */}
      <section id="faq" className="container scroll-mt-16 pb-20">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">Questions labels ask</h2>
          <div className="mt-8 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                  <span>{f.q}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-24">
        <div
          className="relative isolate overflow-hidden rounded-3xl border border-violet-500/30 px-5 py-10 text-center shadow-[0_0_100px_-30px_rgba(124,58,237,0.7)] sm:p-10"
          style={{ background: "radial-gradient(90% 130% at 50% 0%, rgba(139,92,246,.55) 0%, rgba(124,58,237,.22) 40%, rgba(12,10,20,.6) 75%), radial-gradient(60% 80% at 50% 120%, rgba(217,70,239,.25), transparent 70%)" }}
        >
          <h2 className="text-balance text-3xl font-bold tracking-tight">Your next release, run from one place.</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            {cta.open ? `Free for ${PLAN_LIMITS.free.releases} releases. Upgrade when the roster grows.` : "Smart links and email pre-saves today, with the rest of the label tools on the way."}
          </p>
          <div className="mx-auto mt-6 max-w-md sm:max-w-none">
            <PrimaryActions cta={cta} secondary={{ label: "See pricing", href: "/pricing" }} className="sm:justify-center" />
          </div>
          <InviteHint cta={cta} className="mt-4" />
        </div>
      </section>
    </MarketingShell>
  );
}
