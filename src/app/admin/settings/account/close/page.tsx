import Link from "next/link";
import { notFound } from "next/navigation";
import { CloseAccountForm } from "@/components/admin/close-account-form";
import { closeSummary } from "@/lib/account-close";
import { requireUser } from "@/lib/auth";
import { CONTACT } from "@/lib/legal";

export const metadata = { title: "Close your account" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-AU");

export default async function CloseAccountPage() {
  const user = await requireUser("label");
  // Not a redirect to a nicer page: an admin who is not the owner has no business here, and a 404
  // says that without implying the page would work if they tried harder.
  if (user.role !== "owner") notFound();
  const org = user.organization;
  const s = await closeSummary(org.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/admin/settings/account" className="hover:underline">Account</Link> / Close</p>
        <h1 className="mt-1 text-2xl font-semibold">Close your account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          No survey, no offer, no second screen. Take your list and go — but read what stops working first,
          because that part is permanent and it affects your fans, not just you.
        </p>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="font-semibold">What gets deleted</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          {[
            ["Releases", fmt(s.releases)],
            ["Store links", fmt(s.links)],
            ["Fans", fmt(s.fans)],
            ["Artist profiles", fmt(s.artists)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Every link you have shared stops working.</strong> Pre-save
            pages, smart links, download gates, QR codes on flyers — anything printed or sitting in someone&apos;s
            bio becomes a dead link. There is no redirect, because there is nothing left to redirect to.
          </li>
          {s.customDomain && (
            <li>
              <strong className="text-foreground">{s.customDomain}</strong> stops serving immediately. The DNS
              record stays yours to point elsewhere.
            </li>
          )}
          <li>Your fans&apos; records are deleted too, which is their right as much as yours.</li>
          {s.subscription && <li><strong className="text-foreground">Your subscription is cancelled now</strong>, not at the end of the month. There is no refund for the rest of the period.</li>}
        </ul>
      </div>

      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.07] p-5 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">If you only want to stop paying, you don&apos;t need this page.</strong>{" "}
          Cancel the subscription in <Link href="/admin/settings/billing" className="underline hover:text-foreground">Billing</Link> and
          the account drops to Free: your pages stay up, your links keep working and your fan list stays yours.
        </p>
        <p className="mt-2">
          And if something here is broken or missing rather than wrong for you, <a href={`mailto:${CONTACT.hello}`} className="underline hover:text-foreground">tell me first</a>.
          One person reads that inbox and can usually fix it.
        </p>
      </div>

      <CloseAccountForm accountName={org.name} />
    </div>
  );
}
