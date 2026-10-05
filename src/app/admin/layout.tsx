import { redirect } from "next/navigation";
import { AppShell } from "@/components/admin/app-shell";
import { tourSteps } from "@/lib/tour";
import { CompNotice } from "@/components/admin/comp-notice";
import { DashboardNotices } from "@/components/admin/dashboard-notices";
import { messagesFor } from "@/lib/platform-messages";
import { LegalUpdateNotice } from "@/components/admin/legal-update-notice";
import { requireUser } from "@/lib/auth";
import { LEGAL, needsReaccept, updatesSince } from "@/lib/legal";
import { compNoticeFor } from "@/lib/plan-copy";
import { planOf } from "@/lib/plans";
import { formatInTz } from "@/lib/time";
import { prisma } from "@/lib/db";
import { isPlatformAdminUser } from "@/lib/platform";
import { NOINDEX } from "@/lib/seo";

export const dynamic = "force-dynamic";
// Signed-in pages: a plain tab title instead of the marketing tagline, and never indexed.
// Never indexed: signed in, or the URL itself is the credential. See lib/seo NEVER_INDEX.
export const metadata = { ...NOINDEX,
  title: { default: "Dashboard · droplr.fm", template: "%s · droplr.fm" },
  robots: { index: false, follow: false },
  // Installable as an app (Home Screen / Android install) for push notifications.
  manifest: "/app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "droplr", statusBarStyle: "black-translucent" as const },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("label");
  // Public signups mean an unconfirmed account could otherwise publish a page on droplr.fm.
  // The gate is a page of its own so the first screen after signing up is one instruction.
  if (!user.emailVerifiedAt) redirect("/verify-email");
  const artist = user.organization.kind === "artist";
  const feedbackUnread = (await prisma.feedbackThread.count({ where: { userId: user.id, unreadByUser: true } })) > 0;
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { compPlan: true, compNote: true, compSetAt: true, compUntil: true, compNoticeAt: true, compEndedNoticeAt: true, founderPrice: true, founderOfferUntil: true, founderCode: true, timezone: true },
  });
  const compNotice = org ? compNoticeFor(org) : null;
  return (
    <AppShell
      user={user}
      billingHref="/admin/settings/billing"
      accountHref="/admin/settings/account"
      feedbackHref="/admin/feedback"
      feedbackUnread={feedbackUnread}
      tour={user.tourDoneAt ? undefined : tourSteps(artist ? "artist" : "label")}
      nav={[
        { href: "/admin", label: "Releases", tour: "nav-releases" },
        { href: "/admin/downloads", label: "Downloads" },
        { href: "/admin/fans", label: "Fans" },
        { href: "/admin/news", label: "Fan emails" },
        { href: "/admin/bio", label: "Bio links" },
        // An artist account has one profile (its own); a label manages a roster.
        { href: "/admin/artists", label: artist ? "Profile" : "Roster", tour: "nav-profile" },
        { href: "/admin/learn", label: "Knowledge", tour: "nav-knowledge" },
        { href: "/admin/templates", label: "Templates", tour: "nav-templates" },
        { href: "/admin/settings", label: "Settings" },
        // The platform console has no other way in: nothing else in the app links to /platform, so
        // reaching it meant typing the URL — impossible in the installed app, which has no address
        // bar. `wide` keeps it out of the desktop bar below 2xl — adding a tenth always-visible
        // item wrapped the nav onto two lines on a 1440px laptop — while MobileNav shows it
        // regardless, which is where it was actually needed. On a desktop there is an address bar.
        // Absent from the array entirely for everyone else, so the console's existence isn't
        // advertised in the RSC payload either.
        ...(isPlatformAdminUser(user) ? [{ href: "/platform", label: "Platform", wide: true }] : []),
        { href: "/admin/settings/integrations", label: "Integrations", wide: true },
        { href: "/admin/settings/billing", label: "Billing", wide: true },
      ]}
    >
      {needsReaccept(user.termsVersion) && <LegalUpdateNotice updates={updatesSince(user.termsVersion)} updated={LEGAL.updated} />}
      <DashboardNotices messages={await messagesFor(user)} />
      {compNotice && org?.compPlan && (
        <CompNotice
          kind={compNotice}
          planName={planOf(org.compPlan).name}
          until={org.compUntil ? formatInTz(org.compUntil, org.timezone, { dateStyle: "long" }) : null}
          note={org.compNote}
          founderPrice={org.founderPrice}
          claimBy={org.founderOfferUntil ? formatInTz(org.founderOfferUntil, org.timezone, { dateStyle: "long" }) : null}
          code={org.founderCode}
        />
      )}
      {children}
    </AppShell>
  );
}
