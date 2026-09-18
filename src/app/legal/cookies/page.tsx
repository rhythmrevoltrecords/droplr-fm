import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL } from "@/lib/legal";

export const metadata = { title: "Cookie Policy" };

const toc = [
  { id: "what", title: "What cookies are" },
  { id: "ours", title: "Cookies droplr.fm sets" },
  { id: "pixels", title: "Label pixels on public pages" },
  { id: "labels", title: "If you're a label using pixels" },
  { id: "app", title: "The installed app and notifications" },
  { id: "control", title: "Controlling cookies" },
];
const s = tocHelper(toc);

export default function CookiePolicyPage() {
  return (
    <LegalShell slug="cookies" toc={toc} contact="privacy">
      <Section {...s("what")}>
        <p>Cookies are small text files a website stores in your browser. We use a small number of our own cookies to keep you logged in and to count visits and clicks on label pages. We don&apos;t use cookies to show you ads, and there are no advertising cookies on the droplr.fm marketing site.</p>
      </Section>

      <Section {...s("ours")}>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Cookie</th><th>Purpose</th><th>Type</th><th>Lasts</th></tr></thead>
            <tbody>
              <tr><td><code>dfm_session</code></td><td>Keeps customers logged in to the dashboard. Only set when you log in.</td><td>Strictly necessary</td><td>30 days</td></tr>
              <tr><td><code>dfm_anon</code></td><td>A random ID set when you first open a label&apos;s release, bio or link page (not on droplr.fm&apos;s own marketing or account pages). It connects a page view to a later click or pre-save, so the label can see which visits turned into pre-saves. It doesn&apos;t contain your name, email or IP address, and isn&apos;t shared with other sites.</td><td>Analytics (first-party)</td><td>1 year</td></tr>
              <tr><td><code>dfm_src</code></td><td>Remembers which campaign link (for example an Instagram-specific link) brought you to a release, so the label can see which campaign worked.</td><td>Analytics (first-party)</td><td>30 days</td></tr>
            </tbody>
          </table>
        </div>
        <p>All droplr.fm cookies are HTTP-only, so scripts on the page can&apos;t read them. They&apos;re only sent to droplr.fm or the label&apos;s custom domain.</p>
      </Section>

      <Section {...s("pixels")}>
        <p>Labels on paid plans can add their own tracking pixels to their public release pages:</p>
        <ul>
          <li><strong>Meta Pixel</strong> (Facebook and Instagram ads). See <a href="https://www.facebook.com/privacy/policy" rel="noreferrer">Meta&apos;s Privacy Policy</a>.</li>
          <li><strong>TikTok Pixel</strong>. See <a href="https://www.tiktok.com/legal/privacy-policy" rel="noreferrer">TikTok&apos;s Privacy Policy</a>.</li>
          <li><strong>Google Analytics 4</strong>. See <a href="https://policies.google.com/privacy" rel="noreferrer">Google&apos;s Privacy Policy</a>.</li>
        </ul>
        <p>When a label has added one, that company&apos;s script loads on the label&apos;s page. It may set its own cookies (such as <code>_fbp</code>, <code>_ttp</code> or <code>_ga</code>) and receive information about your visit and which button you clicked, which the label uses to measure and target its ads. The label and that company are responsible for that data, not droplr.fm. Pixels never load on the droplr.fm dashboard or marketing site.</p>
      </Section>

      <Section {...s("labels")}>
        <p>Privacy laws in some places, including the EU, UK and parts of the US, require notice and sometimes <strong>prior consent</strong> before advertising or analytics pixels run. If you add pixels, you&apos;re responsible for meeting those requirements for your audience, as set out in the <Link href="/legal/terms">Terms</Link>. If you aren&apos;t sure, leave pixels off for campaigns aimed at those regions.</p>
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
