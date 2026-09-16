import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Acceptable Use Policy" };

const toc = [
  { id: "content", title: "Releases and content" },
  { id: "links", title: "Links and redirects" },
  { id: "email", title: "Email and fan data" },
  { id: "streaming", title: "Streaming manipulation" },
  { id: "platform", title: "Using the platform" },
  { id: "report", title: "Reporting abuse and copyright complaints" },
  { id: "enforcement", title: "What we do about breaches" },
];
const s = tocHelper(toc);

export default function AcceptableUsePage() {
  return (
    <LegalShell slug="acceptable-use" toc={toc}>
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
          <li>Probe, scan or test the service for vulnerabilities without our written permission. If you find a security issue, email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> and we&apos;ll work with you.</li>
          <li>Overload the service, send automated traffic to your own pages to inflate stats, or scrape the service at scale.</li>
          <li>Resell or white-label droplr.fm to others without an agreement with us.</li>
          <li>Create accounts to evade a suspension, or create multiple Free accounts to avoid plan limits.</li>
        </ul>
      </Section>

      <Section {...s("report")}>
        <p>To report a page that breaks this policy, or content that infringes your copyright or trade mark, email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> with the subject &quot;Abuse report&quot; or &quot;Copyright complaint&quot;. Include:</p>
        <ul>
          <li>the link to the page;</li>
          <li>what&apos;s wrong, and for rights complaints, the work you own and how it&apos;s being infringed;</li>
          <li>your name and contact details, and a statement that the information is accurate and you&apos;re the rights owner or authorised to act for them.</li>
        </ul>
        <p>We review reports promptly and may remove content while we investigate. We&apos;ll tell the label concerned so it can respond.</p>
      </Section>

      <Section {...s("enforcement")}>
        <p>Depending on how serious it is, we may warn you, remove content, disable a page, pause features such as email sending, or suspend or close the account, as set out in the <Link href="/legal/terms#termination">Terms</Link>. Where there&apos;s a risk of harm to fans or others, we may act first and contact you straight after. We may report illegal activity to the authorities.</p>
      </Section>
    </LegalShell>
  );
}
