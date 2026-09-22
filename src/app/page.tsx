import Link from "next/link";
import { ArrowRight, BarChart3, CalendarCheck, ChevronDown, Globe, Image as ImageIcon, Mail, Users } from "lucide-react";
import { AudiencePricing, AudienceStory } from "@/components/marketing/audience-pricing";
import { RevealOnScroll } from "@/components/marketing/reveal";
import { SectionScrollTarget } from "@/components/marketing/section-link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { PlatformIcon } from "@/components/public/platform-icon";
import { Button } from "@/components/ui/button";
import { ctaCopy, type CtaCopy } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";
import { platformMeta } from "@/lib/platforms";
import { PLAN_LIMITS } from "@/lib/plans";
import { pricingTiers } from "@/lib/pricing-tiers";
import { cn } from "@/lib/utils";

const DEMO_COVER = "/demo/two-step-theory.svg";

/* ---------- Content ---------- */

const STORES = ["spotify", "appleMusic", "beatport", "youtubeMusic", "soundcloud", "traxsource", "bandcamp", "amazonMusic", "tidal", "deezer", "juno"];

const FOR_ARTISTS = [
  { title: "Make the release page", body: "Paste a Spotify link. Artwork, colour and store links fill in, unreleased is fine." },
  { title: "Follow the promo plan", body: "Dated steps from announce day to a week after, each with the graphic or link it needs." },
  { title: "Let release day run itself", body: "Every pre-saver gets an email at 9am in their own timezone, leading with the store they picked." },
  { title: "Keep the fans", body: "One fan list across every release. Put a free pack behind a download gate to start one, and the fans who opted in to news are yours to email again." },
];
const FOR_LABELS = [
  { title: "Run the whole roster", body: "Every release, every artist, one account. Artists log in to grab their links and see their stats." },
  { title: "A link per placement", body: "/ig, /tiktok, a QR on the flyer: each tracked, so you know which post moved people." },
  { title: "Your domain, connected for you", body: "presave.yourlabel.com with one DNS record. We verify it and issue the certificate." },
  { title: "See what works across releases", body: "Busiest hours, top countries, best sources and the stores fans actually use." },
];

type Status = "Live now" | "Next" | "Later";
const ROADMAP: { status: Status; items: { title: string; body: string }[] }[] = [
  { status: "Live now", items: [
    { title: "Artist accounts", body: "Artists run their own releases, fan list and promo plans, on Free, Artist or Artist Pro." },
    { title: "Download gates", body: "Put an edit pack, stems or an unreleased track behind a follow or an email. We say which steps are actually checked and which aren't." },
    { title: "Fan updates", body: "Email the fans who opted in to news, from your name, straight out of droplr." },
    { title: "Phone app and notifications", body: "Add your dashboard to your Home Screen and get a ping for pre-save milestones and release day." },
    { title: "Refer a friend", body: "A free month for each artist or label you bring who stays paid for 30 days, up to 3 a year." },
  ] },
  { status: "Next", items: [
    { title: "Release planning for teams", body: "Tasks assigned to the label or the artist, with reminders." },
    { title: "Pitch to labels", body: "Artists send a track to a label's private demo inbox; labels listen, rate and reply." },
  ] },
  { status: "Later", items: [
    { title: "Royalties and splits", body: "Import distributor statements, set splits and send artists clear statements." },
    { title: "Unsigned pool", body: "Artists opt in unreleased tracks; labels discover them by genre, BPM and traction." },
    { title: "Contracts", body: "Agreements kept next to the roster and the releases they cover." },
  ] },
];

