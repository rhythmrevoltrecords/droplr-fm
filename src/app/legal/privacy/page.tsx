import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL, operatorLine } from "@/lib/legal";

export const metadata = { title: "Privacy Policy" };

const toc = [
  { id: "who", title: "Who we are and who this covers" },
  { id: "roles", title: "Labels, fans and who's responsible" },
  { id: "collect", title: "What we collect" },
  { id: "how", title: "How we collect it" },
  { id: "imported", title: "Lists a label brings with them" },
  { id: "use", title: "How we use it" },
  { id: "bases", title: "Legal bases (EU and UK)" },
  { id: "share", title: "Who we share it with" },
  { id: "overseas", title: "Where it's stored and overseas disclosure" },
  { id: "security", title: "Security and data breaches" },
  { id: "retention", title: "How long we keep it" },
  { id: "rights", title: "Your choices and rights" },
  { id: "marketing", title: "Emails from us" },
  { id: "children", title: "Children" },
  { id: "automated", title: "Automated decisions" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact and complaints" },
];
const s = tocHelper(toc);

export default function PrivacyPage() {
  return (
    <LegalShell slug="privacy" toc={toc} contact="privacy">
      <p>droplr.fm is a service provided by {operatorLine}. This policy explains how we handle personal information. We follow the Australian Privacy Principles in the <em>Privacy Act 1988</em> (Cth). Where the EU or UK General Data Protection Regulation (GDPR) applies to you, this policy also explains your rights under it.</p>

      <Section {...s("who")}>
        <p>This policy covers:</p>
        <ul>
          <li><strong>Customers</strong>: label owners, admins and artists with a droplr.fm login;</li>
          <li><strong>Fans</strong>: people who visit a smart link, pre-save page or bio page hosted on droplr.fm or on a label&apos;s custom domain;</li>
          <li><strong>Visitors</strong> to the droplr.fm website, and anyone who contacts us.</li>
        </ul>
      </Section>

      <Section {...s("roles")}>
        <p>For <strong>customer accounts and billing</strong>, we decide how the information is used and we&apos;re responsible for it.</p>
        <p>For <strong>fan data</strong>, we act for the label whose page you visited. That label decides why your information is collected (for example, to email you on release day), and it&apos;s responsible for how it uses the information. We process it on the label&apos;s behalf under our <Link href="/legal/data-processing">Data Processing Terms</Link>. In GDPR terms, the label is the controller and we&apos;re its processor. The label&apos;s name is shown on the page and in any email you receive. If you have a question about a specific label&apos;s use of your data, contact the label, or contact us and we&apos;ll pass it on and help.</p>
      </Section>

      <Section {...s("collect")}>
        <h3>From customers</h3>
        <ul>
          <li><strong>Account details</strong>: email address, label name, artist name, role, and your password, which we store only as a one-way bcrypt hash.</li>
          <li><strong>Label settings</strong>: logo, timezone and location, theme, custom domain, reply-to address, and the IDs of any Meta, TikTok or Google Analytics pixels you add.</li>
          <li><strong>Content</strong>: release titles, artwork, UPC/ISRC codes, store links, bio pages and invites you send, including the invitee&apos;s email address.</li>
          <li><strong>Spotify developer credentials</strong>, if you connect your own Spotify app. These are encrypted with AES-256-GCM before storage.</li>
          <li><strong>SoundCloud developer credentials</strong>, if you connect your own SoundCloud app for download gates, encrypted the same way, along with the SoundCloud profile your gates point at.</li>
          <li><strong>Download gates</strong>: the link to wherever your files are kept, and the steps you ask fans to take. We store the link; the files stay with whoever hosts them, which is not us.</li>
          <li><strong>Billing</strong>: your plan and the customer and subscription IDs Stripe gives us. Your card and billing details go directly to Stripe and Link; we never see or store your full card number.</li>
          <li><strong>Security records</strong>: when you agreed to the Terms, password reset requests (we store only a hash of the reset link, which expires after 60 minutes), and a record of failed logins and reset requests used for rate limiting. Those rate-limit records contain a hash of the email or IP address, not the address itself, and are deleted after a day.</li>
          <li><strong>Support and feedback</strong>: what you tell us when you email us, and the messages in any feedback conversation you start in the dashboard, with your account and login attached.</li>
          <li><strong>Notifications</strong>: if you turn them on, the push subscription your browser creates for that device (an address at your device&apos;s push service, plus the keys needed to encrypt a message to it), which notification types you want, and when the device was added. We don&apos;t receive your phone number or device ID.</li>
          <li><strong>Invitations and referrals</strong>: invite links we or a label create, the email address they were sent to, when they were used, and which account signed up through a referral link.</li>
          <li><strong>Product state</strong>: small settings such as whether you&apos;ve finished the walkthrough, so we don&apos;t show it again.</li>
        </ul>

        <h3>From fans (on behalf of labels)</h3>
        <ul>
          <li><strong>Email pre-saves</strong>: your email address, that you ticked the consent box, when you did it, and which version of the consent wording you saw. If you also tick the optional box for news and new music, we record that separately with its own time; without it, the artist or label may only email you about that release. Your chosen store and timezone, if given, are kept to send the release-day email at the right time and to the right place. We also record whether the release-day email was sent, whether you clicked it, and whether you unsubscribed.</li>
          <li><strong>Fan emails from an artist or label</strong>: if you ticked the optional news box, that artist or label can send you occasional emails through droplr.fm. For each one we keep your address, which send it belonged to, when it went out, and any delivery failure the email provider reported, so the sender can see what happened and so nobody is emailed twice. Your consent is re-checked immediately before each batch: if you unsubscribe in the meantime, you are dropped from the send.</li>
          <li><strong>Spotify or Deezer pre-saves</strong>, if you choose them: your account ID on that platform and an encrypted refresh token that lets us save the release to your library and follow the artist on release day. The platform&apos;s permission screen may also mention your email address; we don&apos;t store it from there. You can revoke access at any time in your Spotify or Deezer account settings.</li>
          <li><strong>Download gates</strong>: if a gate asks for your email address, we keep the address, that you ticked the consent box, when, and which wording you saw — recorded separately from a pre-save, because the two ask for different things. We also keep an anonymous record of which steps you finished, so you don&apos;t have to do them twice and so the artist can see which step people stop at. That record uses the random visitor ID from your browser, not your name.</li>
          <li><strong>SoundCloud gate steps</strong>: if you choose to connect SoundCloud, you are sent to SoundCloud to approve it. We then carry out the exact action the page described — a follow, like or repost — using the permission you just gave, and we <strong>immediately discard the access token</strong>. We do not store it, we do not keep your SoundCloud username or account ID, and we cannot do anything else with your account. All we record is that the step was completed. You can undo the follow, like or repost in SoundCloud at any time.</li>
          <li><strong>Steps that open another website</strong> — Instagram, TikTok, YouTube, Spotify, Facebook or any link an artist adds — simply send you there. We record that you clicked; we cannot see what you do once you arrive, and no follow on those platforms can be checked by us or by anyone else. What happens on those sites is covered by their own privacy policies, not this one.</li>
          <li><strong>Page and click analytics</strong>: which page and button you used, the time, your country (worked out by our hosting provider from your IP address), device type (mobile, tablet or desktop, from your browser&apos;s user agent), the referring website, campaign tags in the link, and a random visitor ID stored in a cookie.</li>
          <li><strong>IP addresses</strong>: we don&apos;t store your raw IP address in our database. We store a one-way hash of it, mixed with a secret and the date so it changes every day, to help detect abuse and bot traffic. Our hosting provider may keep IP addresses in short-term server and security logs.</li>
        </ul>

        <h3>From visitors</h3>
        <p>Pages you visit on droplr.fm and the same kind of technical information as above. If you join the waitlist, your email address and when you joined; we use it only to tell you when droplr.fm opens and delete it on request. We don&apos;t run advertising pixels on the droplr.fm marketing site.</p>
      </Section>

      <Section {...s("how")}>
        <ul>
          <li>Directly from you, when you sign up, fill in a form or email us.</li>
          <li>Automatically, through cookies and server requests when you use the service. See the <Link href="/legal/cookies">Cookie Policy</Link>.</li>
          <li>From third parties: Stripe (payment status), Spotify or Deezer (when a fan connects an account), and a label that invites you to its team.</li>
          <li>From a label directly, if it uploads a list of fan email addresses it collected before it used droplr.fm. See <Link href="#imported">Lists a label brings with them</Link>.</li>
          <li>Release details such as titles, artwork and store links come from public catalogues (Spotify, Apple&apos;s iTunes Search API and Deezer&apos;s public API). Those lookups use release codes, not personal information.</li>
        </ul>
        <p>You can browse the droplr.fm website without giving us your name. You can&apos;t use an account or pre-save by email anonymously, because we need an email address to do it.</p>
      </Section>

      <Section {...s("imported")}>
        <p>A label can upload a list of fan email addresses it already had — collected on its own site, or through a download gate or mailing list service it used before droplr.fm. If you&apos;re a fan, you may be on such a list.</p>
        <p><strong>The label is responsible for having your consent</strong>, not us. Consent you gave was given to that label, and moving the record between tools doesn&apos;t change what you agreed to. When a label imports a list it must tell us where the addresses came from, roughly when, and what people agreed to, and it must confirm it collected them directly and did not buy, scrape or swap them. We keep that statement on record.</p>
        <p>What we store for an imported contact is the email address, and a name, country or timezone only if the label&apos;s file included them. We don&apos;t buy, sell, rent or enrich contact data, and we never import a list on a label&apos;s behalf from another service.</p>
        <p>An imported address is <strong>never</strong> added to a release-day email. It can only receive a news email the label writes and sends. If the label told us the addresses were only ever given in exchange for a download — rather than to receive news — we mark them as unconfirmed and they can&apos;t be emailed at all until the person confirms.</p>
        <p>If you had already unsubscribed from that label through droplr.fm, an import can&apos;t put you back: we check every uploaded address against our unsubscribe records and skip anyone who has opted out. Every news email carries a one-click unsubscribe, and using it stops all email from that label, including release-day emails.</p>
        <p>To be removed from an imported list, use the unsubscribe link in any email from that label, contact the label directly, or email us at <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a> and we&apos;ll pass it on and help.</p>
      </Section>

      <Section {...s("use")}>
        <ul>
          <li>To run the service: logins, dashboards, public pages, link redirects and pre-saves.</li>
          <li>To send release-day emails and perform Spotify or Deezer saves on labels&apos; behalf.</li>
          <li>To show labels analytics about their pages (views, clicks, sources, countries and pre-saves).</li>
          <li>To bill paid plans and keep financial records.</li>
          <li>To send service emails, such as password resets, security notices, receipts and changes to these policies.</li>
          <li>To keep droplr.fm secure: preventing fraud, spam, bots and abuse.</li>
          <li>To fix problems and improve the service, using aggregated or de-identified data where we can.</li>
          <li>To comply with the law and enforce our <Link href="/legal/terms">Terms</Link>.</li>
        </ul>
        <p>We <strong>don&apos;t sell</strong> personal information, and we don&apos;t use one label&apos;s fan data for another label or for our own marketing.</p>
      </Section>

      <Section {...s("bases")}>
        <p>If the GDPR or UK GDPR applies, we rely on:</p>
        <ul>
          <li><strong>Contract</strong>: to provide your account and paid plan;</li>
          <li><strong>Consent</strong>: for release-day emails and connected Spotify/Deezer saves (withdraw it any time by unsubscribing or revoking access);</li>
          <li><strong>Legitimate interests</strong>: for security, basic analytics for labels, and improving the service, balanced against your rights;</li>
          <li><strong>Legal obligation</strong>: for tax records and responding to lawful requests.</li>
        </ul>
      </Section>

      <Section {...s("share")}>
        <p>We share personal information only as needed to run droplr.fm:</p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Who</th><th>Why</th><th>Location</th></tr></thead>
            <tbody>
              <tr><td>The label whose page you used</td><td>Fan emails, pre-saves and analytics belong to that label&apos;s dashboard and CSV export</td><td>Wherever the label is</td></tr>
              <tr><td>Netlify</td><td>Website hosting, server functions, file storage for artwork</td><td>United States, with a global content delivery network</td></tr>
              <tr><td>Neon (through Netlify DB)</td><td>Database</td><td>Sydney, Australia</td></tr>
              <tr><td>Stripe, including Link</td><td>Subscription checkout, payments, tax and invoices. Link is the merchant of record for paid plans and handles the details you give it at checkout under its own privacy policy.</td><td>United States and other countries</td></tr>
              <tr><td>Resend</td><td>Sending release-day emails and account emails such as password resets</td><td>United States</td></tr>
              <tr><td>Spotify, Deezer</td><td>Only when a fan chooses to connect their account</td><td>Per those providers</td></tr>
              <tr><td>Apple, Google, Microsoft, Mozilla (push services)</td><td>Only if you turn on notifications: we hand the encrypted notification to the push service your device uses so it can deliver it</td><td>Per those providers</td></tr>
              <tr><td>Meta, TikTok, Google</td><td>Only on label pages where the label has added its own pixel</td><td>Per those providers</td></tr>
            </tbody>
          </table>
        </div>
        <p>We may also disclose information to professional advisers, to law enforcement or regulators when the law requires it, to protect people&apos;s safety or our legal rights, or to a buyer if the droplr.fm business is sold, under the same protections as this policy.</p>
      </Section>

      <Section {...s("overseas")}>
        <p>Our main database is in Sydney, Australia. Our hosting, email and payment providers process information in the United States and may use other countries. We choose providers with strong security practices and contractual privacy commitments. Where the GDPR applies, transfers rely on adequacy decisions or the European Commission&apos;s Standard Contractual Clauses.</p>
      </Section>

      <Section {...s("security")}>
        <ul>
          <li>All traffic is encrypted with HTTPS.</li>
          <li>Passwords are hashed. Spotify credentials and platform tokens are encrypted at rest.</li>
          <li>Login sessions use secure, HTTP-only cookies. Each label&apos;s data is separated by account, and artists only see their own releases.</li>
          <li>Access to production systems is limited to people who need it.</li>
        </ul>
        <p>No system is perfectly secure. If a data breach is likely to cause serious harm, we&apos;ll notify affected people and the Office of the Australian Information Commissioner under the Notifiable Data Breaches scheme, and notify affected labels without undue delay.</p>
      </Section>

      <Section {...s("retention")}>
        <ul>
          <li><strong>Customer accounts</strong>: kept while the account is open. We delete or de-identify account data within 90 days of closure. During the first 30 days you can ask for an export.</li>
          <li><strong>Fan data</strong>: kept until the label deletes the release (which deletes its pre-saves and analytics), closes its account (deleted within 90 days of closure), or asks us to delete it. If you unsubscribe, we keep your email address marked as unsubscribed so that label can&apos;t email you through droplr.fm again.</li>
          <li><strong>Interest in features we haven&apos;t built</strong>: some parts of droplr.fm have a tick box for something that doesn&apos;t exist yet, such as letting labels hear an unreleased track or taking booking enquiries. We record whether you ticked it and when. Ticking it shares nothing with anyone and shows nothing publicly — it tells us you want the feature. If we build it, we&apos;ll tell you before anything you&apos;ve ticked is used.</li>
          <li><strong>Shared release reports</strong>: if an artist or label turns one on, the page shows totals for that release only — counts of pre-saves, clicks and views, and which stores and countries they came from. It never shows an email address or anything else that identifies a fan. The sharing address is kept until they turn sharing off or reissue it, and either of those makes the old address stop working immediately.</li>
          <li><strong>Notification subscriptions</strong>: kept until you turn notifications off, remove that device, uninstall the app, or the push service tells us the subscription is dead, when we delete it. All of them are deleted when the account closes.</li>
          <li><strong>Feedback conversations</strong>: kept while your account is open so we have the history of what you asked, and deleted with the account within 90 days of closure.</li>
          <li><strong>Invites and referral records</strong>: kept while they can still be used and for our records of how an account was created; deleted with the account.</li>
          <li><strong>Imported fan contacts</strong>: kept until the label deletes them, closes its account (deleted within 90 days of closure), or you ask to be removed. If you unsubscribe we keep your address marked as unsubscribed so that label can&apos;t email you through droplr.fm again.</li>
          <li><strong>Billing records</strong>: kept for as long as tax law requires, generally five years in Australia.</li>
          <li><strong>Backups and logs</strong>: overwritten on our providers&apos; normal cycles.</li>
        </ul>
      </Section>

      <Section {...s("rights")}>
        <ul>
          <li><strong>Access and correction.</strong> Customers can see and edit most of their information in the dashboard. Anyone can ask us for a copy of the personal information we hold about them, or to correct it. We don&apos;t charge for requests.</li>
          <li><strong>Deletion.</strong> Ask us to delete your information. We may need to keep some records for legal reasons, and we&apos;ll tell you if so.</li>
          <li><strong>Unsubscribe.</strong> Every release-day email has a one-click unsubscribe link. It stops all droplr.fm emails from that label. If you didn&apos;t mean to, the confirmation page has a link that turns release emails back on for 30 days. Only you can use it: a label can never re-subscribe you.</li>
          <li><strong>Revoke platform access</strong> in your Spotify or Deezer account settings under connected apps.</li>
          <li><strong>Notifications.</strong> Turn them off for a login or a single device in Account, or in your device&apos;s notification settings. Turning them off deletes that device&apos;s subscription.</li>
          <li><strong>EU and UK residents</strong> also have the right to data portability, to restrict or object to processing, and to complain to their local data protection authority.</li>
          <li><strong>US state privacy laws.</strong> Where they apply, you can request access or deletion in the same way. We don&apos;t sell or share personal information for cross-context behavioural advertising; label pixels are controlled by the label.</li>
        </ul>
        <p>Email <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a> with the subject &quot;Privacy request&quot;. We&apos;ll confirm who you are and reply within 30 days. For fan data, we&apos;ll work with the relevant label.</p>
      </Section>

      <Section {...s("marketing")}>
        <p>We send customers service emails you can&apos;t opt out of while you have an account, such as security alerts and billing receipts. If we send product news, it will have an unsubscribe link, and you can opt out at any time. We never send marketing to fans.</p>
      </Section>

      <Section {...s("children")}>
        <p>droplr.fm accounts are for people 18 and over. Fan pages aren&apos;t directed at children, and people under 16 shouldn&apos;t sign up for release-day emails without a parent or guardian&apos;s permission. If you believe a child has given us personal information, contact us and we&apos;ll delete it.</p>
      </Section>

      <Section {...s("automated")}>
        <p>droplr.fm doesn&apos;t use computer programs to make decisions that significantly affect people&apos;s rights or interests. Automated processing is limited to things like counting clicks, filtering bots and scheduling release-day emails. If that changes, we&apos;ll update this policy to describe the kinds of personal information involved.</p>
      </Section>

      <Section {...s("changes")}>
        <p>We&apos;ll update this policy when our practices or the law change. The date at the top shows the latest version. For material changes we&apos;ll notify customers by email or in the dashboard before they take effect.</p>
      </Section>

      <Section {...s("contact")}>
        <p>Privacy questions and requests: <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>, or write to {LEGAL.owner}, {LEGAL.operator}, {LEGAL.address}.</p>
        <p>If you&apos;re not happy with our response, you can complain to the Office of the Australian Information Commissioner (OAIC) at <a href="https://www.oaic.gov.au" rel="noreferrer">oaic.gov.au</a> or on 1300 363 992. If you&apos;re in the EU or UK, you can contact your local data protection authority.</p>
      </Section>
    </LegalShell>
  );
}
