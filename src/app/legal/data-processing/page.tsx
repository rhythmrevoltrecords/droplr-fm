import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL } from "@/lib/legal";

export const metadata = { title: "Data Processing Terms" };

const toc = [
  { id: "scope", title: "Scope and roles" },
  { id: "details", title: "Details of the processing" },
  { id: "instructions", title: "Your instructions" },
  { id: "label", title: "Your responsibilities" },
  { id: "imported", title: "Lists you import" },
  { id: "confidentiality", title: "Confidentiality and security" },
  { id: "subprocessors", title: "Sub-processors" },
  { id: "requests", title: "Requests from fans" },
  { id: "breaches", title: "Data breaches" },
  { id: "transfers", title: "International transfers" },
  { id: "deletion", title: "Deletion and return" },
  { id: "audits", title: "Information and audits" },
  { id: "precedence", title: "Order of precedence" },
];
const s = tocHelper(toc);

export default function DataProcessingPage() {
  return (
    <LegalShell slug="data-processing" toc={toc} contact="privacy">
      <p>These Data Processing Terms (&quot;<strong>DPA</strong>&quot;) form part of the droplr.fm <Link href="/legal/terms">Terms of Service</Link> between us and your label. They apply automatically to every label account; you don&apos;t need to sign anything separately. If you need a countersigned copy, email <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>.</p>

      <Section {...s("scope")}>
        <p>For fan data, your label is the controller (the organisation that decides why and how it&apos;s processed) and we&apos;re your processor. Under Australian privacy law this is equivalent to us providing a service to you. Where the GDPR or UK GDPR applies, these terms are intended to meet Article 28.</p>
        <p>This DPA doesn&apos;t cover customer account and billing data. We&apos;re responsible for that data under our <Link href="/legal/privacy">Privacy Policy</Link>.</p>
      </Section>

      <Section {...s("details")}>
        <div className="overflow-x-auto">
          <table>
            <tbody>
              <tr><td><strong>Subject matter</strong></td><td>Hosting your public release, pre-save and bio pages, and handling the fan data they collect</td></tr>
              <tr><td><strong>Duration</strong></td><td>While your account is active, plus the deletion period below</td></tr>
              <tr><td><strong>Purposes</strong></td><td>Showing pages, redirecting clicks, recording pre-saves, sending release-day emails, performing connected Spotify/Deezer saves, running download gates (including carrying out a SoundCloud follow, like or repost a fan has just authorised), and providing analytics and CSV exports to you</td></tr>
              <tr><td><strong>Fans&apos; data</strong></td><td>Email address and consent record (time and wording version, recorded separately for pre-saves and for download gates); Spotify/Deezer account ID and encrypted refresh token; which download-gate steps a visitor ID has completed; country, device type, referrer and campaign tags; daily-rotating IP hash; random visitor ID; email send, click and unsubscribe status. A SoundCloud access token given for a gate step is used once and discarded — it is never stored, and no SoundCloud username or account ID is kept.</td></tr>
              <tr><td><strong>Imported contacts</strong></td><td>Where you upload a list you collected before droplr.fm: the email address, plus any name, country or timezone in your file, and the provenance you give us (source, approximate date, what people agreed to, and your confirmation that you collected them directly)</td></tr>
              <tr><td><strong>People</strong></td><td>Fans and visitors to your pages, and anyone on a list you import</td></tr>
              <tr><td><strong>Sensitive data</strong></td><td>None intended. Don&apos;t collect sensitive information through droplr.fm.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section {...s("instructions")}>
        <p>We process fan data only to provide the service as you configure it, and on your other documented instructions. Your settings and actions in the dashboard are instructions. We&apos;ll tell you if we believe an instruction breaks the law. We won&apos;t use fan data for our own purposes, sell it, or combine it with other labels&apos; data, except in aggregated, de-identified form to secure and improve the service.</p>
      </Section>

      <Section {...s("label")}>
        <ul>
          <li>You have a lawful basis for the processing and give fans any privacy notice the law requires, including telling them how your label will use their information.</li>
          <li>You only use exported fan data lawfully and keep it secure.</li>
          <li>You follow the anti-spam, pixel and consent requirements in the <Link href="/legal/terms#fans">Terms</Link> and <Link href="/legal/cookies">Cookie Policy</Link>.</li>
          <li>Where you import a list, everything in <Link href="#imported">Lists you import</Link> applies.</li>
        </ul>
      </Section>

      <Section {...s("imported")}>
        <p>You can upload a list of fan email addresses you collected before you used droplr.fm. When you do, you are the controller of that list and you warrant that:</p>
        <ul>
          <li>the people on it gave you their address directly, and you have not bought, rented, scraped, harvested or swapped it;</li>
          <li>you have consent, or another lawful basis, to send them the kind of email you intend to send — and that consent was given to you, so you can still rely on it after moving the record here;</li>
          <li>the source, date and description of consent you give us at import are accurate, and you can evidence them if asked;</li>
          <li>you have removed anyone who has withdrawn consent or asked you to stop.</li>
        </ul>
        <p>You remain responsible for the lawfulness of every message you send to an imported contact. We are your processor for storing and sending, not a check on your consent, and we do not verify it.</p>
        <p>What we do enforce: an imported address is never added to a release-day email; a list you tell us was collected only in exchange for a download is marked unconfirmed and cannot be emailed until the person confirms; any address that has already unsubscribed from you through droplr.fm is skipped and not re-added; and every news email carries a working one-click unsubscribe.</p>
        <p>Because all droplr.fm email is sent from shared infrastructure, a list that generates significant spam complaints or bounces harms deliverability for every customer. We may suspend sending for an account, require a list to be re-confirmed, or delete an imported list, where we reasonably believe it breaches this section, our <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>, or our email provider&apos;s rules. Where practical we&apos;ll tell you first.</p>
        <p>You indemnify us for claims, penalties and costs arising from a list you imported without the consent you warranted.</p>
      </Section>

      <Section {...s("confidentiality")}>
        <p>People authorised to access fan data are bound by confidentiality. We maintain appropriate technical and organisational measures, including HTTPS for all traffic, encryption of platform tokens and credentials at rest, hashed IP addresses and passwords, separation of each label&apos;s data, least-privilege access to production systems, and use of reputable infrastructure providers. We may update these measures as long as protection isn&apos;t reduced.</p>
      </Section>

      <Section {...s("subprocessors")}>
        <p>You authorise us to use the sub-processors listed in the <Link href="/legal/privacy#share">Privacy Policy</Link> (currently Netlify, Neon, Resend, and Spotify, Deezer or SoundCloud when a fan connects). Stripe processes billing data only, not fan data. We impose data protection obligations on sub-processors at least as protective as this DPA and remain responsible for them.</p>
        <p>We&apos;ll give account owners at least 30 days&apos; notice by email before adding or replacing a sub-processor that handles fan data. If you object on reasonable data protection grounds, we&apos;ll work with you on an alternative. If none is possible, you can cancel and we&apos;ll refund the unused part of any prepaid period.</p>
      </Section>

      <Section {...s("requests")}>
        <p>You can view fan data and delete it (by deleting a release) from the dashboard on every plan, and export pre-saves as CSV on plans that include it. On any plan, email <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a> and we&apos;ll provide an export of your fan data within 30 days. If a fan contacts us directly, we&apos;ll pass the request to you without undue delay and won&apos;t respond ourselves except to redirect them, unless the law requires otherwise. We&apos;ll give you reasonable help with requests you can&apos;t handle in the dashboard, and with privacy impact assessments or consultations with regulators.</p>
        <p>We also keep the consent record for you: when a fan ticked the box and the wording they saw, when they unsubscribed, and when they restored release emails themselves. Unsubscribes are enforced across your whole account, and we don&apos;t provide any way for you or us to re-subscribe a fan.</p>
      </Section>

      <Section {...s("breaches")}>
        <p>If we become aware of a breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to fan data, we&apos;ll notify you without undue delay, and where feasible within 72 hours. We&apos;ll describe what happened, the data and people likely affected, and what we&apos;re doing about it, and we&apos;ll help you meet your own notification obligations, including under the Notifiable Data Breaches scheme and the GDPR.</p>
      </Section>

      <Section {...s("transfers")}>
        <p>Fan data is stored in Australia and processed by providers in the United States and other countries. Where the GDPR or UK GDPR applies and a transfer outside the EEA or UK isn&apos;t covered by an adequacy decision, the parties agree that the European Commission&apos;s Standard Contractual Clauses (Module 2, controller to processor), and for the UK the International Data Transfer Addendum, are incorporated by reference, with you as data exporter and us as data importer. The details in section 2 and the measures in section 5 complete their annexes. The governing law and courts for the Clauses are those of Ireland.</p>
      </Section>

      <Section {...s("deletion")}>
        <p>When your account closes, you can request an export of fan data during the first 30 days. We delete fan data within 90 days of closure, apart from copies in backups that are overwritten in the normal cycle and anything the law requires us to keep. Deleting a release deletes its fan data straight away.</p>
      </Section>

      <Section {...s("audits")}>
        <p>On reasonable written request, and no more than once a year unless a regulator requires it or there&apos;s been a breach, we&apos;ll give you the information you reasonably need to show compliance with this DPA, such as answers to a security questionnaire and our providers&apos; certifications. Audits beyond that are by agreement, at your cost, with reasonable notice and confidentiality.</p>
      </Section>

      <Section {...s("precedence")}>
        <p>If this DPA conflicts with the Terms, this DPA wins for fan data. If the Standard Contractual Clauses apply and conflict with this DPA, the Clauses win. Limits on liability in the Terms apply to this DPA to the extent the law allows.</p>
      </Section>
    </LegalShell>
  );
}