/* ---------- Pieces ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/90">{children}</p>;
}

function Actions({ cta, secondary, className }: { cta: CtaCopy; secondary: { label: string; href: string }; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <Button asChild size="lg" variant="white" className="mk-shine relative h-12 overflow-hidden rounded-full px-6 text-[15px]">
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
    <p className={cn("text-sm text-white/55", className)}>
      {cta.hint.text}{" "}
      <Link href={cta.hint.link.href} className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">{cta.hint.link.label}</Link>
    </p>
  );
}

/** The phone rises in tilted, the artwork opens up and the link sheet slides over it, then it floats. */
function HeroPhone() {
  const links = ["spotify", "appleMusic", "beatport"];
  return (
    <div className="mk-phone-wrap relative mx-auto w-full max-w-[420px] py-6 [perspective:1600px]">
      <div aria-hidden className="absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,.45), rgba(217,70,239,.12) 55%, transparent 75%)" }} />
      <div className="mk-phone-float relative">
        <div className="mk-phone relative mx-auto w-[272px] rounded-[2.9rem] border border-white/15 bg-[#0a0a0d] p-2.5 shadow-[0_60px_140px_-40px_rgba(139,92,246,.75),inset_0_0_0_1px_rgba(255,255,255,.04)] sm:w-[292px]">
          <div className="absolute left-1/2 top-4 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
          <div className="relative h-[540px] overflow-hidden rounded-[2.35rem] bg-black sm:h-[570px]" style={{ background: "radial-gradient(120% 60% at 50% 0%, rgba(168,85,247,.55) 0%, rgba(236,72,153,.16) 45%, transparent 72%), #050507" }}>
            <div className="px-6 pt-12 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={DEMO_COVER} alt="Example release artwork" width={160} height={160} fetchPriority="high" decoding="async" className="mk-cover mx-auto aspect-square w-[150px] shadow-[0_30px_60px_-18px_rgba(168,85,247,.8)] sm:w-[160px]" />
              <p className="mt-3 text-[10px] uppercase tracking-[.24em] text-white/60">Out Friday</p>
              <p className="mt-1 text-lg font-semibold">Two Step Theory</p>
              <p className="text-xs text-white/60">Your Artist</p>
            </div>
            <div className="mk-sheet absolute inset-x-0 bottom-0 rounded-t-[1.75rem] border-t border-white/10 bg-[#0f0f14] px-4 pb-5 pt-3 shadow-[0_-20px_60px_-20px_rgba(0,0,0,.9)]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
              <div className="mk-stagger space-y-2">
                <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-white/40">you@email.com</div>
                <div>
                  <p className="mb-1.5 text-[10px] text-white/50">Where do you listen?</p>
                  <div className="flex flex-wrap gap-1">
                    {links.map((p, i) => (
                      <span key={p} className={cn("rounded-full border px-2 py-1 text-[10px]", i === 0 ? "border-white bg-white text-black" : "border-white/15 text-white/75")}>{platformMeta(p).name}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-white py-2.5 text-center text-xs font-semibold text-black">Pre-save with email</div>
                <div className="flex items-center gap-2 rounded-xl border border-[#1ED760]/30 bg-[#1ED760]/10 p-1.5 pr-2 text-xs">
                  <PlatformIcon platform="spotify" className="h-7 w-7 text-xs" />
                  <span className="flex-1 truncate">Follow on Spotify</span>
                  <span className="text-[10px] font-semibold text-[#1ED760]">Follow</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating proof points (desktop) */}
        <div className="mk-pop absolute -left-24 top-[46%] hidden w-56 rounded-2xl border border-white/10 bg-[#13111c]/90 p-3 text-xs shadow-2xl lg:block" style={{ animationDelay: "1.7s" }}>
          <div className="flex items-center gap-2 text-white/60"><Mail className="h-3.5 w-3.5 text-violet-300" /> Release-day email</div>
          <div className="mt-2 space-y-1.5">
            {[["Brisbane", "9:00am"], ["London", "9:00am"], ["Los Angeles", "9:00am"]].map(([c, t], i) => (
              <div key={c} className="flex justify-between"><span className="text-white/80">{c}</span><span className="mk-sweep font-medium tabular-nums text-emerald-300" style={{ animationDelay: `${i * 0.6}s` }}>{t}</span></div>
            ))}
          </div>
        </div>
        <div className="mk-pop absolute -right-16 -top-2 hidden w-52 rounded-2xl border border-white/10 bg-[#13111c]/90 p-3 text-xs shadow-2xl lg:block" style={{ animationDelay: "2s" }}>
          <div className="flex items-center justify-between gap-2 text-white/60"><span className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-violet-300" /> Busiest time</span><span className="text-[9px] uppercase tracking-wider text-white/35">Example</span></div>
          <p className="mt-1.5 text-sm font-semibold">Thu 7pm to 10pm</p>
          <div className="mt-2 grid grid-cols-12 gap-[2px]" aria-hidden>
            {Array.from({ length: 36 }, (_, i) => {
              const v = [1, 1, 2, 1, 2, 3, 2, 3, 4, 5, 4, 3][i % 12];
              return <span key={i} className="aspect-square rounded-[2px]" style={{ background: ["#1c1c21", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#9ec5f4"][v] }} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      {/* Timezones */}
      <div className="mk-card mk-reveal overflow-hidden p-6 md:col-span-4">
        <div className="flex items-center gap-2 text-sm text-violet-200"><Globe className="h-4 w-4" /> Pre-saves that follow the sun</div>
        <h3 className="mt-3 max-w-md text-2xl font-semibold tracking-tight">Out at midnight in every country. In their inbox at 9am their time.</h3>
        <p className="mt-2 max-w-lg text-sm text-white/60">Stores release country by country, so droplr does too. The page flips, Spotify saves land and the release-day email arrives when the track has actually unlocked for that fan.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[["Brisbane", "Fri 25 Sep", "+10:00"], ["London", "Fri 25 Sep", "+01:00"], ["Los Angeles", "Fri 25 Sep", "−07:00"]].map(([city, day, off], i) => (
            <div key={city} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between text-xs text-white/50"><span>{city}</span><span className="font-mono">{off}</span></div>
              <div className="mt-3 text-3xl font-semibold tabular-nums">9:00<span className="text-base text-white/50">am</span></div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300"><span className="mk-sweep h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animationDelay: `${i * 0.7}s` }} /> {day} · email sent</div>
            </div>
          ))}
        </div>
      </div>
      {/* Insights */}
      <div className="mk-card mk-reveal p-6 md:col-span-2">
        <div className="flex items-center gap-2 text-sm text-violet-200"><BarChart3 className="h-4 w-4" /> Insights</div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">Know exactly when to post.</h3>
        <p className="mt-2 text-sm text-white/60">When fans are active in their own time, where they are, and which source converts.</p>
        <div className="mt-5 grid grid-cols-12 gap-[3px]" aria-hidden>
          {Array.from({ length: 84 }, (_, i) => {
            const h = i % 12;
            const d = Math.floor(i / 12);
            const v = Math.min(5, Math.max(0, Math.round(((h >= 7 ? 3 : 1) + (d === 3 || d === 5 ? 2 : 0) + ((i * 7) % 3) - 1))));
            return <span key={i} className="aspect-square rounded-[3px]" style={{ background: ["#1c1c21", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#9ec5f4"][v] }} />;
          })}
        </div>
      </div>
      {/* Share graphics */}
      <div className="mk-card mk-reveal overflow-hidden p-6 md:col-span-2">
        <div className="flex items-center gap-2 text-sm text-violet-200"><ImageIcon className="h-4 w-4" /> Share graphics</div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">Stories that make themselves.</h3>
        <p className="mt-2 text-sm text-white/60">Countdown, out now and pre-save milestones, sized for Instagram, made from your artwork.</p>
        <div className="relative mt-6 flex h-40 items-end justify-center" aria-hidden>
          {[{ r: -10, x: -46, t: "7 days to go" }, { r: 0, x: 0, t: "Out now" }, { r: 10, x: 46, t: "500 pre-saves" }].map((c, i) => (
            <div key={c.t} className="absolute bottom-0 flex h-36 w-20 flex-col items-center justify-end rounded-xl border border-white/15 p-2 shadow-xl" style={{ transform: `translateX(${c.x}px) rotate(${c.r}deg)`, zIndex: i === 1 ? 2 : 1, background: "radial-gradient(90% 60% at 50% 20%, rgba(168,85,247,.7), rgba(15,15,20,1) 75%)" }}>
              <span className="mb-auto mt-2 aspect-square w-12 rounded-md bg-[linear-gradient(135deg,#f0abfc,#7c3aed)]" />
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[7px] font-bold text-black">{c.t}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Promo plan */}
      <div className="mk-card mk-reveal p-6 md:col-span-2">
        <div className="flex items-center gap-2 text-sm text-violet-200"><CalendarCheck className="h-4 w-4" /> Promo plan</div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">What to post, and when.</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {[["Announce + countdown graphic", true], ["Pitch to Spotify editors", true], ["Teaser clip at your busiest hour", false], ["Release day: out now", false]].map(([t, done]) => (
            <li key={t as string} className="flex items-center gap-2.5">
              <span className={cn("grid h-4 w-4 place-items-center rounded border text-[10px]", done ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/25")}>{done ? "✓" : ""}</span>
              <span className={done ? "text-white/45 line-through" : "text-white/85"}>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Fan list */}
      <div className="mk-card mk-reveal p-6 md:col-span-2">
        <div className="flex items-center justify-between gap-2 text-sm text-violet-200"><span className="flex items-center gap-2"><Users className="h-4 w-4" /> Fan list</span><span className="text-[10px] uppercase tracking-wider text-white/40">Example</span></div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">Fans you keep, not rent.</h3>
        <p className="mt-2 text-sm text-white/60">Every pre-saver across every release, with the store they use, where they are and whether they opted in to news.</p>
        <div className="mt-5 flex items-end gap-6">
          <div><div className="text-3xl font-semibold tabular-nums">2,418</div><div className="text-xs text-white/50">fans</div></div>
          <div><div className="text-3xl font-semibold tabular-nums text-emerald-300">61%</div><div className="text-xs text-white/50">opted in to news</div></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

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
          <p>Not for most fans, and we&apos;d rather say so now than have you find out on release day. Since February 2026, Spotify only lets a new app save music for 5 people you allowlist by hand. Lifting that needs Spotify&apos;s Extended Quota, which is only for registered businesses with 250,000+ monthly users. Any newer pre-save service without that approval has the same limit.</p>
          <p className="mt-3">So droplr.fm is built around what works for every fan: an email pre-save where they choose their store, a release-day email at 9am in their own timezone, and a Follow on Spotify button so new releases show up for them in Spotify. <Link href="/docs/spotify-byo" className="text-foreground underline underline-offset-4">How it works</Link></p>
        </>
      ),
    },
    {
      q: "What's the catch on Free?",
      a: <p>Free covers {PLAN_LIMITS.free.releases} new releases a year and emails the first {PLAN_LIMITS.free.releaseEmails} pre-savers of each release on release day. Fans past that still pre-save and never see an error; you&apos;ll see how many missed out and can upgrade before release day. Links and pages never switch off.</p>,
    },
    {
      q: "Can I email my fans about other things?",
      a: <p>Fans who tick the optional &quot;news and new music&quot; box are yours to email. Fans who only pre-saved agreed to hear about that release, and droplr sends that email for you. The fan list shows which is which and exports it as CSV.</p>,
    },
    { q: "What currency are the prices in?", a: <p>Australian dollars (AUD), including any tax. Paid plans are billed monthly or yearly and you can cancel any time. No per-release fees.</p> },
    {
      q: "Can I use my own domain?",
      a: <p>Yes, on Artist Pro and the label plans. Point a subdomain like music.yourname.com at droplr.fm with one DNS record, and we verify it and issue the certificate for you. <Link href="/docs/custom-domain" className="text-foreground underline underline-offset-4">Domain setup</Link></p>,
    },
    {
      q: "Can a label's artists log in?",
      a: <p>Yes. Labels invite artists from the roster; artists get their own login to copy their links and see stats for their releases. Pro includes up to {PLAN_LIMITS.pro.artists} artists, Label has no limit.</p>,
    },
    {
      q: "Is there a phone app?",
      a: <p>Yes, without the App Store. Open your dashboard on your phone and add it to your Home Screen (Safari or Chrome on iPhone, Chrome on Android). It opens full screen and can notify you about pre-save milestones, release day and replies from the droplr team.</p>,
    },
    ...(cta.open
      ? []
      : [{ q: "Can anyone sign up?", a: <p>Not yet. We&apos;re onboarding a small group of artists and labels first. <Link href={cta.primary.href} className="text-foreground underline underline-offset-4">Request early access</Link>, or email {CONTACT.hello}. Have an invite? <Link href={cta.hint!.link.href} className="text-foreground underline underline-offset-4">Sign up</Link>.</p> }]),
  ];

  return (
    <MarketingShell>
      <RevealOnScroll />
      <SectionScrollTarget />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="mk-grid-bg pointer-events-none absolute inset-0" />
        <div aria-hidden className="mk-aurora pointer-events-none absolute -top-1/3 left-1/2 h-[900px] w-[1200px] -translate-x-1/2" style={{ background: "radial-gradient(40% 40% at 40% 40%, rgba(139,92,246,.35), transparent 70%), radial-gradient(30% 30% at 65% 55%, rgba(217,70,239,.18), transparent 70%)" }} />
        <div className="container relative grid items-center gap-10 pb-16 pt-14 md:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-6 lg:pb-24">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden /> For independent artists and the labels behind them
            </p>
            <h1 className="mk-text-gradient mt-6 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              Launch every release like a label would.
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-white/65">
              Pre-saves that land at 9am in every fan&apos;s timezone. Smart links with the DJ stores. A promo plan that tells you what to post and when, and a fan list you keep.
            </p>
            <Actions cta={cta} secondary={{ label: "See a live demo", href: "/demo/demo-track" }} className="mt-9" />
            <InviteHint cta={cta} className="mt-4" />
          </div>
          <HeroPhone />
        </div>
      </section>

      {/* Store marquee */}
      <section aria-label="Stores and platforms" className="border-y border-white/5 bg-white/[0.015] py-6">
        <div className="mk-mask-x overflow-hidden">
          <div className="mk-marquee flex w-max gap-3">
            {[...STORES, ...STORES].map((p, i) => (
              <span key={`${p}-${i}`} aria-hidden={i >= STORES.length} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-4 text-sm text-white/70">
                <PlatformIcon platform={p} className="h-6 w-6 text-[10px]" /> {platformMeta(p).name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Product */}
      <section id="product" className="container scroll-mt-16 py-24">
        <div className="mk-reveal max-w-2xl">
          <Eyebrow>The product</Eyebrow>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Everything around the release, handled.</h2>
          <p className="mt-4 text-lg text-white/60">Built from what independent releases actually need: reach, timing, and fans you get to keep.</p>
        </div>
        <div className="mt-12"><Bento /></div>
      </section>

      {/* Audience */}
      <section className="border-y border-white/5 bg-white/[0.015]">
        <div className="container py-24">
          <div className="mk-reveal mb-10 max-w-2xl">
            <Eyebrow>Built for both sides</Eyebrow>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Going it alone, or running a roster.</h2>
          </div>
          <div className="mk-reveal"><AudienceStory artist={FOR_ARTISTS} label={FOR_LABELS} /></div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="container scroll-mt-16 py-24">
        <div className="mk-reveal max-w-2xl">
          <Eyebrow>Where it&apos;s going</Eyebrow>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">From your first <span className="whitespace-nowrap">pre-save</span> to getting signed.</h2>
          <p className="mt-4 text-lg text-white/60">What&apos;s shipped, and the order we&apos;re building the rest in. Dates when things ship, not before.</p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {ROADMAP.map((col) => (
            <div key={col.status} className={cn("mk-card mk-reveal p-6", col.status === "Live now" && "border-emerald-400/30 bg-[linear-gradient(180deg,rgba(52,211,153,.10),rgba(52,211,153,.015))]", col.status === "Next" && "border-violet-400/40 bg-[linear-gradient(180deg,rgba(139,92,246,.12),rgba(139,92,246,.02))]")}>
              <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", col.status === "Live now" ? "border-emerald-300/40 text-emerald-100" : col.status === "Next" ? "border-violet-300/40 text-violet-100" : "border-white/15 text-white/70")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", col.status === "Live now" ? "bg-emerald-400" : col.status === "Next" ? "mk-sweep bg-violet-300" : "bg-white/40")} aria-hidden />
                {col.status}
              </span>
              <ul className="mt-5 space-y-5">
                {col.items.map((it) => (
                  <li key={it.title}>
                    <h3 className="font-semibold">{it.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/60">{it.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative scroll-mt-16 overflow-hidden border-y border-white/5 bg-white/[0.015]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: "radial-gradient(50% 100% at 50% 0%, rgba(139,92,246,.18), transparent 70%)" }} />
        <div className="container relative py-24">
          <div className="mk-reveal mx-auto mb-10 max-w-2xl text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Priced per account, not per release.</h2>
            <p className="mt-4 text-white/60">Australian dollars, including tax. Every plan includes email pre-saves, the release-day email, promo plans and share graphics.</p>
          </div>
          <div className="mk-reveal"><AudiencePricing artist={tiers.artist} label={tiers.label} /></div>
          <p className="mt-8 text-center text-sm"><Link href="/pricing" className="inline-flex items-center gap-1.5 font-medium text-violet-200 hover:text-white">Compare every feature <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container scroll-mt-16 py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mk-reveal"><Eyebrow>FAQ</Eyebrow><h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em]">Questions people ask</h2></div>
          <div className="mk-reveal mt-10 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.02]">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                  <span>{f.q}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform duration-300 group-open:rotate-180" aria-hidden />
                </summary>
                <div className="pb-6 text-sm leading-relaxed text-white/60">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-28">
        <div className="mk-reveal relative isolate overflow-hidden rounded-[2rem] border border-violet-400/25 px-6 py-16 text-center shadow-[0_0_120px_-40px_rgba(124,58,237,0.8)] sm:px-12">
          <div aria-hidden className="mk-aurora absolute -inset-1/2 -z-10" style={{ background: "radial-gradient(35% 35% at 45% 45%, rgba(139,92,246,.55), transparent 70%), radial-gradient(30% 30% at 60% 60%, rgba(217,70,239,.25), transparent 70%)" }} />
          <h2 className="mk-text-gradient mx-auto max-w-2xl text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Your next release deserves a proper launch.</h2>
          <p className="mx-auto mt-4 max-w-lg text-white/65">
            {cta.open ? `Free for ${PLAN_LIMITS.free.releases} releases a year, for artists and labels. Upgrade when you're ready.` : "Invite-only while we onboard our first artists and labels."}
          </p>
          <Actions cta={cta} secondary={{ label: "See pricing", href: "/pricing" }} className="mt-8 sm:justify-center" />
          <InviteHint cta={cta} className="mt-4" />
        </div>
      </section>
    </MarketingShell>
  );
}
