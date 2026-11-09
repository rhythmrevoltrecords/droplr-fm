import Link from "next/link";
import { SectionScrollTarget } from "@/components/marketing/section-link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { EmailCard, ExclusiveWarning, PreSavePhone, ShowcaseSprite, SmartLinkPhone, Use } from "@/components/marketing/showcase/pieces";
import { ShowcaseMotion } from "@/components/marketing/showcase/showcase-motion";
import { ShowcasePricing, type ShowcasePlan } from "@/components/marketing/showcase/showcase-pricing";
import "@/components/marketing/showcase/showcase.css";
import { JsonLd } from "@/components/seo/json-ld";
import { ctaCopy, domainsOpen, type CtaCopy } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";
import { artistsLine, clicksLine, downloadsLine, emailsLine, insightsLine, planPrice, releasesLine, yearlyPrice } from "@/lib/plan-copy";
import { PLAN_LIMITS, type PlanKey } from "@/lib/plans";
import { pricingTiers } from "@/lib/pricing-tiers";
import { SITE_URL } from "@/lib/env";
import { siteJsonLd } from "@/lib/structured-data";

/**
 * The homepage: the approved "Showcase" design (concept R2-2). One composition of three fan-facing
 * pieces is the hero, and scrolling separates it into three chapters (ShowcaseMotion). Every price
 * and limit below is read from PLAN_LIMITS or pricingTiers(), and every claim is one the product
 * makes good on; the comments say where each one is checked.
 */

/** Title and description come from the layout; a UTM-tagged share must still point here. */
export const metadata = { alternates: { canonical: "/" } };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The two doors: artist and label. While signups are closed both lead to the waitlist, so it is one button and the invite hint. */
function Doors({ cta }: { cta: CtaCopy }) {
  if (!cta.open) {
    return (
      <>
        <div className="sc-doors">
          <Link className="sc-btn sc-btn-primary" href={cta.primary.href}>{cta.primary.label} <Use id="arrow" /></Link>
        </div>
        {cta.hint && <p className="sc-hint">{cta.hint.text} <Link href={cta.hint.link.href}>{cta.hint.link.label}</Link></p>}
      </>
    );
  }
  return (
    <div className="sc-doors">
      <Link className="sc-btn sc-btn-primary" href="/signup?type=artist">I release my own music <Use id="arrow" /></Link>
      <Link className="sc-btn sc-btn-ghost" href="/signup?type=label">I run a label</Link>
    </div>
  );
}

/** Homepage plan cards: short bullets, all derived from PLAN_LIMITS, so they can't promise what billing doesn't. */
function plans(): { artist: ShowcasePlan[]; label: ShowcasePlan[] } {
  const L = PLAN_LIMITS;
  const tiers = pricingTiers();
  const cta = (aud: "artist" | "label", key: PlanKey) => tiers[aud].find((t) => t.key === key)!.cta;
  const card = (key: PlanKey, aud: "artist" | "label", bullets: string[], extra: Partial<ShowcasePlan> = {}): ShowcasePlan => ({
    key, name: L[key].name, price: planPrice(key), suffix: L[key].price ? "/month" : "", yearly: yearlyPrice(key), bullets, cta: cta(aud, key), ...extra,
  });
  const unlimited = (k: PlanKey) => L[k].downloads === Infinity && L[k].releaseEmails === Infinity;
  // Free is the same plan for both audiences: one artist, three new releases in any rolling 12 months.
  const freeBullets = [
    `${artistsLine("free")}, ${lower(releasesLine("free"))}`,
    `${downloadsLine("free")}, ${lower(clicksLine("free"))}`,
    emailsLine("free"),
    "Every fan address visible",
  ];
  // Custom domains: on the plan, but connecting one is invite-only until DOMAINS_OPEN (lib/launch).
  const domain = domainsOpen() ? "Your own domain, no droplr.fm branding" : "Your own domain (invite-only for now), no droplr.fm branding";
  return {
    artist: [
      card("free", "artist", freeBullets),
      card("artist", "artist", [
        releasesLine("artist"),
        unlimited("artist") ? "Unlimited download gates and release-day emails" : downloadsLine("artist"),
        `${clicksLine("artist")}, ${lower(insightsLine("artist"))}`,
        "CSV export, pixels, QR codes and page looks",
      ], { featured: true }),
      card("artist_pro", "artist", [
        `${releasesLine("artist_pro")}, ${lower(clicksLine("artist_pro"))}`,
        insightsLine("artist_pro"),
        domain,
        "Your own Spotify app for VIP library pre-saves",
      ]),
    ],
    label: [
      card("free", "label", freeBullets, { lead: `Start free with ${word(L.free.artists)} artist and ${word(L.free.releases)} releases a year. Add your roster on Pro.` }),
      card("pro", "label", [
        artistsLine("pro"),
        "Artist logins and roster profiles",
        "Team planning, agreements and royalty statements",
        "Everything in Artist Pro",
      ], { featured: true }),
      card("label", "label", [
        artistsLine("label"),
        clicksLine("label"),
        "Team roles (admins)",
        "Analytics across the whole roster",
      ]),
    ],
  };
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{q}<Use id="plus" /></summary>
      {children}
    </details>
  );
}

