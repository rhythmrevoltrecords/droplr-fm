import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL } from "@/lib/legal";

export const metadata = { title: "Acceptable Use Policy" };

const toc = [
  { id: "content", title: "Releases and content" },
  { id: "links", title: "Links and redirects" },
  { id: "email", title: "Email and fan data" },
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
        </ul>
      </Section>

      <Section {...s("streaming")}>
        <ul>
          <li>Use droplr.fm in any scheme to inflate streams, saves, follows or chart positions artificially, including bots, click farms, paid fake engagement or incentivised save loops that break platform rules.</li>
          <li>Use pre-save features in ways that break the terms of Spotify, Apple Music, Deezer or any other platform.</li>
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
