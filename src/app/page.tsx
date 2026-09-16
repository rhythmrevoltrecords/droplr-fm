import Link from "next/link";
import { ArrowRight, AtSign, BarChart3, Check, Disc3, Globe, KeyRound, Mail, Minus, Users, Wand2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { PlatformIcon } from "@/components/public/platform-icon";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Wand2, title: "One paste, stores fill in", body: "Paste a Spotify link and your UPC. We pull title, artwork and colour, and Apple Music and Deezer links fill in on release day. Add Beatport, Traxsource and Bandcamp once." },
  { icon: Mail, title: "Email pre-save + release-day email", body: "Fans leave their email before the drop. At release time we email them a one-tap link to save it, and track who clicked through." },
  { icon: KeyRound, title: "BYO Spotify app for true saves", body: "Connect your own Spotify developer app and pre-saves go straight into fans' libraries on release day, under your app and your quota." },
  { icon: Disc3, title: "Beatport, Traxsource & Bandcamp up top", body: "DJ stores get the same big button as Spotify. Drag them into any order, hide a link without deleting it, and add custom buttons like Merch & Vinyl or Dubplate Download." },
  { icon: Users, title: "Label view + artist logins", body: "The label sees the whole roster. Artists log in to copy their IG, TikTok and bio links and see their own stats. Only the label edits URLs." },
  { icon: BarChart3, title: "Own your data + label-level pixels", body: "Set Meta, TikTok and GA4 once for the label. Clicks, sources, countries and pre-save emails are yours to export." },
  { icon: Globe, title: "Your domain", body: "presave.yourlabel.com/track-name. Your brand in the URL, not ours." },
  { icon: AtSign, title: "Link variants + QR", body: "/ig, /tiktok, /bio and any custom placement, each with its own QR, so you know which post actually moved people." },
];

type Cell = boolean | string;
const COMPARE: { row: string; droplr: Cell; ffm: Cell }[] = [
  { row: "Monthly price for a label roster", droplr: "$29 (5 artists) · $79 (unlimited)", ffm: "$99 Marketer · $199 Pro Marketer" },
  { row: "Custom domain", droplr: "Pro, $29", ffm: "Pro Marketer, $199" },
  { row: "Fan email access", droplr: "Unlimited + CSV on Pro", ffm: "250 per link on Marketer" },
  { row: "Label-level retargeting pixels", droplr: true, ffm: true },
  { row: "True Spotify pre-save for every fan", droplr: "Bring your own app (Spotify caps dev apps at 5 users)", ffm: "Included" },
];

function Mark({ v }: { v: Cell }) {
  if (v === true) return <Check className="mx-auto h-4 w-4 text-emerald-400" />;
  if (v === "—") return <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;
  return <span>{v}</span>;
}

