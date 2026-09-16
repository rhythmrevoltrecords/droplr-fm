import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL, operatorLine } from "@/lib/legal";

export const metadata = { title: "Copyright & Trade Marks" };

const toc = [
  { id: "ours", title: "droplr.fm's own material" },
  { id: "yours", title: "Labels' and artists' content" },
  { id: "marks", title: "Third-party names and logos" },
  { id: "report", title: "Reporting copyright or trade mark infringement" },
  { id: "counter", title: "If your content was removed" },
  { id: "repeat", title: "Repeat infringers" },
  { id: "misuse", title: "False reports" },
];
const s = tocHelper(toc);

export default function CopyrightPage() {
  return (
    <LegalShell slug="copyright" toc={toc} contact="legal">
      <Section {...s("ours")}>
        <p>The droplr.fm website, software, page designs, text, graphics, and the droplr.fm name and logo are owned by {operatorLine}, or used under licence. © {new Date().getFullYear()} {LEGAL.owner} trading as {LEGAL.operator}. All rights reserved.</p>
        <p>You may link to droplr.fm and share public release pages. You may not copy, scrape, reproduce or adapt the site, software or design, or use the droplr.fm name or logo in a way that suggests we endorse or partner with you, without our written permission. Using the service under the <Link href="/legal/terms">Terms of Service</Link> is permitted.</p>
      </Section>

      <Section {...s("yours")}>
        <p>Artwork, music, release details, logos, photos and text that labels and artists add to droplr.fm belong to them or their licensors, not to us. Labels confirm they have the rights to use that content when they publish it (see <Link href="/legal/terms#content">Terms, section 5</Link>). Each public release page is published by the label named on it.</p>
      </Section>

      <Section {...s("marks")}>
        <p>Spotify, Apple Music, Deezer, SoundCloud, YouTube, Beatport, Traxsource, Bandcamp, Juno, Audius, Tidal, Amazon Music and other platform names, logos and icons are trade marks of their owners. droplr.fm uses them only to identify where a release is available. droplr.fm isn&apos;t affiliated with, sponsored or endorsed by any of these companies, or by Feature.fm.</p>
      </Section>

      <Section {...s("report")}>
        <p>If you believe a page on droplr.fm (including a label&apos;s custom domain served by droplr.fm) infringes your copyright or trade mark, email <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a> with the subject &quot;Copyright complaint&quot; or &quot;Trade mark complaint&quot; and include:</p>
        <ol>
          <li>the link to each page and a description of the material you want removed;</li>
          <li>the work or trade mark you own, with a link or registration number if there is one;</li>
          <li>your name, organisation, postal address, email and phone number;</li>
          <li>a statement that you believe in good faith the use isn&apos;t authorised by you, your agent or the law;</li>
          <li>a statement that the information is accurate and that you&apos;re the owner or authorised to act for the owner;</li>
          <li>your physical or electronic signature (typing your full name is fine).</li>
        </ol>
        <p>We&apos;ll acknowledge complete notices, usually within 2 business days. If the complaint looks valid, we&apos;ll disable the material and tell the label, including your contact details and complaint, so it can respond or contact you directly. Incomplete notices may delay action. You can also write to {LEGAL.owner}, {LEGAL.operator}, {LEGAL.address}.</p>
        <p>We accept notices in the format of the US Digital Millennium Copyright Act (DMCA) and handle them the same way, but droplr.fm is operated from Australia under Australian law.</p>
      </Section>

      <Section {...s("counter")}>
        <p>If material you published was removed and you believe that was a mistake, or that you have the right to use it, email <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a> with the link that was removed, why you believe you&apos;re authorised to use the material, and your contact details, and confirm you agree to us passing your response to the person who complained. Unless the complainant tells us they&apos;ve started legal action, we may restore the material after 10 business days.</p>
      </Section>

      <Section {...s("repeat")}>
        <p>We close the accounts of labels that repeatedly publish infringing material, in appropriate circumstances, as set out in the <Link href="/legal/terms#termination">Terms</Link> and <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>.</p>
      </Section>

      <Section {...s("misuse")}>
        <p>Don&apos;t send a complaint or response you know is false. Knowingly misrepresenting that material is infringing, or that it was removed by mistake, may make you liable for the costs and damages that result. If you&apos;re not sure whether a use infringes your rights, get legal advice first.</p>
      </Section>
    </LegalShell>
  );
}
