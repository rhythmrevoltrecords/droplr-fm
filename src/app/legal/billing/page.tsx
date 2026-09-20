import Link from "next/link";
import { LegalShell, Section } from "@/components/marketing/legal-shell";
import { tocHelper } from "@/components/marketing/legal-toc";
import { CONTACT } from "@/lib/legal";

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
  { id: "referrals", title: "Refer a friend" },
  { id: "disputes", title: "Billing questions and disputes" },
];
const s = tocHelper(toc);

export default function BillingPolicyPage() {
  return (
    <LegalShell slug="billing" toc={toc} contact="billing">
      <p>This policy is part of the droplr.fm <Link href="/legal/terms">Terms of Service</Link>. It explains how paid plans are charged, renewed, cancelled and refunded.</p>

      <Section {...s("plans")}>
        <p>droplr.fm has a Free plan and paid plans (currently Artist and Artist Pro for artists, Pro and Label for labels, billed monthly or yearly), plus Enterprise by agreement. Features and limits for each plan are listed on the <Link href="/pricing">pricing page</Link> and in <strong>Settings → Plan &amp; billing</strong>. Prices include any GST, VAT or sales tax that applies. The total you&apos;ll pay is always shown on the checkout page before you confirm.</p>
      </Section>

      <Section {...s("payment")}>
        <ul>
          <li><strong>Paid plans are sold through Link</strong>, the merchant of record service run by our payment provider Stripe. That means Link is the seller of record for the payment: it takes your payment, handles tax on it, sends your receipts and invoices, and provides payment support. We provide the droplr.fm service itself.</li>
          <li>By subscribing you authorise Link (Stripe) to charge your payment method for each billing period until you cancel. Your bank statement shows the charge as <strong>LINK.COM* DROPLR</strong> or similar.</li>
          <li>You&apos;re charged at the start of each period (monthly or yearly, in advance).</li>
          <li>Link emails your receipts and invoices. They&apos;re also available from <strong>Plan &amp; billing → Invoices &amp; payment method</strong>, where you can update your card, and from your account at <a href="https://link.com">link.com</a>.</li>
          <li>Checkout may show the price converted into your local currency. Link sets the exchange rate and shows the converted total before you pay.</li>
          <li>Enterprise customers may be invoiced under their order form, which overrides this policy where it differs.</li>
        </ul>
      </Section>

      <Section {...s("renewal")}>
        <p><strong>Paid plans renew automatically</strong> at the end of each period, at the price then in effect for your plan, until you cancel. Yearly plans renew for another year.</p>
      </Section>

      <Section {...s("tax")}>
        <p>Our prices are set in Australian dollars (AUD) and <strong>include tax</strong>. As merchant of record, Link works out whether GST, VAT or sales tax applies based on where you are, collects it from within the price, and pays it to the tax authority. The tax amount is shown on your receipt or tax invoice from Link.</p>
        <p>If you pay in another currency, or your card is issued outside Australia, your bank may charge currency conversion or international transaction fees. Those are between you and your bank.</p>
        <p>Where we show a price in US dollars alongside the Australian price, that US figure is <strong>indicative only</strong>. It is a rough conversion published as a guide, not an offer or a quote, and it is not the amount charged. The amount charged is the Australian dollar price for your plan; the rate your bank or card issuer applies on the day decides what that costs you in your own currency. We update the published conversion periodically, so it will not match the live market rate.</p>
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
          <li>Cancel any time in <strong>Settings → Plan &amp; billing → Change plan or cancel</strong>, or from your Link account at <a href="https://link.com">link.com</a>. You don&apos;t need to contact us.</li>
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
        <p>Because Link is the merchant of record, Link support can also look at payment problems and may issue a refund within 60 days of a payment in some cases, for example to resolve a dispute or where local consumer law gives a cooling-off period. This policy doesn&apos;t limit refunds Link gives.</p>
        <p>Refunds, whether from us or from Link, go back to the original payment method and usually appear within 5–10 business days, depending on your bank.</p>
      </Section>

      <Section {...s("failed")}>
        <ul>
          <li>If a renewal payment fails, it&apos;s retried automatically over the following days and you&apos;ll get an email about it. Paid features stay on while it retries.</li>
          <li>Update your card in the billing portal to fix it.</li>
          <li>If the payment still hasn&apos;t gone through when the retries stop (usually within about two weeks), the subscription is cancelled and your label moves to the Free plan.</li>
        </ul>
      </Section>

      <Section {...s("free")}>
        <p>When an account moves to Free (or to a plan with lower limits), existing releases and pages stay live and that plan&apos;s limits apply from then on:</p>
        <ul>
          <li>you can&apos;t create more new releases in a 12-month period, or invite more artists, than the plan allows;</li>
          <li>release-day emails go to the plan&apos;s number of pre-savers per release (on Free, the first 250). Fans past that still pre-save, and your admin shows how many won&apos;t be emailed;</li>
          <li>analytics history is limited to the plan&apos;s range. Older data is kept, and comes back if you upgrade;</li>
          <li>pixels, CSV export, QR codes and branding removal switch off;</li>
          <li>you can&apos;t add or change a custom domain or connect a new Spotify app. A custom domain that&apos;s already set up keeps working for 14 days after your plan changes. After that, visitors to it are sent to the same pages on droplr.fm, so links you&apos;ve shared keep working, and upgrading switches the domain back on. Spotify saves fans have already made keep working for now, but we may switch them off on Free after giving you 14 days&apos; notice.</li>
        </ul>
        <p>Your settings are kept, so paid features come back if you upgrade again. The Free plan&apos;s limits may change; we&apos;ll give 30 days&apos; notice of any reduction.</p>
      </Section>

      <Section {...s("prices")}>
        <p>We may change plan prices. We&apos;ll email the account owner at least 30 days before a new price applies to your subscription. The new price starts from your next renewal after that notice, and you can cancel before then if you don&apos;t want to continue.</p>
      </Section>

      <Section {...s("referrals")}>
        <ul>
          <li>Each account has a referral link. An account is referred when it is created through that link within 30 days of opening it. Existing accounts can&apos;t be referred later.</li>
          <li>You earn one free month when the referred account has been on a paid plan for 30 days, is still subscribed, and has paid at least one invoice. You can earn up to 3 free months in any 12 months; referrals over the limit don&apos;t carry over.</li>
          <li>A free month is a discount on your next invoice: 100% of a monthly invoice, or one twelfth of a yearly invoice. One free month applies per invoice. If you don&apos;t have a paid plan, earned months wait until you subscribe.</li>
          <li>Free months have no cash value, can&apos;t be transferred or refunded, and don&apos;t change your plan&apos;s renewal date.</li>
          <li>Referring yourself, accounts you control, or accounts created only to earn rewards isn&apos;t allowed. We may withhold or remove rewards obtained that way, and we may change or end the programme with notice; months already applied stay applied.</li>
        </ul>
      </Section>

      <Section {...s("disputes")}>
        <p>If a charge looks wrong, email <a href={`mailto:${CONTACT.billing}`}>{CONTACT.billing}</a> within 60 days and we&apos;ll look into it quickly. For questions about the payment itself, such as a receipt, a declined card or a duplicate charge, you can also contact <a href="https://support.link.com/topics/sold-through-link">Link support</a>.</p>
        <p>Please talk to us or Link before raising a chargeback with your bank. Stripe handles chargebacks on these payments. If a chargeback is raised, we may pause paid features on the account while it&apos;s resolved.</p>
      </Section>
    </LegalShell>
  );
}
