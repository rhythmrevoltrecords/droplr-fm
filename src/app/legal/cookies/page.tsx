import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL } from "@/lib/legal";
import { legalMeta } from "@/lib/legal-meta";

export const metadata = legalMeta("cookies");

const toc = [
  { id: "what", title: "What cookies are" },
  { id: "ours", title: "Cookies droplr.fm sets" },
  { id: "pixels", title: "Label pixels on public pages" },
  { id: "labels", title: "If you're a label using pixels" },
  { id: "embeds", title: "Embedded video" },
  { id: "app", title: "The installed app and notifications" },
  { id: "control", title: "Controlling cookies" },
];
const s = tocHelper(toc);

export default function CookiePolicyPage() {
  return (
    <LegalShell slug="cookies" toc={toc} contact="privacy">
      <Section {...s("what")}>
        <p>Cookies are small text files a website stores in your browser. We use a small number of our own cookies to keep you logged in, to count visits and clicks on label pages, and to remember which link brought you to droplr.fm before you sign up. We don&apos;t use cookies to show you ads, and there are no advertising cookies on the droplr.fm marketing site.</p>
      </Section>

      <Section {...s("ours")}>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Cookie</th><th>Purpose</th><th>Type</th><th>Lasts</th></tr></thead>
            <tbody>
              <tr><td><code>dfm_session</code></td><td>Keeps customers logged in to the dashboard. Only set when you log in.</td><td>Strictly necessary</td><td>30 days</td></tr>
              <tr><td><code>dfm_anon</code></td><td>A random ID set when you first open a label&apos;s release, bio or link page (not on droplr.fm&apos;s own marketing or account pages). It connects a page view to a later click or pre-save, so the label can see which visits turned into pre-saves. It doesn&apos;t contain your name, email or IP address, and isn&apos;t shared with other sites.</td><td>Analytics (first-party)</td><td>1 year</td></tr>
              <tr><td><code>dfm_ref</code></td><td>Set only if you arrive through someone&apos;s referral link (droplr.fm/join/…). It remembers who referred you, so they get their free month if you sign up and stay paid.</td><td>Functional (first-party)</td><td>30 days</td></tr>
              <tr><td><code>dfm_src</code></td><td>Remembers which campaign link (for example an Instagram-specific link) brought you to a release, so the label can see which campaign worked.</td><td>Analytics (first-party)</td><td>30 days</td></tr>
              <tr><td><code>dfm_from</code></td><td>Set on droplr.fm&apos;s own pages (never an artist&apos;s or label&apos;s page) only when you arrive through a tagged link or from another website. It remembers that link&apos;s tags, the other site&apos;s name, the page you landed on and when, so that if you sign up we know which of our posts or ads brought you. The first one is kept, later visits don&apos;t change it, and it&apos;s deleted when you sign up.</td><td>Analytics (first-party)</td><td>30 days</td></tr>
            </tbody>
          </table>
        </div>
        <p>All droplr.fm cookies are HTTP-only, so scripts on the page can&apos;t read them. They&apos;re only sent to droplr.fm or the label&apos;s custom domain.</p>
      </Section>

      <Section {...s("pixels")}>
        <p>Labels and artists on paid plans can add their own tracking pixels to their public release, pre-save, download and bio pages:</p>
        <ul>
          <li><strong>Meta Pixel</strong> (Facebook and Instagram ads). See <a href="https://www.facebook.com/privacy/policy" rel="noreferrer">Meta&apos;s Privacy Policy</a>.</li>
          <li><strong>TikTok Pixel</strong>. See <a href="https://www.tiktok.com/legal/privacy-policy" rel="noreferrer">TikTok&apos;s Privacy Policy</a>.</li>
          <li><strong>Google Analytics 4</strong>. See <a href="https://policies.google.com/privacy" rel="noreferrer">Google&apos;s Privacy Policy</a>.</li>
        </ul>
        <p>When a label has added one, that company&apos;s script loads on the label&apos;s page. It may set its own cookies (such as <code>_fbp</code>, <code>_ttp</code> or <code>_ga</code>) and receive information about your visit and which button you clicked, which the label uses to measure and target its ads. The label and that company are responsible for that data, not droplr.fm. No pixel ever loads on the droplr.fm dashboard or marketing site. The only third-party content on either is an embedded video player — in the dashboard, and on a news post on this site — and in both the player loads only once you press play on it. See <Link href="#embeds">Embedded video</Link>.</p>
      </Section>

      <Section {...s("labels")}>
        <p>Privacy laws in some places, including the EU, UK and parts of the US, require notice and sometimes <strong>prior consent</strong> before advertising or analytics pixels run. If you add pixels, you&apos;re responsible for meeting those requirements for your audience, as set out in the <Link href="/legal/terms">Terms</Link>. If you aren&apos;t sure, leave pixels off for campaigns aimed at those regions.</p>
      </Section>

      <Section {...s("embeds")}>
        <p>Some pages show a player from YouTube or SoundCloud: the &quot;Watch the guide&quot; cards in your dashboard, the news posts on this site and videos an artist or label adds to their bio page (YouTube), and remix contest entries on a public release page where the entrant&apos;s track allows a player (YouTube or SoundCloud).</p>
        <ul>
          <li>A guide card, and the player on a news post, show a still picture and a play button. <strong>The player — and anything it stores — only loads when you press play.</strong> Until then nothing from Google <em>runs</em> on the page, though the still picture itself is fetched from YouTube&apos;s image servers, which is a request for a picture and sets no cookies.</li>
          <li>A video on a bio page works like a guide card, with one difference: its still picture is a copy stored on droplr.fm, so <strong>nothing at all is fetched from Google until you press play</strong>.</li>
          <li>We load those players from <code>youtube-nocookie.com</code>. Google describes this as not setting cookies used to build an advertising profile from a video you watch. It is not the same as setting nothing: Google still receives the request, and it may store something in your browser for playback itself.</li>
          <li>A contest entry&apos;s player loads as you scroll to it rather than on a click, so on those pages the connection to YouTube or SoundCloud happens without one. SoundCloud&apos;s player comes from <code>w.soundcloud.com</code> and may set its own cookies; see <a href="https://soundcloud.com/pages/privacy" rel="noreferrer">SoundCloud&apos;s Privacy Policy</a>.</li>
        </ul>
        <p>Blocking third-party content in your browser, or using a content blocker, stops these loading. Everything else on the page keeps working.</p>
      </Section>

      <Section {...s("app")}>
        <p>If you add droplr.fm to your phone&apos;s home screen, your browser also stores things that aren&apos;t cookies:</p>
        <ul>
          <li>A <strong>service worker</strong> and a small cache, so the app opens quickly.</li>
          <li>A <strong>push subscription</strong>, if you turn notifications on. That&apos;s an address at your device&apos;s push service plus the keys used to encrypt messages to it. We store it against your login so we can send you notifications, and delete it when you turn them off.</li>
        </ul>
        <p>Removing the app from your home screen, or clearing site data in your browser, clears these. None of it is used for advertising, and none of it runs on the public release or bio pages fans see.</p>
      </Section>

      <Section {...s("control")}>
        <ul>
          <li>You can block or delete cookies in your browser settings. Blocking <code>dfm_session</code> means you can&apos;t log in. Blocking the analytics cookies doesn&apos;t stop links or pre-saves working.</li>
          <li>Many browsers block third-party tracking by default. You can also use <a href="https://www.facebook.com/adpreferences" rel="noreferrer">Meta ad preferences</a>, <a href="https://adssettings.google.com" rel="noreferrer">Google ad settings</a> and the <a href="https://tools.google.com/dlpage/gaoptout" rel="noreferrer">Google Analytics opt-out add-on</a>.</li>
        </ul>
        <p>Questions: <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>.</p>
      </Section>
    </LegalShell>
  );
}