export default function Landing() {
  const cta = ctaCopy();
  const { artist, label } = plans();
  const free = PLAN_LIMITS.free;

  return (
    <MarketingShell overlay glow={false}>
      <JsonLd data={siteJsonLd(SITE_URL)} />
      <SectionScrollTarget />
      <ShowcaseSprite />

      <main className="sc" data-sc-root>
        {/* 1. Hero and the three pieces */}
        <section className="sc-scene" id="product" aria-labelledby="sc-h-hero">
          <div className="sc-stage" data-sc-stage>
            <div className="sc-light" aria-hidden />

            <div className="sc-hero" data-sc-hero>
              <h1 className="sc-display" id="sc-h-hero"><span className="sc-l">Pre-save to</span> <span className="sc-l">release <em>day.</em></span></h1>
              <p className="sc-lede">Pre-saves that work for every fan, smart links with the DJ stores next to Spotify, and a release-day email at 9am in each fan&apos;s own timezone. For independent electronic artists and the labels behind them.</p>
              <Doors cta={cta} />
              <ul className="sc-gloss" aria-label="Three words, in plain English">
                <li><b>Pre-save:</b> fans sign up before it&apos;s out.</li>
                <li><b>Smart link:</b> one link to every store.</li>
                <li><b>Download gate:</b> a free download for a follow or an email.</li>
              </ul>
            </div>

            <div className="sc-compwrap" data-sc-compwrap>
              <div className="sc-comp" data-sc-comp role="img" aria-label="Example release Lowlight by Night Shift, shown three ways: the pre-save page on a phone in front, the smart link page with Spotify, Beatport, Traxsource, Bandcamp and Apple Music behind it on the left, and the 9am release-day email on the right.">
                <div className="sc-piece sc-p-sl">
                  <div className="sc-tilt"><span className="sc-pill sc-cap">Smart link</span><SmartLinkPhone /></div>
                  <ExclusiveWarning motion />
                </div>
                <div className="sc-piece sc-p-em">
                  <div className="sc-tilt"><span className="sc-pill sc-cap">9am email</span><EmailCard /></div>
                </div>
                <div className="sc-piece sc-p-ps">
                  <div className="sc-tilt"><span className="sc-pill sc-cap">Pre-save</span><PreSavePhone /></div>
                </div>
              </div>
            </div>
            <p className="sc-note" data-sc-note>Example release. Night Shift is a made-up artist.</p>

            <div className="sc-chapters">
              <article className="sc-chapter" aria-labelledby="sc-h-ps">
                <div className="sc-ch-copy">
                  <h2 className="sc-display" id="sc-h-ps"><span className="sc-l">Pre-save</span> <span className="sc-l">for every</span> <span className="sc-l"><em>fan.</em></span></h2>
                  <p>A pre-save is a sign-up before your track is out. On droplr the fan leaves an email and picks where they listen, so nobody is shut out by a store login.</p>
                  {/* Same facts as the Spotify FAQ that was here before and /pricing: 5 allowlisted users, Extended Quota at 250,000+ monthly users. */}
                  <p>Since February 2026, Spotify only lets a new app save music for 5 people you allowlist by hand. Lifting that needs Extended Quota, which is only for registered businesses with 250,000+ monthly users. So droplr leads with email, adds a Follow on Spotify button, and says so plainly.</p>
                </div>
                <div className="sc-ch-visual" aria-hidden><div className="sc-piece sc-p-ps"><PreSavePhone /></div></div>
              </article>

              <article className="sc-chapter" aria-labelledby="sc-h-sl">
                <div className="sc-ch-copy">
                  <h2 className="sc-display" id="sc-h-sl"><span className="sc-l">One link.</span> <span className="sc-l">Every</span> <span className="sc-l"><em>store.</em></span></h2>
                  <p>A smart link is one link that opens a page with every place to hear or buy your track. Beatport, Traxsource, Juno, Bandcamp and Qobuz sit right next to Spotify and Apple Music.</p>
                  <p>Paste a Spotify link and the artwork, colour and store links fill in. Not out yet? Make the page anyway.</p>
                  {/* lib/exclusivity: droplr warns on the Settings tab. It never hides or holds a link; the artist does that on the Links tab. */}
                  <p className="sc-sig"><span>Running a Beatport exclusive?</span> Set it on the release and droplr warns you which links would break it, so you can switch them off until the window closes.</p>
                  <div className="sc-sigcard" aria-hidden><ExclusiveWarning /></div>
                </div>
                <div className="sc-ch-visual" aria-hidden><div className="sc-piece sc-p-sl"><SmartLinkPhone /><ExclusiveWarning /></div></div>
              </article>

              <article className="sc-chapter" aria-labelledby="sc-h-em">
                <div className="sc-ch-copy">
                  <h2 className="sc-display" id="sc-h-em"><span className="sc-l">9am.</span> <span className="sc-l">Their</span> <span className="sc-l"><em>time.</em></span></h2>
                  <p>Stores release country by country, at midnight local time. So the page flips at midnight wherever the fan is, and the release-day email lands at 9am in their own timezone.</p>
                  <p>It leads with the store they picked when they pre-saved. A Beatport fan sees Beatport first.</p>
                </div>
                <div className="sc-ch-visual" aria-hidden><div className="sc-piece sc-p-em"><EmailCard /></div></div>
              </article>
            </div>
          </div>
        </section>

        {/* 2. Fans stay yours */}
        <section className="sc-block" aria-labelledby="sc-h-fans">
          <div className="sc-wrap sc-split">
            <div className="sc-rv">
              <h2 className="sc-display" id="sc-h-fans"><span className="sc-l">Your fans</span> <span className="sc-l">stay</span> <span className="sc-l"><em>yours.</em></span></h2>
              <p>Every address from a pre-save or a download gate is visible to you, on Free too. Paid plans export a CSV with the consent each fan gave and when.</p>
              <p>Imported lists stay separate and never get release-day emails.</p>
              <p>Link tools come and go: smartURL was bought and its analytics closed, Songwhip shut down, and Songlink switched off its API with about six weeks&apos; notice. Your list shouldn&apos;t go with them.</p>
            </div>
            <div className="sc-fans sc-rv" role="group" aria-label="Example fan list">
              <div className="sc-fans-h"><b>Fans · Lowlight</b><span className="sc-ex">Example</span><span className="sc-csv" aria-hidden><Use id="down" />Export CSV</span></div>
              <table>
                <thead><tr><th scope="col">Fan</th><th scope="col">Came from</th><th scope="col">Store</th><th scope="col">Consent</th></tr></thead>
                <tbody>
                  <tr><td className="sc-e">maya.k@example.com</td><td><span className="sc-src"><i />Pre-save</span></td><td>Beatport</td><td className="sc-c">3 Nov<span className="sc-t">, 21:14</span></td></tr>
                  <tr><td className="sc-e">dj.ren@example.com</td><td><span className="sc-src sc-g"><i />Download gate</span></td><td>Bandcamp</td><td className="sc-c">2 Nov<span className="sc-t">, 08:02</span></td></tr>
                  <tr><td className="sc-e">sol.v@example.com</td><td><span className="sc-src"><i />Pre-save</span></td><td>Spotify</td><td className="sc-c">31 Oct<span className="sc-t">, 19:47</span></td></tr>
                  <tr className="sc-imp"><td className="sc-e">old.list@example.com</td><td>Imported</td><td>—</td><td className="sc-c">No release-day email</td></tr>
                </tbody>
              </table>
              <div className="sc-ffoot">Download gate: a free download, like a dubplate or an edit pack, in exchange for a follow or an email.</div>
            </div>
          </div>
        </section>

        {/* 3. Pricing */}
        <section className="sc-block" id="pricing" aria-labelledby="sc-h-price">
          <div className="sc-wrap">
            <ShowcasePricing
              artist={artist}
              label={label}
              heading={<h2 className="sc-display" id="sc-h-price"><span className="sc-l">Start</span> <span className="sc-l"><em>free.</em></span></h2>}
              pill="Yearly: two months free"
              foot="AUD, tax included. No per-release fees. Free needs no card. Cancel paid plans any time."
              labelFoot={<>Bigger catalogue? Enterprise is a conversation: <a href={`mailto:${CONTACT.hello}?subject=droplr.fm%20Enterprise`}>{CONTACT.hello}</a>.</>}
            />
          </div>
        </section>

        {/* 4. FAQ */}
        <section className="sc-block" id="faq" aria-labelledby="sc-h-faq">
          <div className="sc-wrap sc-faq">
            <div className="sc-rv">
              <h2 className="sc-display" id="sc-h-faq"><span className="sc-l">Fair</span> <span className="sc-l"><em>questions.</em></span></h2>
              <Link className="sc-more" href="/learn">More questions →</Link>
            </div>
            <div>
              <Faq q="Does Spotify pre-save work?">
                <p>Not for most fans, for any new app. Since February 2026, Spotify only lets a new app save music for 5 people you allowlist by hand, and lifting that needs Extended Quota, which is only for registered businesses with 250,000+ monthly users. So droplr pre-saves by email, with a Follow on Spotify button. On Artist Pro and the label plans you can connect your own Spotify app for your team and VIPs. <Link href="/docs/spotify-byo">How it works</Link></p>
              </Faq>
              <Faq q="What's the catch on Free?">
                <p>Free is {word(free.artists)} artist and {free.releases} new releases in any 12 months, for artists and labels alike: a rolling window, not a calendar-year reset. The release-day email goes to the first {free.releaseEmails} pre-savers of each release. Fans past that still pre-save and never see an error. Links and pages never switch off.</p>
              </Faq>
              <Faq q="Can I make a page before the track is out?">
                <p>Yes. Unreleased is fine. Apple Music, Deezer, Spotify and TIDAL fill in from the UPC or ISRC as they go live, you add the DJ stores by hand, and the page flips to out now at midnight in each fan&apos;s timezone.</p>
              </Faq>
              <Faq q="What happens to my fans if I leave?">
                <p>They stay yours. Every address is visible on Free, and paid plans export a CSV with each fan&apos;s consent and when they gave it. The whole list downloads on any plan when you close your account.</p>
              </Faq>
              <Faq q="Can I use my own domain?">
                <p>Yes, on Artist Pro and the label plans, like music.yourname.com. One DNS record, and droplr verifies it and issues the certificate.{!domainsOpen() && <> Connecting one is invite-only for now while I prove the setup on real domains: email <a href={`mailto:${CONTACT.hello}`}>{CONTACT.hello}</a> and I&apos;ll switch it on for your account, usually the same day.</>} <Link href="/docs/custom-domain">Domain setup</Link></p>
              </Faq>
              <Faq q="Does droplr hold my royalties?">
                <p>No. Labels on Pro and Label can keep agreements, split sheets and royalty statements in droplr, but droplr never holds or moves money.</p>
              </Faq>
              {!cta.open && cta.hint && (
                <Faq q="Can anyone sign up?">
                  <p>Not yet. I&apos;m onboarding a small group of artists and labels first. <Link href={cta.primary.href}>Request early access</Link>, or email {CONTACT.hello}. Have an invite? <Link href={cta.hint.link.href}>Sign up</Link>.</p>
                </Faq>
              )}
            </div>
          </div>
        </section>

        {/* 5. Close. The design's "Live on droplr" strip is left out: there are no real cover images for it in the repo. */}
        <section className="sc-close" aria-labelledby="sc-h-close">
          <div className="sc-wrap">
            <h2 className="sc-display sc-rv" id="sc-h-close"><span className="sc-l">Your next</span> <span className="sc-l">release,</span> <span className="sc-l"><em>handled.</em></span></h2>
            <p className="sc-lede sc-rv">
              {cta.open
                ? `Free to start with ${word(free.artists)} artist and ${word(free.releases)} releases in any 12 months. Pick the door that fits.`
                : "Invite-only while I onboard the first artists and labels."}
            </p>
            <div className="sc-rv" style={{ display: "grid", justifyItems: "center", gap: 18 }}><Doors cta={cta} /></div>
          </div>
        </section>
      </main>
      <ShowcaseMotion />
    </MarketingShell>
  );
}
