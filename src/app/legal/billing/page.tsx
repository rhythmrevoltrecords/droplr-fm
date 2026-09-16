import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT, LEGAL } from "@/lib/legal";

export const metadata = { title: "Billing & Refund Policy" };

const toc = [
  { id: "plans", title: "Plans and prices" },
  { id: "payment", title: "How payment works" },
  { id: "renewal", title: "Automatic renewal" },
  { id: "tax", title: "Currency and taxes" },
  { id: "changes", title: "Upgrading and downgrading" },
  { id: "cancel", title: "Cancelling" },
  { id: "refunds", title: "Refunds" },
  { id: "failed", title: "Failed payments" },
  { id: "free", title: "What happens on the Free plan" },
  { id: "prices", title: "Price changes" },
  { id: "disputes", title: "Billing questions and disputes" },
];
const s = tocHelper(toc);

export default function BillingPolicyPage() {
  return (
    <LegalShell slug="billing" toc={toc} contact="billing">
      <p>This policy is part of the droplr.fm <Link href="/legal/terms">Terms of Service</Link>. It explains how paid plans are charged, renewed, cancelled and refunded.</p>

      <Section {...s("plans")}>
        <p>droplr.fm has a Free plan and paid plans (currently Pro and Label, billed monthly or yearly), plus Enterprise by agreement. Features and limits for each plan are listed on the <Link href="/pricing">pricing page</Link> and in <strong>Settings → Plan &amp; billing</strong>. The price you&apos;ll pay is always shown on the Stripe checkout page before you confirm.</p>
      </Section>

      <Section {...s("payment")}>
        <ul>
          <li>Payments are processed by Stripe. By subscribing you authorise us, through Stripe, to charge your payment method for each billing period until you cancel.</li>
          <li>You&apos;re charged at the start of each period (monthly or yearly, in advance).</li>
          <li>Receipts and invoices are emailed by Stripe and available any time from <strong>Plan &amp; billing → Invoices &amp; payment method</strong>, where you can also update your card.</li>
          <li>Enterprise customers may be invoiced under their order form, which overrides this policy where it differs.</li>
        </ul>
      </Section>

      <Section {...s("renewal")}>
        <p><strong>Paid plans renew automatically</strong> at the end of each period, at the price then in effect for your plan, until you cancel. Yearly plans renew for another year.</p>
      </Section>

      <Section {...s("tax")}>
        <p>Prices are charged in the currency shown at checkout (currently Australian dollars, AUD). Your bank may charge currency conversion or international transaction fees; those are between you and your bank.</p>
        {LEGAL.gstRegistered ? (
          <p>Prices for customers in Australia include GST, which is shown on your tax invoice. For customers outside Australia, any applicable taxes are shown at checkout.</p>
        ) : (
          <p>{LEGAL.owner} trading as {LEGAL.operator} is not currently registered for GST, so no GST is charged and invoices don&apos;t include GST. If that changes, we&apos;ll give you notice, and prices for Australian customers will include GST.</p>
        )}
      </Section>

      <Section {...s("changes")}>
        <ul>
          <li><strong>Upgrades</strong> take effect immediately. Stripe charges or credits the difference for the rest of your current period (proration) on your next invoice.</li>
          <li><strong>Switching between monthly and yearly</strong>, or <strong>downgrading</strong> to a cheaper paid plan, is done in the billing portal. Stripe calculates any proration and shows it before you confirm.</li>
          <li>If you downgrade, features and limits of the lower plan apply from the change. Content over the new limits isn&apos;t deleted, but you can&apos;t add more until you&apos;re back under the limit or upgrade again.</li>
        </ul>
      </Section>

      <Section {...s("cancel")}>
        <ul>
          <li>Cancel any time in <strong>Settings → Plan &amp; billing → Change plan or cancel</strong>. You don&apos;t need to contact us.</li>
          <li>Your plan stays active until the end of the period you&apos;ve already paid for, then moves to Free. You won&apos;t be charged again.</li>
          <li>Changed your mind? You can undo a cancellation in the billing portal before the period ends.</li>
          <li>Cancelling a subscription doesn&apos;t delete your account or releases. To close your account, email <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>.</li>
        </ul>
      </Section>

      <Section {...s("refunds")}>
        <p><strong>We don&apos;t offer refunds or credits</strong> for:</p>
        <ul>
          <li>the unused part of a monthly or yearly period after you cancel or downgrade;</li>
          <li>periods where you didn&apos;t use the service;</li>
          <li>renewals you forgot to cancel. We recommend cancelling before your renewal date, which is shown on the billing page.</li>
        </ul>
        <p>We <strong>do</strong> refund the unused part of a prepaid period, calculated day by day, if:</p>
        <ul>
          <li>we close droplr.fm or your plan is discontinued;</li>
          <li>we make a change that materially reduces what your paid plan includes and you cancel before it takes effect;</li>
          <li>you object to a new sub-processor under the <Link href="/legal/data-processing">Data Processing Terms</Link> and we can&apos;t offer an alternative;</li>
          <li>we close your account without you being in breach of the <Link href="/legal/terms">Terms</Link>.</li>
        </ul>
        <p>Our services come with guarantees that cannot be excluded under the Australian Consumer Law. For major failures with the service, you are entitled to cancel your service contract with us, and to a refund for the unused portion or compensation for its reduced value. If a failure doesn&apos;t amount to a major failure, you are entitled to have it fixed in a reasonable time; if it isn&apos;t, you can cancel and get a refund of any unused portion. You are also entitled to compensation for any other reasonably foreseeable loss or damage from a failure. Nothing in this policy limits those rights.</p>
        <p>We&apos;ll always refund duplicate charges and charges made in error. We may, at our discretion, offer a refund or credit in other cases; doing so once doesn&apos;t mean we&apos;ll do it again.</p>
        <p>Refunds go back to the original payment method through Stripe and usually appear within 5–10 business days, depending on your bank.</p>
      </Section>

      <Section {...s("failed")}>
        <ul>
          <li>If a renewal payment fails, Stripe retries it automatically over the following days and emails you. Paid features stay on while it retries.</li>
          <li>Update your card in the billing portal to fix it.</li>
          <li>If the payment still hasn&apos;t gone through when Stripe stops retrying (usually within about two weeks), the subscription is cancelled and your label moves to the Free plan.</li>
        </ul>
      </Section>

      <Section {...s("free")}>
        <p>When a label moves to Free, existing releases and pages stay live and Free plan limits apply from then on:</p>
        <ul>
          <li>you can&apos;t create releases or invite artists beyond the Free limits;</li>
          <li>pixels, CSV export, QR codes and branding removal switch off;</li>
          <li>you can&apos;t add or change a custom domain or connect a new Spotify app. A custom domain that&apos;s already set up, and Spotify saves fans have already made, keep working for now, but we may switch them off on Free after giving you 14 days&apos; notice.</li>
        </ul>
        <p>Your settings are kept, so paid features come back if you upgrade again. The Free plan&apos;s limits may change; we&apos;ll give 30 days&apos; notice of any reduction.</p>
      </Section>

      <Section {...s("prices")}>
        <p>We may change plan prices. We&apos;ll email the account owner at least 30 days before a new price applies to your subscription. The new price starts from your next renewal after that notice, and you can cancel before then if you don&apos;t want to continue.</p>
      </Section>

      <Section {...s("disputes")}>
        <p>If a charge looks wrong, email <a href={`mailto:${CONTACT.billing}`}>{CONTACT.billing}</a> within 60 days and we&apos;ll look into it quickly. Please talk to us before raising a chargeback with your bank. If a chargeback is raised, we may pause paid features on the account while it&apos;s resolved.</p>
      </Section>
    </LegalShell>
  );
}
