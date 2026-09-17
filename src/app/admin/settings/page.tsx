import Link from "next/link";
import { DomainSetup } from "@/components/admin/domain-setup";
import { EmailHourForm, OrgFieldsForm } from "@/components/admin/org-forms";
import { AppearanceForm, IdentityForm } from "@/components/admin/settings-forms";
import { SITE_HOST } from "@/lib/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { domainSetupView } from "@/lib/domains";
import { planOf, customDomainStatus } from "@/lib/plans";
import { SectionLink } from "@/components/marketing/section-link";

export default async function SettingsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  const plan = planOf(org.plan);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Section tabs: horizontal from md up, stacked on phones */}
      <nav aria-label="Settings sections" className="flex flex-col gap-1 rounded-xl border p-1 text-sm md:flex-row md:overflow-x-auto">
        {[["#identity", org.kind === "artist" ? "Artist identity" : "Label identity"], ["#appearance", "Appearance"], ["#pixels", "Pixels"], ["#email", "Release-day email"], ["#domain", "Custom domain"], ["/admin/settings/billing", "Plan & billing"], ["/admin/referrals", "Refer a friend"], ["/admin/feedback", "Feedback"], ["/admin/settings/account", "App & notifications"], ["/admin/settings/account", "Account & password"]].map(([id, label]) => (
          id.startsWith("#")
            ? <SectionLink key={label} page="/admin/settings" section={id.slice(1)} className="rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-accent hover:text-foreground md:py-1.5">{label}</SectionLink>
            : <Link key={label} href={id} className="rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-accent hover:text-foreground md:py-1.5">{label}</Link>
        ))}
      </nav>

      <Card id="identity" className="scroll-mt-24">
        <CardHeader><CardTitle>{org.kind === "artist" ? "Artist identity" : "Label identity"}</CardTitle><CardDescription>Plan: {plan.name} (<Link className="underline" href="/admin/settings/billing">{plan.name === "Free" ? "upgrade" : "manage billing"}</Link>). Free subdomain: {org.slug}.droplr.fm</CardDescription></CardHeader>
        <CardContent>
          <IdentityForm
            kind={org.kind === "artist" ? "artist" : "label"}
            siteHost={SITE_HOST}
            initial={{ name: org.name, slug: org.slug, timezone: org.timezone, locationLabel: org.locationLabel, accentColor: org.accentColor, logoUrl: org.logoUrl }}
          />
        </CardContent>
      </Card>

      <Card id="appearance" className="scroll-mt-24">
        <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Desktop and mobile.</CardDescription></CardHeader>
        <CardContent>
          <AppearanceForm initial={{ themePreference: org.themePreference, themePublic: org.themePublic, dashboardGlow: org.dashboardGlow }} orgName={org.name} locationLabel={org.locationLabel} accent={org.accentColor} />
        </CardContent>
      </Card>

      <Card id="pixels" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Pixels (whole account)</CardTitle>
          <CardDescription>Set once. They fire on every release page in your catalogue: PageView on load, plus a click event on every platform button.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrgFieldsForm
            disabled={plan.pixels ? undefined : "Pixels are on paid plans"}
            fields={[{ key: "metaPixelId", label: "Meta Pixel ID", placeholder: "123456789012345" }, { key: "tiktokPixelId", label: "TikTok Pixel ID", placeholder: "C1A2B3C4D5E6F7" }, { key: "ga4Id", label: "GA4 Measurement ID", placeholder: "G-XXXXXXXXXX" }]}
            initial={{ metaPixelId: org.metaPixelId ?? "", tiktokPixelId: org.tiktokPixelId ?? "", ga4Id: org.ga4Id ?? "" }}
          />
        </CardContent>
      </Card>

      <Card id="email" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Release-day email</CardTitle>
          <CardDescription>
            Sent from {process.env.RESEND_FROM_EMAIL || "RESEND_FROM_EMAIL"} with {org.kind === "artist" ? "your artist name" : "your label"} as the sender name. Replies go to your reply-to address.
            {!emailConfigured() && " ⚠ RESEND_API_KEY isn't set on this deployment, so emails won't send."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgFieldsForm fields={[{ key: "emailFromName", label: "Sender name", placeholder: org.name }, { key: "emailReplyTo", label: "Reply-to email", placeholder: org.kind === "artist" ? "you@yourname.com" : "hello@yourlabel.com" }]} initial={{ emailFromName: org.emailFromName ?? "", emailReplyTo: org.emailReplyTo ?? "" }} />
          <div className="mt-6 border-t pt-6"><EmailHourForm initial={org.releaseEmailHour} /></div>
        </CardContent>
      </Card>

      <Card id="domain" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Custom domain</CardTitle>
          <CardDescription>Serve every release from your own domain, e.g. {org.kind === "artist" ? "presave.yourname.com" : "presave.yourlabel.com"}/track-name. <Link className="underline" href="/docs/custom-domain">Setup guide</Link></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrgFieldsForm disabled={plan.customDomain ? undefined : org.kind === "artist" ? "Custom domains are on Artist Pro" : "Custom domains are on Pro and Label"} fields={[{ key: "customDomain", label: "Domain", placeholder: org.kind === "artist" ? "presave.yourname.com" : "presave.yourlabel.com" }]} initial={{ customDomain: org.customDomain ?? "" }} />
          {org.customDomain && !plan.customDomain && (() => {
            const st = customDomainStatus(org);
            return (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {st.active && st.graceUntil
                  ? <>Custom domains are on {org.kind === "artist" ? "Artist Pro" : "Pro and Label"}. <strong>{org.customDomain}</strong> keeps working until {st.graceUntil.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. After that, visitors are sent to the same pages on droplr.fm, so shared links keep working.</>
                  : <><strong>{org.customDomain}</strong> is paused: visitors are sent to the same pages on droplr.fm/{org.slug}, and new links use droplr.fm.</>}{" "}
                <Link className="underline" href="/admin/settings/billing">Upgrade to switch it back on</Link>
              </div>
            );
          })()}
          {(() => {
            const view = domainSetupView(org);
            return view && view.state !== "paused" ? <DomainSetup view={view} /> : null;
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
