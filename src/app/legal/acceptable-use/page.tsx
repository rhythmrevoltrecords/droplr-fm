import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL } from "@/lib/legal";

export const metadata = { title: "Acceptable Use Policy" };

const toc = [
  { id: "content", title: "Releases and content" },
  { id: "links", title: "Links and redirects" },
  { id: "email", title: "Email and fan data" },
  { id: "downloads", title: "Download gates" },
  { id: "streaming", title: "Streaming manipulation" },
  { id: "platform", title: "Using the platform" },
  { id: "report", title: "Reporting abuse" },
  { id: "enforcement", title: "What we do about breaches" },
];
const s = tocHelper(toc);

export default function AcceptableUsePage() {
  return (
    <LegalShell slug="acceptable-use" toc={toc} contact="abuse">
      <p>This policy is part of the droplr.fm <Link href="/legal/terms">Terms of Service</Link>. It applies to everyone with a droplr.fm account, including invited team members. You must not use droplr.fm, or let anyone else use it, to do any of the following.</p>

      <Section {...s("content")}>
        <ul>
          <li>Promote releases, artwork, names, logos or photos you don&apos;t have the rights to use.</li>
          <li>Impersonate an artist, label or other person, or suggest an affiliation or endorsement that doesn&apos;t exist.</li>
          <li>Publish unlawful, defamatory, hateful or harassing content, sexual content involving minors, or content that promotes violence.</li>
          <li>Leak unreleased music or share someone else&apos;s confidential information.</li>
        </ul>
      </Section>

      <Section {...s("links")}>
        <ul>
          <li>Link to malware, phishing pages, scams or fake login pages.</li>
          <li>Use smart links, bio pages or redirects to disguise where a link really goes, or to get around another platform&apos;s link or safety rules.</li>
          <li>Link to pirated or unlicensed copies of music.</li>
        </ul>
      </Section>

      <Section {...s("email")}>
        <ul>
          <li>Send spam, or email people who didn&apos;t opt in to hear from you.</li>
          <li>Import, upload or use purchased, rented, scraped or shared email lists.</li>
          <li>Collect fans&apos; personal information on your pages without a lawful basis, or use it for anything unrelated to what they agreed to.</li>
          <li>Try to stop the unsubscribe link from working, or email people who have unsubscribed.</li>
          <li>Misdescribe where an imported list came from or what the people on it agreed to.</li>
          <li>Import a list of people who only ever gave you their address in exchange for a file, and present it to us as a marketing opt-in.</li>
        </ul>
        <p>You can import a list you collected yourself before using droplr.fm — see the <Link href="/legal/data-processing#imported">Data Processing Terms</Link>. Consent you already hold carries over, because it was given to you rather than to the tool that collected it. What doesn&apos;t carry over is an address given for a one-off download; that was a transaction, not a subscription.</p>
        <p>All droplr.fm email leaves from shared infrastructure, so one bad list damages delivery for every other artist and label here. We may suspend sending, require a list to be re-confirmed, or delete an imported list where we reasonably believe this section has been breached.</p>
      </Section>

      <Section {...s("downloads")}>
        <p>A download gate points at a file you host somewhere else. droplr.fm never stores the file, and you are responsible for it.</p>
        <ul>
          <li>Only gate files you have the right to give away. If you put an unofficial remix, bootleg, edit or mashup behind a gate, that is your decision and your risk — not ours.</li>
          <li>Don&apos;t link to software, installers or anything executable. Gates are for music, artwork and documents.</li>
          <li>Don&apos;t describe a step as doing something it doesn&apos;t. We label which steps we can confirm and which we can&apos;t, and you must not present an unconfirmed step as verified.</li>
          <li>Don&apos;t use a gate as general file hosting, or to distribute anything unrelated to your music.</li>
          <li>Each step must comply with the rules of the platform it points at. A follow or repost you ask for has to be something that platform allows you to ask for.</li>
        </ul>
        <p>If we&apos;re told a gated file infringes someone&apos;s rights, we can switch the gate off. We can&apos;t remove the file itself — it isn&apos;t ours and it isn&apos;t on our systems. See <Link href="/legal/copyright">Copyright &amp; Trade Marks</Link>.</p>
      </Section>

      <Section {...s("streaming")}>
        <ul>
          <li>Use droplr.fm in any scheme to inflate streams, saves, follows or chart positions artificially, including bots, click farms, paid fake engagement or incentivised save loops that break platform rules.</li>
          <li>Use pre-save or download-gate features in ways that break the terms of Spotify, Apple Music, SoundCloud, Deezer or any other platform. We deliberately don&apos;t automate Spotify follows from a gate for this reason: a gate step pointing at Spotify only opens a link.</li>
        </ul>
      </Section>

      <Section {...s("platform")}>
        <ul>
          <li>Access another label&apos;s data, or try to get around roles, plan limits or security controls.</li>
          <li>Probe, scan or test the service for vulnerabilities without our written permission. If you find a security issue, email <a href={`mailto:${CONTACT.security}`}>{CONTACT.security}</a> and we&apos;ll work with you.</li>
          <li>Overload the service, send automated traffic to your own pages to inflate stats, or scrape the service at scale.</li>
          <li>Resell or white-label droplr.fm to others without an agreement with us.</li>
          <li>Create accounts to evade a suspension, or create multiple Free accounts to avoid plan limits.</li>
          <li>Refer yourself: signing up a second account you control, or paying for one, to earn referral rewards. See the <Link href="/legal/billing">Billing &amp; Refund Policy</Link>.</li>
          <li>Share an invite link publicly when it was sent to you personally, or use one to create accounts for people who aren&apos;t real users.</li>
          <li>Use the feedback channel to send abuse, threats, spam or other people&apos;s personal information.</li>
          <li>Republish or resell our guides or templates as your own product. Using them for your own music business, including with your artists, is fine.</li>
        </ul>
      </Section>

      <Section {...s("report")}>
        <p>To report a page that breaks this policy (spam, phishing, malware, impersonation or harmful content), email <a href={`mailto:${CONTACT.abuse}`}>{CONTACT.abuse}</a> with the subject &quot;Abuse report&quot;. For copyright or trade mark complaints, follow the process on the <Link href="/legal/copyright">Copyright &amp; Trade Marks</Link> page. Include:</p>
        <ul>
          <li>the link to the page;</li>
          <li>what&apos;s wrong with it;</li>
          <li>your name and contact details.</li>
        </ul>
        <p>We review reports promptly and may disable a page while we investigate. We&apos;ll tell the label concerned so it can respond.</p>
      </Section>

      <Section {...s("enforcement")}>
        <p>Depending on how serious it is, we may warn you, remove content, disable a page, pause features such as email sending, or suspend or close the account, as set out in the <Link href="/legal/terms#termination">Terms</Link>. Where there&apos;s a risk of harm to fans or others, we may act first and contact you straight after. We may report illegal activity to the authorities.</p>
      </Section>
    </LegalShell>
  );
}