function PhoneMock() {
  const links = ["spotify", "appleMusic", "beatport", "traxsource", "bandcamp"];
  return (
    <div className="relative mx-auto w-[280px] rounded-[2.5rem] border border-white/10 bg-black p-3 shadow-[0_40px_120px_-30px_rgba(168,85,247,.6)]">
      <div className="relative overflow-hidden rounded-[2rem] bg-black px-4 pb-6 pt-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/cover-art?title=Two%20Step%20Theory&a=%237C3AED&b=%23EC4899" alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black" />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/cover-art?title=Two%20Step%20Theory&a=%237C3AED&b=%23EC4899" alt="Example release artwork" className="mx-auto aspect-square w-44 rounded-xl" />
          <p className="mt-3 text-center text-[10px] uppercase tracking-[.2em] text-white/60">Out now</p>
          <p className="text-center font-semibold">Two Step Theory</p>
          <p className="text-center text-xs text-white/70">Your Artist</p>
          <div className="mt-4 space-y-2">
            {links.map((p) => (
              <div key={p} className="glass flex items-center gap-2 rounded-xl p-1.5 pr-2 text-xs">
                <PlatformIcon platform={p} className="h-7 w-7 text-xs" />
                <span className="flex-1 capitalize">{p === "appleMusic" ? "Apple Music" : p}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-black">{["beatport", "traxsource", "bandcamp"].includes(p) ? "Buy" : "Play"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        {/* Hero glow — masked so it fades out instead of cutting off at the section edge */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent)] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
          <div className="absolute inset-0 bg-[radial-gradient(70%_65%_at_50%_0%,rgba(139,92,246,.45),transparent_70%)]" />
          <div className="absolute left-1/2 top-[-120px] h-[640px] w-[1100px] max-w-[140vw] -translate-x-1/2 rounded-full bg-violet-500/25 blur-[120px]" />
          <div className="absolute right-[5%] top-[20%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/20 blur-[110px]" />
        </div>
        <div className="container relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Built for Spotify&apos;s 2026 API rules
            </p>
            <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-6xl">The Pre-Save Platform Built for Labels in 2026</h1>
            <p className="mt-5 max-w-xl text-balance text-lg text-muted-foreground">
              Spotify changed the rules: true pre-saves now need your own developer app. droplr.fm is built around bring-your-own-app, plus email capture that converts when you don&apos;t have quota.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Capture fans before release, auto-email them on drop day. No per-release fees. Beatport, Bandcamp &amp; Traxsource included.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="white"><Link href="/signup">Start free <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/demo/demo-track">See a live demo</Link></Button>
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>

      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="container grid gap-8 py-14 md:grid-cols-3">
          {[
            ["1", "Paste the Spotify link", "From Spotify for Artists → Upcoming. Unreleased is fine."],
            ["2", "Share the variants", "/ig in your story, /tiktok in bio, QR on the flyer. Every source is tracked."],
            ["3", "Drop day runs itself", "Apple Music and Deezer fill in from your UPC, BYO saves land in libraries, and every pre-saver gets the email."],
          ].map(([n, t, b]) => (
            <div key={n} className="flex gap-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-black">{n}</span>
              <div><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-muted-foreground">{b}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="container py-20">
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Label-first, not artist-first</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">One account runs the whole roster: the links, the data and the artist logins.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition duration-300 hover:border-violet-500/30 hover:bg-violet-500/[0.05] hover:shadow-[0_0_48px_-12px_rgba(139,92,246,0.5)]"
            >
              <f.icon className="h-5 w-5 text-violet-400" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container pb-20">
        <h2 className="text-3xl font-bold tracking-tight">droplr.fm vs Feature.fm for labels</h2>
        <p className="mt-2 text-sm text-muted-foreground">Compared with Feature.fm&apos;s business plans as listed on feature.fm/pricing, checked 15 September 2026. Prices USD/month.</p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-white/[0.03] text-left">
              <tr><th className="p-4 font-medium text-muted-foreground" /><th className="p-4 text-center font-semibold">droplr.fm</th><th className="p-4 text-center font-medium text-muted-foreground">Feature.fm</th></tr>
            </thead>
            <tbody>
              {COMPARE.map((c) => (
                <tr key={c.row} className="border-t border-white/5">
                  <td className="p-4 font-medium">{c.row}</td>
                  <td className="p-4 text-center"><Mark v={c.droplr} /></td>
                  <td className="p-4 text-center text-muted-foreground"><Mark v={c.ffm} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="container pb-24">
        <div className="relative isolate overflow-hidden rounded-3xl border border-violet-500/30 bg-[radial-gradient(90%_130%_at_50%_0%,rgba(139,92,246,.6)_0%,rgba(124,58,237,.25)_40%,rgba(12,10,20,.6)_75%),radial-gradient(60%_80%_at_50%_120%,rgba(217,70,239,.25),transparent_70%)] p-10 text-center shadow-[0_0_100px_-30px_rgba(124,58,237,0.7)]">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-40%] -z-10 h-[140%] w-[70%] -translate-x-1/2 rounded-full bg-violet-500/30 blur-[90px]" />
          <h2 className="text-balance text-3xl font-bold tracking-tight">Your next release, your fans&apos; emails.</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">Free for 3 releases. Upgrade when the roster grows.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="lg" variant="white"><Link href="/signup">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pricing">Pricing</Link></Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
