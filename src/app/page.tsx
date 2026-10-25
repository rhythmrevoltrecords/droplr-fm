import Link from "next/link";
import { ArrowRight, BarChart3, CalendarCheck, ChevronDown, Clapperboard, Download, Globe, Image as ImageIcon, Link2 as LinkIcon, ListMusic, Mail, ShieldCheck, Users } from "lucide-react";
import { AudiencePricing } from "@/components/marketing/audience-pricing";
import { RevealOnScroll } from "@/components/marketing/reveal";
import { SectionScrollTarget } from "@/components/marketing/section-link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { PlatformIcon } from "@/components/public/platform-icon";
import { Button } from "@/components/ui/button";
import { ctaCopy, type CtaCopy } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";
import { PLATFORM_LOGOS } from "@/lib/platform-logos";
import { platformMeta, type PlatformKey } from "@/lib/platforms";
import { CUSTOM_DOMAIN_GRACE_DAYS, PLAN_LIMITS } from "@/lib/plans";
import { pricingTiers } from "@/lib/pricing-tiers";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/env";
import { siteJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/seo/json-ld";

const DEMO_COVER = "/demo/two-step-theory.svg";

/* ---------- Content ---------- */

// The store row. One static, single-colour row of real marks only: a store without a mark of its
// own used to render as a letter tile, which read as unfinished, and a scrolling strip of
// full-colour logos read like a partner wall the footer then has to deny. Led by the DJ stores,
// because that is the difference. Traxsource is back (it came off a marquee on 28 Sep for space):
// for UK garage it is the store people check for.
const STORE_ROW: PlatformKey[] = ["beatport", "traxsource", "bandcamp", "spotify", "appleMusic", "soundcloud", "youtubeMusic", "tidal", "deezer"];

const FOR_ARTISTS = [
  { title: "Make the release page", body: "Paste a Spotify link. Artwork, colour and store links fill in, unreleased is fine." },
  { title: "Follow the promo plan", body: "Dated steps from announce day to two months after, each with the graphic, the link or the reel it needs — pick 30 seconds and droplr renders the video here in your browser." },
  { title: "Let release day run itself", body: "Every pre-saver gets an email at 9am in their own timezone, leading with the store they picked." },
  { title: "Keep the fans", body: "One fan list across every release. Put a free pack behind a download gate to start one, and the fans who opted in to news are yours to email again." },
];
const FOR_LABELS = [
  { title: "Run the whole roster", body: "Every release, every artist, one account. Artists log in to grab their links, see their stats and make their own clips — the release stays yours to edit." },
  { title: "A link per placement", body: "/ig, /tiktok, a QR on the flyer: each tracked, so you know which post moved people." },
  { title: "Your domain, connected for you", body: "listen.yourlabel.com with one DNS record. droplr verifies it and issues the certificate." },
  { title: "See what works across releases", body: "Busiest hours, top countries, best sources and the stores fans actually use." },
];

// Everything else droplr does, in one line each. These were full cards; nine cards made every
// feature look the same size, and the page twice as long.
const ALSO = [
  { icon: CalendarCheck, title: "A promo plan per release", body: "Dated steps from four weeks out to two months after, each with what it needs." },
  { icon: ImageIcon, title: "Share graphics", body: "Countdown, out now and lyric cards, made from your artwork." },
  { icon: Clapperboard, title: "Release clips", body: "30 seconds for Reels, rendered in your browser. Your master never leaves your computer." },
  { icon: Users, title: "One fan list", body: "Every pre-saver across every release, with their store and whether they opted in to news." },
  { icon: BarChart3, title: "Insights", body: "When your fans are active, where they are, and which source actually works." },
  { icon: ListMusic, title: "Play inside your playlist", body: "The Spotify button can open the track inside a playlist you run, when it's the track's own link." },
];

/* ---------- Pieces ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/90">{children}</p>;
}

/** Every made-up number or row on this page sits under one of these, big enough to read. */
function ExampleTag({ className }: { className?: string }) {
  return <span className={cn("rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-white/70", className)}>Example</span>;
}

function Actions({ cta, secondary, className }: { cta: CtaCopy; secondary: { label: string; href: string }; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <Button asChild size="lg" variant="white" className="h-12 rounded-full px-6 text-[15px] shadow-[0_10px_40px_-10px_rgba(255,255,255,.45)]">
        <Link href={cta.primary.href}>{cta.primary.label} <ArrowRight aria-hidden /></Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/15 px-6 text-[15px] hover:bg-white/5">
        <Link href={secondary.href}>{secondary.label}</Link>
      </Button>
    </div>
  );
}

function InviteHint({ cta, className }: { cta: CtaCopy; className?: string }) {
  if (!cta.hint) return null;
  return (
    <p className={cn("text-sm text-white/60", className)}>
      {cta.hint.text}{" "}
      <Link href={cta.hint.link.href} className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">{cta.hint.link.label}</Link>
    </p>
  );
}

/** A store's own mark, in one colour. Only stores that have a mark are ever passed in. */
function StoreMark({ platform }: { platform: PlatformKey }) {
  const logo = PLATFORM_LOGOS[platform];
  if (!logo) return null;
  return (
    <li className="flex items-center gap-2 text-white/55">
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-current"><path d={logo.path} /></svg>
      <span className="text-sm">{platformMeta(platform).name}</span>
    </li>
  );
}

/** The phone rises in and the link sheet slides over the artwork. One moving thing, then it holds still. */
function HeroPhone() {
  const links = ["spotify", "appleMusic", "beatport"];
  return (
    <div className="mk-phone-wrap relative mx-auto w-full max-w-[420px] py-6 [perspective:1600px]">
      <div aria-hidden className="absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,.38), rgba(139,92,246,.08) 55%, transparent 75%)" }} />
      <div className="relative">
        <div className="mk-phone relative mx-auto w-[272px] rounded-[2.9rem] border border-white/15 bg-[#0a0a0d] p-2.5 shadow-[0_60px_140px_-40px_rgba(139,92,246,.7),inset_0_0_0_1px_rgba(255,255,255,.04)] sm:w-[292px]">
          <div className="absolute left-1/2 top-4 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
          <div className="relative h-[540px] overflow-hidden rounded-[2.35rem] bg-black sm:h-[570px]" style={{ background: "radial-gradient(120% 60% at 50% 0%, rgba(139,92,246,.5) 0%, rgba(139,92,246,.1) 45%, transparent 72%), #050507" }}>
            <div className="px-6 pt-12 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={DEMO_COVER} alt="Example release artwork" width={160} height={160} fetchPriority="high" decoding="async" className="mk-cover mx-auto aspect-square w-[150px] rounded-md shadow-[0_30px_60px_-18px_rgba(139,92,246,.8)] sm:w-[160px]" />
              <p className="mt-3 text-[10px] uppercase tracking-[.24em] text-white/60">Out Friday</p>
              <p className="mt-1 text-lg font-semibold">Two Step Theory</p>
              <p className="text-xs text-white/60">Your Artist</p>
            </div>
            <div className="mk-sheet absolute inset-x-0 bottom-0 rounded-t-[1.75rem] border-t border-white/10 bg-[#0f0f14] px-4 pb-5 pt-3 shadow-[0_-20px_60px_-20px_rgba(0,0,0,.9)]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
              <div className="mk-stagger space-y-2">
                <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white/45">you@email.com</div>
                <div>
                  <p className="mb-1.5 text-[10px] text-white/55">Where do you listen?</p>
                  <div className="flex flex-wrap gap-1">
                    {links.map((p, i) => (
                      <span key={p} className={cn("rounded-full border px-2 py-1 text-[10px]", i === 0 ? "border-white bg-white text-black" : "border-white/15 text-white/75")}>{platformMeta(p).name}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-white py-2.5 text-center text-xs font-semibold text-black">Pre-save with email</div>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1.5 pr-2 text-xs">
                  <PlatformIcon platform="spotify" className="h-7 w-7 text-xs" />
                  <span className="flex-1 truncate">Follow on Spotify</span>
                  <span className="text-[10px] font-semibold text-white/80">Follow</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* One proof point, clear of the phone (desktop). */}
        <div className="mk-pop absolute -left-32 bottom-[2%] hidden w-56 rounded-2xl border border-white/10 bg-[#13111c]/95 p-3.5 text-xs shadow-2xl xl:block" style={{ animationDelay: "1.7s" }}>
          <div className="flex items-center gap-2 text-white/65"><Mail className="h-3.5 w-3.5 text-violet-300" /> Release-day email</div>
          <div className="mt-2.5 space-y-1.5">
            {[["Brisbane", "9:00am"], ["London", "9:00am"], ["Los Angeles", "9:00am"]].map(([c, t]) => (
              <div key={c} className="flex justify-between"><span className="text-white/80">{c}</span><span className="font-medium tabular-nums text-white">{t}</span></div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-white/55">Each fan&apos;s own time.</p>
        </div>
      </div>
    </div>
  );
}

/** A big feature: words on one side, the thing itself on the other, swapping sides down the page. */
function FeatureRow({ icon: Icon, kicker, title, body, visual, flip, link }: { icon: React.ElementType; kicker: string; title: string; body: React.ReactNode; visual: React.ReactNode; flip?: boolean; link?: { href: string; label: string } }) {
  return (
    <div className="mk-reveal grid items-center gap-10 py-14 md:grid-cols-2 md:gap-16 md:py-20">
      <div className={cn("max-w-lg", flip && "md:order-2")}>
        <div className="flex items-center gap-2 text-sm text-violet-200"><Icon className="h-4 w-4" aria-hidden /> {kicker}</div>
        <h3 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.025em] md:text-[2.5rem] md:leading-[1.08]">{title}</h3>
        <div className="mt-4 space-y-3 text-base leading-relaxed text-white/65">{body}</div>
        {link && (
          <Link href={link.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-violet-200 hover:text-white">
            {link.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      <div className={cn("relative", flip && "md:order-1")}>{visual}</div>
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015))] p-6 shadow-[0_40px_120px_-60px_rgba(139,92,246,.6)] sm:p-8", className)}>{children}</div>;
}

function TimezoneVisual() {
  return (
    <Panel>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {["Brisbane", "London", "Los Angeles"].map((city) => (
          <div key={city} className="rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
            <div className="truncate text-[11px] text-white/55 sm:text-xs">{city}</div>
            <div className="mt-3 text-2xl font-semibold tabular-nums sm:text-3xl">9:00<span className="text-sm text-white/55 sm:text-base">am</span></div>
            <div className="mt-1 text-[11px] text-white/60 sm:text-xs">Friday · sent</div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-white/55">Same release, same Friday. The email arrives when the track has actually unlocked for that fan.</p>
    </Panel>
  );
}

function LinksVisual() {
  const rows: { p: PlatformKey; note: string; flag?: boolean }[] = [
    { p: "beatport", note: "Exclusive until 14 Nov" },
    { p: "spotify", note: "Play" },
    { p: "bandcamp", note: "Not yet", flag: true },
  ];
  return (
    <Panel>
      <ExampleTag className="absolute right-5 top-5" />
      <p className="text-sm font-medium text-white/80">Two Step Theory · smart link</p>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.p} className={cn("flex items-center gap-3 rounded-xl border p-2.5 pr-3 text-sm", r.flag ? "border-amber-300/25 bg-amber-300/[0.05]" : "border-white/10 bg-white/[0.04]")}>
            <PlatformIcon platform={r.p} className="h-8 w-8 text-xs" />
            <span className="flex-1">{platformMeta(r.p).name}</span>
            <span className={cn("text-xs", r.flag ? "text-amber-100/90" : "text-white/60")}>{r.note}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-3 text-[13px] leading-snug text-amber-100/90">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Publishing the Bandcamp link now would break the Beatport exclusive, under your distributor&apos;s rules.</span>
      </div>
    </Panel>
  );
}

function GateVisual() {
  const steps = [
    { label: "Enter your email", note: "Joins your fan list", tone: "text-white/60" },
    { label: "Follow on SoundCloud", note: "Done for the fan, not just a link", tone: "text-violet-200" },
    { label: "Follow on Instagram", note: "On trust. Nobody can check this one", tone: "text-white/50" },
  ];
  return (
    <Panel>
      <ExampleTag className="absolute right-5 top-5" />
      <p className="text-sm font-medium text-white/80">Free download · Edit pack</p>
      <ul className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/15 text-xs text-white/70">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{s.label}</span>
              <span className={cn("block text-xs", s.tone)}>{s.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs text-white/55">How far people got</p>
        <div className="mt-2 space-y-1.5" aria-hidden>
          {[92, 74, 66].map((w, i) => <span key={i} className="block h-1.5 rounded-full bg-violet-400/70" style={{ width: `${w}%` }} />)}
        </div>
      </div>
    </Panel>
  );
}

function BioVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <ExampleTag className="absolute -right-2 -top-2 z-10" />
      <div className="rounded-[1.75rem] border border-white/10 bg-[#0f0f14] p-5 shadow-[0_40px_120px_-50px_rgba(139,92,246,.7)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/avatar.svg" alt="" width={56} height={56} loading="lazy" className="mx-auto h-14 w-14 rounded-full" />
        <div className="mt-3 text-center text-sm font-semibold">Your Artist</div>
        <div className="mt-2 flex justify-center gap-3 text-white/70">
          {(["instagram", "tiktok", "soundcloud", "youtube"] as PlatformKey[]).map((p) => {
            const logo = PLATFORM_LOGOS[p];
            return logo ? <svg key={p} viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current"><path d={logo.path} /></svg> : null;
          })}
        </div>
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DEMO_COVER} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 rounded-md" />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] uppercase tracking-[.18em] text-white/55">Out Friday</span>
            <span className="block truncate text-xs font-semibold">Two Step Theory</span>
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">Pre-save</span>
        </div>
        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/85">Tickets: Saturday show</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/video-still.svg" alt="" width={260} height={146} loading="lazy" className="mt-2 aspect-video w-full rounded-xl border border-white/10 object-cover" />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {["/demo/merch-tee.svg", "/demo/merch-hoodie.svg", "/demo/merch-vinyl.svg"].map((src) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={src} src={src} alt="" width={72} height={72} loading="lazy" className="aspect-square w-full rounded-lg border border-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}

function AudienceColumn({ title, items }: { title: string; items: { title: string; body: string }[] }) {
  return (
    <div className="mk-card p-7 md:p-8">
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <ol className="mt-6 space-y-5">
        {items.map((it, i) => (
          <li key={it.title} className="flex gap-4">
            <span className="mt-0.5 font-mono text-xs text-violet-300/80">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <span className="block font-medium">{it.title}</span>
              <span className="mt-1 block text-[15px] leading-relaxed text-white/65">{it.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Page ---------- */

/** Title and description come from the layout; a UTM-tagged share must still point here. */
export const metadata = { alternates: { canonical: "/" } };

/** The questions shown open on the page; the rest sit behind "More questions". */
const TOP_FAQ = 7;

export default function Landing() {
  const cta = ctaCopy();
  const tiers = pricingTiers();
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "Is droplr.fm for artists or labels?",
      a: <p>Both. Artists run their own releases, fan list and promo plan. Labels run a roster, with artist logins and analytics across every release. Pick artist or label when you sign up.</p>,
    },
    {
      q: "Do Spotify pre-saves go straight into fans' libraries?",
      a: (
        <>
          <p>Not for most fans, and I&apos;d rather say so now than have you find out on release day. Since February 2026, Spotify only lets a new app save music for 5 people you allowlist by hand. Lifting that needs Spotify&apos;s Extended Quota, which is only for registered businesses with 250,000+ monthly users. Any newer pre-save service without that approval has the same limit.</p>
          <p className="mt-3">So droplr.fm is built around what works for every fan: an email pre-save where they choose their store, a release-day email at 9am in their own timezone, and a Follow on Spotify button so new releases show up for them in Spotify. <Link href="/docs/spotify-byo" className="text-foreground underline underline-offset-4">How it works</Link></p>
        </>
      ),
    },
    {
      q: "What's the catch on Free?",
      a: <p>Free covers {PLAN_LIMITS.free.releases} new releases in any 12 months — a rolling window, not a calendar-year reset — and emails the first {PLAN_LIMITS.free.releaseEmails} pre-savers of each release on release day. Fans past that still pre-save and never see an error; you&apos;ll see how many missed out and can upgrade before release day. Links and pages never switch off.</p>,
    },
    {
      q: "Can I email my fans about other things?",
      a: <p>Fans who tick the optional &quot;news and new music&quot; box are yours to email. Fans who only pre-saved agreed to hear about that release, and droplr sends that email for you. The fan list shows which is which, and exports it as CSV on a paid plan.</p>,
    },
    {
      q: "It's one person. What happens to my stuff if you stop?",
      a: (
        <>
          <p>Fair question, and the honest answer is the reason droplr exists. One person runs it, and droplr has no investors to outlast — it stays up on what subscriptions pay for.</p>
          <p className="mt-3">So here is exactly what you walk away with, on every plan including Free. Your fan list is yours: every address is visible on Free and exports as CSV on any paid plan, with the consent each person gave and the date they gave it. None of that has to be asked for. The one thing that doesn&apos;t outlive droplr is a link on droplr itself, which is exactly why the list matters.</p>
          <p className="mt-3">That matters because of what has already happened to other people. smartURL was bought and its analytics closed on migration. Songwhip shut down and the links in people&apos;s bios stopped resolving. Songlink switched off its API with about six weeks&apos; notice. Every time, the fan data was the part people couldn&apos;t get back. <strong className="text-foreground">Take your list with you now, not when you need it.</strong></p>
        </>
      ),
    },
    { q: "What currency are the prices in?", a: <p>Australian dollars (AUD), including any tax. Paid plans are billed monthly or yearly and you can cancel any time. No per-release fees.</p> },
    {
      q: "Can I customise how my release page looks?",
      a: (
        <>
          <p>More than people expect, and less than a page builder. Your bio page gets one of four looks and one of four fonts on every plan, and release and download pages get them from Artist. Each look comes with an accent colour taken from your artwork or picked by hand, your own text, button and glow colours, and a background image you can blur. Light, dark or following the fan&apos;s phone is free on every page. Add your own logo, and from Artist Pro run it all on your own domain. <Link href="/demo/demo-track" className="text-foreground underline underline-offset-4">Try the looks on the demo</Link>. Every link is yours to shape: its title, its button text (<em>Play</em>, <em>Buy</em>, <em>Tickets</em>, <em>Dubplate Download</em>, whatever you type), its icon, whether it shows at all, and the order they sit in.</p>
          <p className="mt-3">What you don&apos;t get is custom CSS or a free-form layout, and that is a decision rather than a gap. A fan is on that page for about four seconds, on a phone, half way through scrolling, looking for the store they already use. Hand-written CSS is how link pages end up slow and broken on a three-year-old Android, and the page has one job.</p>
          <p className="mt-3">If the shape is stopping you doing something specific — <a href={`mailto:${CONTACT.hello}`} className="text-foreground underline underline-offset-4">tell me what you&apos;re trying to build</a>. It&apos;s one person here, which is a downside in plenty of ways, but it does mean the person you&apos;re asking is the person who can build it.</p>
        </>
      ),
    },
    {
      q: "I have a side project, or I look after a mate. Do I need the Label plan?",
      a: (
        <>
          <p>No. The artist plans cover one artist on purpose, but the step up is <strong className="text-foreground">Pro at A${PLAN_LIMITS.pro.price} a month</strong> — A${(PLAN_LIMITS.pro.price ?? 0) - (PLAN_LIMITS.artist_pro.price ?? 0)} more than Artist Pro — and it carries up to {PLAN_LIMITS.pro.artists} artists, each with their own profile, their own fan list, their own stats, and their own login if you want to hand one over.</p>
          <p className="mt-3">One honest wrinkle: a profile set up as an artist account has to be switched to the roster type before it can take the Pro plan, and that switch isn&apos;t self-serve yet — <a href={`mailto:${CONTACT.hello}`} className="text-foreground underline underline-offset-4">email me</a> and I&apos;ll do it. If you&apos;re already paying, the current subscription has to finish first so the plan and the account type don&apos;t disagree.</p>
        </>
      ),
    },
    {
      q: "What if I go quiet for six months?",
      a: (
        <>
          <p>Two things are already on your side. The release limit runs over <strong className="text-foreground">any rolling 12 months</strong>, not a calendar year, so a hiatus doesn&apos;t burn slots — they come back on their own anniversaries. And the yearly price is two months free, which is the cheapest way to cover the months you&apos;re not releasing.</p>
          <p className="mt-3">There&apos;s no pause button, and I&apos;d rather say that than imply one. If you cancel, nothing is deleted: your pages and links stay up, your fan list stays yours, and a custom domain keeps serving for {CUSTOM_DOMAIN_GRACE_DAYS} days before those links start redirecting to droplr.fm. The DNS record stays valid, so coming back later is re-subscribing, not setting it all up again.</p>
        </>
      ),
    },
    {
      q: "I already have a fan list somewhere else. Can I bring it?",
      a: (
        <>
          <p>Yes. Import a CSV from wherever your list lives now — a gate service, a mailing tool, a spreadsheet — and droplr records where each contact came from and what they agreed to, because the law asks who consented and when, not which tool was open at the time.</p>
          <p className="mt-3">Imported contacts are kept separate from fans who pre-saved here, and they are <strong className="text-foreground">never</strong> included in a release-day send. They can only be reached by a news email you write yourself. The best thing to send them is your pre-save link: the ones who sign up become fans with fresh consent, collected here.</p>
        </>
      ),
    },
    {
      q: "My store isn't on the list. Can I add it?",
      a: (
        <>
          <p>Yes. droplr fills in the big stores from the UPC or ISRC as they appear, and anything it can&apos;t look up you add by hand — Beatport, Traxsource, Juno, Bandcamp, Qobuz, Boomplay, Anghami and the rest are all there, and droplr sends you straight to that store&apos;s search page to find the link.</p>
          <p className="mt-3">Past those, there&apos;s a <strong className="text-foreground">custom link</strong>: any URL at all, with your own title and your own button text. Vinyl on a distro site, a regional store nobody has heard of, a download gate, your merch. Automatic where it can be, typed in where it can&apos;t, and the order on the page is yours.</p>
        </>
      ),
    },
    {
      q: "Can I use my own domain?",
      a: <p>Yes, on Artist Pro and the label plans. Point a subdomain like music.yourname.com at droplr.fm with one DNS record, and droplr verifies it and issues the certificate for you. <Link href="/docs/custom-domain" className="text-foreground underline underline-offset-4">Domain setup</Link></p>,
    },
    {
      q: "Can a label's artists log in?",
      a: <p>Yes. Labels invite artists from the roster; artists get their own login to copy their links and see stats for their releases. Pro includes up to {PLAN_LIMITS.pro.artists} artists, Label has no limit.</p>,
    },
    {
      q: "Is there a phone app?",
      a: <p>Yes, without the App Store. Open your dashboard on your phone and add it to your Home Screen (Safari or Chrome on iPhone, Chrome on Android). It opens full screen and can notify you about pre-save milestones, release day and replies from me.</p>,
    },
    ...(cta.open
      ? []
      : [{ q: "Can anyone sign up?", a: <p>Not yet. I&apos;m onboarding a small group of artists and labels first. <Link href={cta.primary.href} className="text-foreground underline underline-offset-4">Request early access</Link>, or email {CONTACT.hello}. Have an invite? <Link href={cta.hint!.link.href} className="text-foreground underline underline-offset-4">Sign up</Link>.</p> }]),
  ];
  // Ordered by what someone deciding needs first. Every answer is unchanged.
  const ORDER = [
    "Do Spotify pre-saves go straight into fans' libraries?",
    "What's the catch on Free?",
    "Is droplr.fm for artists or labels?",
    "It's one person. What happens to my stuff if you stop?",
    "Can I customise how my release page looks?",
    "I already have a fan list somewhere else. Can I bring it?",
    "Can I use my own domain?",
  ];
  const ordered = [...ORDER.map((q) => faqs.find((f) => f.q === q)).filter((f): f is (typeof faqs)[number] => !!f), ...faqs.filter((f) => !ORDER.includes(f.q))];
  const shown = ordered.slice(0, TOP_FAQ);
  const more = ordered.slice(TOP_FAQ);
  const faqItem = (f: (typeof faqs)[number]) => (
    <details key={f.q} className="group px-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
        <span>{f.q}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-white/55 transition-transform duration-300 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-6 text-[15px] leading-relaxed text-white/65">{f.a}</div>
    </details>
  );

  return (
    <MarketingShell>
      <JsonLd data={siteJsonLd(SITE_URL)} />
      <RevealOnScroll />
      <SectionScrollTarget />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="mk-grid-bg pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -top-1/3 left-1/2 h-[900px] w-[1200px] -translate-x-1/2" style={{ background: "radial-gradient(40% 40% at 40% 40%, rgba(139,92,246,.32), transparent 70%), radial-gradient(30% 30% at 65% 55%, rgba(139,92,246,.12), transparent 70%)" }} />
        <div className="container relative grid items-center gap-10 pb-16 pt-12 md:pt-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-6 lg:pb-24">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden /> For independent artists and the labels behind them
            </p>
            <h1 className="mk-text-gradient mt-6 text-balance text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[4.25rem]">
              Every release, launched properly.
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/70">
              Pre-saves with a release-day email at 9am in each fan&apos;s own timezone. Smart links with Beatport and Bandcamp next to Spotify. Download gates, a bio page that keeps itself up to date, and a promo plan for every release. For one artist or a whole roster.
            </p>
            <Actions cta={cta} secondary={{ label: "See a live demo", href: "/demo/demo-track" }} className="mt-9" />
            <InviteHint cta={cta} className="mt-4" />
          </div>
          <HeroPhone />
        </div>
      </section>

      {/* Stores: one still row of real marks */}
      <section aria-label="Stores droplr links to" className="border-y border-white/5 bg-white/[0.015]">
        <div className="container flex flex-col items-center gap-5 py-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/55">The DJ stores, next to the big ones</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {STORE_ROW.map((p) => <StoreMark key={p} platform={p} />)}
          </ul>
        </div>
      </section>

      {/* Who built it. The only honest stand-in for testimonials droplr has, so it goes near the top. */}
      <section className="container pt-20 md:pt-24">
        <div className="mk-reveal mx-auto max-w-3xl text-center">
          <p className="text-balance text-2xl font-medium leading-snug tracking-[-0.015em] text-white/90 md:text-[1.75rem]">
            &ldquo;I built droplr for my own releases, because the tools I was using didn&apos;t know how dance music actually comes out: country by country, on DJ stores, often with an exclusive window.&rdquo;
          </p>
          <p className="mt-5 text-sm text-white/60">
            Cody Morrison (Ototo) · UK garage DJ and producer, runs Rhythm Revolt Records in Brisbane. It&apos;s just me, so when you email, you&apos;re talking to the person who can fix it.
          </p>
        </div>
      </section>

      {/* Product */}
      <section id="product" className="container scroll-mt-16 pt-16 md:pt-24">
        <div className="mk-reveal max-w-2xl">
          <Eyebrow>The product</Eyebrow>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Everything around the release, handled.</h2>
        </div>
        <div className="divide-y divide-white/5">
          <FeatureRow
            icon={Globe}
            kicker="Pre-saves that follow the sun"
            title="Out at midnight in every country. In their inbox at 9am their time."
            body={<>
              <p>Stores release country by country, so droplr does too. The page flips at midnight wherever the fan is, and the release-day email leads with the store they picked.</p>
              <p>Spotify only lets new apps save music for a handful of people, so droplr leads with an email pre-save that works for every fan, and a Follow button so you show up in their Spotify.</p>
            </>}
            link={{ href: "/docs/spotify-byo", label: "How pre-saves work" }}
            visual={<TimezoneVisual />}
          />
          <FeatureRow
            flip
            icon={LinkIcon}
            kicker="Smart links that know the release"
            title="Beatport and Bandcamp next to Spotify. And a warning before you break an exclusive."
            body={<>
              <p>Paste a Spotify link and the artwork, colour and store links fill in, DJ stores included. Unreleased is fine.</p>
              <p>Tell droplr a release is exclusive to Beatport and it warns you before a link breaks the window. It checks your barcode, ISRC and titles against what stores reject, too.</p>
            </>}
            visual={<LinksVisual />}
          />
          <FeatureRow
            icon={Download}
            kicker="Download gates"
            title="A free pack that grows a list you keep."
            body={<>
              <p>Put stems, an edit pack or an unreleased track behind an email or a follow. Connect your own SoundCloud app (it needs SoundCloud Artist Pro) and the follow and repost are actually done for the fan.</p>
              <p>Every step that can&apos;t be checked says so, and the file&apos;s address is never in the page.</p>
            </>}
            visual={<GateVisual />}
          />
          <FeatureRow
            flip
            icon={LinkIcon}
            kicker="Bio link"
            title="Between releases, it's still your page."
            body={<>
              <p>Your latest release sits at the top and changes by itself. Under it go your links, social icons, videos that play on the page and merch that opens your shop. Four looks, four fonts, your own colours.</p>
              <p>The bio page, looks included, is on every plan, including Free.</p>
            </>}
            link={{ href: "/demo/demo-track?view=bio", label: "See a demo bio page" }}
            visual={<BioVisual />}
          />
        </div>

        {/* Also included */}
        <div className="mk-reveal mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.02] p-6 md:p-10">
          <h3 className="text-lg font-semibold">Also in droplr</h3>
          <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {ALSO.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-white/60">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-[15px] sm:flex-row sm:items-center sm:justify-between">
            <span className="text-white/65">Not ready to sign up? The release plan is free, no account needed.</span>
            <Link href="/tools/release-plan" className="inline-flex items-center gap-1.5 font-medium text-violet-200 hover:text-white">Make your release plan <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>

      {/* Audience: both sides visible at once, no toggle */}
      <section className="container py-24 md:py-32">
        <div className="mk-reveal mb-10 max-w-2xl">
          <Eyebrow>Built for both sides</Eyebrow>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Going it alone, or running a roster.</h2>
        </div>
        <div className="mk-reveal grid gap-4 md:grid-cols-2">
          <AudienceColumn title="For artists" items={FOR_ARTISTS} />
          <AudienceColumn title="For labels" items={FOR_LABELS} />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative scroll-mt-16 overflow-hidden border-y border-white/5 bg-white/[0.015]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: "radial-gradient(50% 100% at 50% 0%, rgba(139,92,246,.16), transparent 70%)" }} />
        <div className="container relative py-24">
          <div className="mk-reveal mx-auto mb-10 max-w-2xl text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Priced per account, not per release.</h2>
            <p className="mt-4 text-white/65">Australian dollars, including tax. Every plan includes email pre-saves, the release-day email, promo plans and share graphics.</p>
          </div>
          <div className="mk-reveal"><AudiencePricing artist={tiers.artist} label={tiers.label} /></div>
          <p className="mt-8 text-center text-sm"><Link href="/pricing" className="inline-flex items-center gap-1.5 font-medium text-violet-200 hover:text-white">Compare every feature <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
        </div>
      </section>

      {/* Your fans stay yours */}
      <section className="container py-24">
        <div className="mk-reveal max-w-2xl">
          <Eyebrow>Your fans stay yours</Eyebrow>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">The list is yours, and so is the decision to leave.</h2>
        </div>
        <div className="mk-reveal mt-10 grid gap-4 md:grid-cols-3">
          <div className="mk-card p-6">
            <h3 className="font-semibold">Every address, on every plan</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/65">You can see every fan&apos;s address on every plan, Free included. Export to CSV is on the paid plans, and the whole list downloads on any plan when you close your account.</p>
          </div>
          <div className="mk-card p-6">
            <h3 className="font-semibold">Not used for anything else</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/65">droplr handles your fans only to run your pages. I don&apos;t sell them, use them for my own label, or mix them with anyone else&apos;s list. <Link href="/legal/data-processing" className="text-white underline decoration-white/30 underline-offset-4">Read the data processing terms</Link>.</p>
          </div>
          <div className="mk-card p-6">
            <h3 className="font-semibold">Straight answers</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/65">Closing your account is one confirmation, with no discount and no second ask. If droplr ever shut down, its links would stop working, which is why the list is always yours to take. Questions go to <a href={`mailto:${CONTACT.hello}`} className="text-white underline decoration-white/30 underline-offset-4">{CONTACT.hello}</a>.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container scroll-mt-16 pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="mk-reveal"><Eyebrow>FAQ</Eyebrow><h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em]">Questions people ask</h2></div>
          <div className="mk-reveal mt-10 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.02]">
            {shown.map(faqItem)}
          </div>
          {more.length > 0 && (
            <details className="group mk-reveal mt-4 rounded-3xl border border-white/10 bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-medium text-white/80 [&::-webkit-details-marker]:hidden">
                <span>More questions ({more.length})</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/55 transition-transform duration-300 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="divide-y divide-white/10 border-t border-white/10">{more.map(faqItem)}</div>
            </details>
          )}
          <p className="mk-reveal mt-8 text-[15px] text-white/65">
            Want to see what&apos;s live and what&apos;s coming? <Link href="/roadmap" className="font-medium text-violet-200 hover:text-white">Read the roadmap <ArrowRight className="inline h-4 w-4" aria-hidden /></Link>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-28">
        <div className="mk-reveal relative isolate overflow-hidden rounded-[2rem] border border-violet-400/25 px-6 py-16 text-center shadow-[0_0_120px_-40px_rgba(124,58,237,0.8)] sm:px-12">
          <div aria-hidden className="absolute -inset-1/2 -z-10" style={{ background: "radial-gradient(35% 35% at 45% 45%, rgba(139,92,246,.5), transparent 70%), radial-gradient(30% 30% at 60% 60%, rgba(139,92,246,.18), transparent 70%)" }} />
          <h2 className="mk-text-gradient mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Your next release deserves a proper launch.</h2>
          {cta.open && (
            <p className="mx-auto mt-4 max-w-lg text-white/70">Free for {PLAN_LIMITS.free.releases} releases in any 12 months, for artists and labels. Upgrade when you&apos;re ready.</p>
          )}
          <Actions cta={cta} secondary={{ label: "See pricing", href: "/pricing" }} className="mt-8 sm:justify-center" />
          <InviteHint cta={cta} className="mt-4" />
        </div>
      </section>
    </MarketingShell>
  );
}
