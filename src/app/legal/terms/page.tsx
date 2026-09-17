import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL, operatorLine } from "@/lib/legal";

export const metadata = { title: "Terms of Service" };

const toc = [
  { id: "about", title: "About these terms" },
  { id: "definitions", title: "Words we use" },
  { id: "accounts", title: "Your account" },
  { id: "plans", title: "Plans, payment and cancellation" },
  { id: "content", title: "Your content" },
  { id: "fans", title: "Fan data and email" },
  { id: "platforms", title: "Spotify, Apple Music and other platforms" },
  { id: "use", title: "Acceptable use" },
  { id: "domains", title: "Custom domains and branding" },
  { id: "service", title: "Availability and changes to the service" },
  { id: "ip", title: "Our intellectual property" },
  { id: "termination", title: "Suspension and termination" },
  { id: "acl", title: "Australian Consumer Law" },
  { id: "liability", title: "Limits on liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "changes", title: "Changes to these terms" },
  { id: "disputes", title: "Disputes and governing law" },
  { id: "general", title: "General" },
];
const s = tocHelper(toc);

export default function TermsPage() {
  return (
    <LegalShell slug="terms" toc={toc} contact="legal">
      <Section {...s("about")}>
        <p>droplr.fm is a service provided by {operatorLine} (&quot;<strong>we</strong>&quot;, &quot;<strong>us</strong>&quot;). {LEGAL.operator} is a registered business name of {LEGAL.owner}, a sole trader in {LEGAL.state}, Australia. These Terms of Service are a legal agreement between us and the person or business that creates a droplr.fm account (&quot;<strong>you</strong>&quot;).</p>
        <p>By creating an account, accepting an invite or using the service, you agree to these terms and to the policies they refer to: the <Link href="/legal/privacy">Privacy Policy</Link>, <Link href="/legal/billing">Billing &amp; Refund Policy</Link>, <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>, <Link href="/legal/cookies">Cookie Policy</Link> and <Link href="/legal/data-processing">Data Processing Terms</Link>. If you don&apos;t agree, don&apos;t use droplr.fm.</p>
        <p>If you sign up for a label, company or other organisation, you confirm you&apos;re authorised to accept these terms for it, and &quot;you&quot; includes that organisation.</p>
      </Section>

      <Section {...s("definitions")}>
        <ul>
          <li><strong>Service</strong>: the droplr.fm website, dashboards, smart links, pre-save pages, bio pages, emails and related features.</li>
          <li><strong>Label</strong>: the organisation account that owns releases, settings and billing. The person who created it is the <strong>owner</strong>.</li>
          <li><strong>Team members</strong>: admins and artists you invite into your label account.</li>
          <li><strong>Fans</strong>: people who visit your public pages, click links or pre-save a release.</li>
          <li><strong>Your content</strong>: everything you or your team members add, such as artwork, release details, links, logos and bio text.</li>
          <li><strong>Fan data</strong>: personal information about fans collected through your pages, such as email addresses and pre-save records.</li>
        </ul>
      </Section>

      <Section {...s("accounts")}>
        <ul>
          <li>You must be at least 18 and able to enter a binding contract. droplr.fm is a business tool for labels, artists and their teams.</li>
          <li>Give us accurate details and keep them up to date, including a working email address.</li>
          <li>Keep your password secret. You&apos;re responsible for activity on your account, including what your team members do. Tell us straight away at <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a> if you think someone has accessed it without permission.</li>
          <li>You decide who to invite and what role they get. Remove access for people who shouldn&apos;t have it.</li>
          <li>Each label account is kept separate. Other labels can&apos;t see your releases, analytics, settings or fan data, and artists you invite only see releases assigned to them.</li>
        </ul>
      </Section>

      <Section {...s("plans")}>
        <p>We offer a Free plan and paid plans. Current limits and prices are on the <Link href="/pricing">pricing page</Link> and shown again before you pay.</p>
        <ul>
          <li>Paid plans are subscriptions billed in advance, monthly or yearly. They&apos;re sold through Link, the merchant of record service of our payment provider Stripe, which takes payment, handles tax and issues receipts. Prices include any applicable tax. Plans <strong>renew automatically</strong> until you cancel.</li>
          <li>You can cancel at any time from <strong>Settings → Plan &amp; billing</strong>. Cancellation takes effect at the end of the period you&apos;ve paid for.</li>
          <li>We don&apos;t give refunds or credits for part-used periods, except where the law requires it.</li>
          <li>If a payment fails and isn&apos;t fixed, your label moves to the Free plan and paid features switch off.</li>
        </ul>
        <p>The full rules are in the <Link href="/legal/billing">Billing &amp; Refund Policy</Link>, which forms part of these terms.</p>
      </Section>

      <Section {...s("content")}>
        <p>You keep ownership of your content. You give us a worldwide, non-exclusive, royalty-free licence to host, store, copy, display, resize and transmit your content only as needed to run, secure and support the service, including showing your public pages to fans and generating link previews. The licence ends when your content is deleted, apart from copies in backups that are overwritten in the normal cycle.</p>
        <p>You promise that:</p>
        <ul>
          <li>you own your content or have permission to use it, including artwork, photos, logos, artist names and trade marks;</li>
          <li>release information is accurate and you&apos;re authorised to promote the release and link to where it&apos;s sold or streamed;</li>
          <li>your content doesn&apos;t break the law or anyone else&apos;s rights.</li>
        </ul>
        <p>We don&apos;t check content before it goes live, but we may remove or disable content that we reasonably believe breaks these terms or the law, or that we receive a valid complaint about.</p>
      </Section>

      <Section {...s("fans")}>
        <p>When a fan pre-saves a release or leaves their email on your page, that information is collected <strong>for your account</strong> (your label, or you as the artist). You decide how it&apos;s used, and we handle it for you under the <Link href="/legal/data-processing">Data Processing Terms</Link>.</p>
        <p>You agree to:</p>
        <ul>
          <li>comply with privacy and anti-spam laws that apply to you and your fans, including the <em>Privacy Act 1988</em> (Cth) and <em>Spam Act 2003</em> (Cth) in Australia, and the GDPR and UK GDPR where they apply;</li>
          <li>only email fans for the purpose they agreed to, and honour unsubscribe requests (droplr.fm release-day emails include an unsubscribe link that works automatically). A fan who only ticked the release-day box agreed to hear about that release; send news or other releases only to fans marked as opted in to news in your fan list;</li>
          <li>not upload, import or use purchased, rented or scraped email lists with the service;</li>
          <li>keep any fan data you export secure and use it lawfully.</li>
        </ul>
      </Section>

      <Section {...s("platforms")}>
        <p>droplr.fm links to and works with services we don&apos;t control, such as Spotify, Apple Music, Deezer, SoundCloud, YouTube, Beatport, Bandcamp, Stripe, and ad platforms like Meta, TikTok and Google. We aren&apos;t affiliated with or endorsed by them.</p>
        <ul>
          <li>Those services can change or withdraw their APIs, catalogue data or terms at any time. When that happens a feature may stop working, and we can&apos;t guarantee it will come back.</li>
          <li><strong>Bring-your-own Spotify app.</strong> Automatic Spotify saves run through a Spotify developer app you create and own. You&apos;re responsible for complying with Spotify&apos;s Developer Terms and for any limits Spotify puts on your app, such as the Development Mode user cap. We don&apos;t promise Spotify will approve extended access.</li>
          <li>Tracking pixels you add (Meta, TikTok, GA4) send data to those companies under their own terms. You&apos;re responsible for having whatever notices and consents your fans&apos; locations require. See the <Link href="/legal/cookies">Cookie Policy</Link>.</li>
          <li>Store links found automatically from a UPC or ISRC come from public catalogue lookups and can be wrong or missing. Check your links before you share them.</li>
        </ul>
      </Section>

      <Section {...s("use")}>
        <p>You must follow the <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>. In short: no infringing or misleading releases, no spam, no malware or phishing links, no artificial streaming schemes and no abuse of the service.</p>
      </Section>

      <Section {...s("domains")}>
        <p>On plans that include custom domains, you&apos;re responsible for owning the domain and keeping its DNS pointed correctly. SSL certificates are issued by our hosting provider once DNS is correct, and we can&apos;t guarantee how long that takes. Removing droplr.fm branding is available only on plans that include it; if your plan changes, branding may reappear.</p>
      </Section>

      <Section {...s("service")}>
        <ul>
          <li>We work to keep droplr.fm fast and available, but we don&apos;t guarantee it will be uninterrupted or error-free. Unless you have a signed Enterprise agreement with a service level, there is no uptime commitment.</li>
          <li>We may add, change or remove features. If a change materially reduces what a paid plan includes, we&apos;ll give you at least 30 days&apos; notice by email or in the dashboard. You can cancel before it takes effect and we&apos;ll refund the unused part of any prepaid period.</li>
          <li>Features marked &quot;beta&quot;, &quot;preview&quot; or &quot;coming soon&quot; may change, stop, or never launch.</li>
          <li>Keep your own copies of important content. droplr.fm isn&apos;t a backup service.</li>
        </ul>
      </Section>

      <Section {...s("ip")}>
        <p>The droplr.fm software, design, name and logos belong to us or our licensors. These terms give you the right to use the service while your account is active. They don&apos;t transfer ownership of it. Don&apos;t copy, resell, reverse engineer or build a competing product from the service except where the law allows. If you send us feedback or ideas, we can use them without owing you anything.</p>
      </Section>

      <Section {...s("termination")}>
        <ul>
          <li><strong>By you.</strong> You can stop using droplr.fm at any time. Cancel any paid plan first, then email us to close your account.</li>
          <li><strong>By us.</strong> We may suspend or close an account, or remove content, if you seriously or repeatedly break these terms, don&apos;t pay, create legal risk for us or others, or if we&apos;re required to by law. Where it&apos;s reasonable, we&apos;ll warn you first and give you a chance to fix the problem.</li>
          <li><strong>What happens next.</strong> Public pages stop working and team access ends. For 30 days after closure you can ask us for an export of your releases and fan data. We delete account data within 90 days of closure, as described in the <Link href="/legal/privacy">Privacy Policy</Link>. We keep records we&apos;re legally required to keep, such as tax invoices.</li>
          <li>If we close the service entirely, we&apos;ll give at least 60 days&apos; notice and refund any prepaid fees for the period after closure. If we close your account when you haven&apos;t breached these terms, we&apos;ll refund the unused part of any prepaid period.</li>
        </ul>
      </Section>

      <Section {...s("acl")}>
        <p>Our services come with guarantees that cannot be excluded under the Australian Consumer Law. For major failures with the service, you are entitled to cancel your service contract with us, and to a refund for the unused portion or compensation for its reduced value. If a failure doesn&apos;t amount to a major failure, you are entitled to have it fixed in a reasonable time and, if that doesn&apos;t happen, to cancel and get a refund of any unused portion. You are also entitled to compensation for any other reasonably foreseeable loss or damage from a failure.</p>
        <p>Nothing in these terms excludes, restricts or modifies any right or remedy you have under the <em>Competition and Consumer Act 2010</em> (Cth) or any other law that can&apos;t lawfully be excluded.</p>
        <p>Where the law lets us limit our liability for a failure to meet a consumer guarantee, and the service isn&apos;t of a kind ordinarily acquired for personal, domestic or household use, our liability is limited, at our choice, to supplying the services again or paying the cost of having them supplied again.</p>
      </Section>

      <Section {...s("liability")}>
        <p>Subject to the section above, and to the extent the law allows:</p>
        <ul>
          <li>the service is provided &quot;as is&quot; and &quot;as available&quot;, and we exclude all warranties not expressly set out in these terms;</li>
          <li>neither of us is liable to the other for indirect or consequential loss, or for lost profits, revenue, streams, fans, data or goodwill;</li>
          <li>our total liability to you for all claims about the service in any 12-month period is limited to the fees you paid us in that period, or AUD $100 if you paid nothing.</li>
        </ul>
        <p>These limits don&apos;t apply to liability that can&apos;t be limited by law, or to loss caused by our fraud, wilful misconduct or gross negligence. Our liability is reduced to the extent you or your team caused or contributed to the loss.</p>
      </Section>

      <Section {...s("indemnity")}>
        <p>Each of us is responsible for claims caused by our own conduct. You&apos;ll cover our reasonable costs of dealing with third-party claims to the extent they arise from your content, your use of fan data, your pixels or Spotify app, or your breach of these terms or the law. We&apos;ll cover your reasonable costs of third-party claims that the service itself (excluding your content) infringes someone&apos;s intellectual property, or that arise from our breach of the privacy or security commitments in our policies. Whoever receives a claim will tell the other promptly and let them take part in how it&apos;s handled.</p>
      </Section>

      <Section {...s("changes")}>
        <p>We may update these terms. For material changes we&apos;ll email the account owner or show a notice in the dashboard at least 30 days before they take effect, unless the change is needed sooner for legal or security reasons. The &quot;Last updated&quot; date at the top always shows the current version. If a change is materially worse for you and you don&apos;t agree with it, you can cancel before it takes effect and we&apos;ll refund the unused part of any prepaid period. If you keep using droplr.fm after that date, the new terms apply.</p>
      </Section>

      <Section {...s("disputes")}>
        <p>If something goes wrong, email <a href={`mailto:${CONTACT.hello}`}>{CONTACT.hello}</a> first (or <a href={`mailto:${CONTACT.billing}`}>{CONTACT.billing}</a> for charges). We&apos;ll both try in good faith to resolve it within 30 days before starting legal proceedings, except for urgent injunctive relief.</p>
        <p>These terms are governed by the laws of {LEGAL.state}, Australia. Both of us submit to the non-exclusive jurisdiction of the courts of {LEGAL.state} and the courts that can hear appeals from them. If you&apos;re a consumer outside Australia, you also keep any protections the law of your country gives you that can&apos;t be excluded.</p>
      </Section>

      <Section {...s("general")}>
        <ul>
          <li>These terms and the policies they link to are the whole agreement between us about droplr.fm. A signed Enterprise order form overrides them where it says so.</li>
          <li>If part of these terms can&apos;t be enforced, the rest still applies.</li>
          <li>Not enforcing a term straight away doesn&apos;t mean we&apos;ve given up the right to.</li>
          <li>You can&apos;t transfer your account or these terms without our written consent. We may transfer them to a successor to the droplr.fm business, and we&apos;ll tell you if we do.</li>
          <li>Neither of us is responsible for delays caused by events outside reasonable control, such as outages at hosting or streaming providers.</li>
          <li>We&apos;ll send notices to the account owner&apos;s email. Send legal notices to us at <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a>.</li>
        </ul>
      </Section>
    </LegalShell>
  );
}
