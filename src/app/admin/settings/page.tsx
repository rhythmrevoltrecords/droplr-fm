import Link from "next/link";
import { OrgFieldsForm } from "@/components/admin/org-forms";
import { AppearanceForm, IdentityForm } from "@/components/admin/settings-forms";
import { SITE_HOST } from "@/lib/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { planOf } from "@/lib/plans";

export default async function SettingsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  const plan = planOf(org.plan);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Section tabs: horizontal from md up, stacked on phones */}
      <nav aria-label="Settings sections" className="flex flex-col gap-1 rounded-xl border p-1 text-sm md:flex-row md:overflow-x-auto">
        {[["identity", "Label identity"], ["appearance", "Appearance"], ["pixels", "Pixels"], ["email", "Release-day email"], ["domain", "Custom domain"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2.5 text-muted-foreground hover:bg-accent hover:text-foreground md:py-1.5">{label}</a>
        ))}
      </nav>

      <Card id="identity" className="scroll-mt-24">
        <CardHeader><CardTitle>Label identity</CardTitle><CardDescription>Plan: {plan.name}. Free subdomain: {org.slug}.droplr.fm</CardDescription></CardHeader>
        <CardContent>
          <IdentityForm
            siteHost={SITE_HOST}
            initial={{ name: org.name, slug: org.slug, timezone: org.timezone, locationLabel: org.locationLabel, accentColor: org.accentColor, logoUrl: org.logoUrl }}
          />
        </CardContent>
      </Card>

      <Card id="appearance" className="scroll-mt-24">
        <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Desktop and mobile.</CardDescription></CardHeader>
        <CardContent>
          <AppearanceForm initial={{ themePreference: org.themePreference, themePublic: org.themePublic }} orgName={org.name} locationLabel={org.locationLabel} accent={org.accentColor} />
        </CardContent>
      </Card>

      <Card id="pixels" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Pixels (label-level)</CardTitle>
          <CardDescription>Set once. They fire on every release page in your catalogue: PageView on load, plus a click event on every platform button.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrgFieldsForm
            disabled={plan.pixels ? undefined : "Pixels are on Pro and above"}
            fields={[{ key: "metaPixelId", label: "Meta Pixel ID", placeholder: "123456789012345" }, { key: "tiktokPixelId", label: "TikTok Pixel ID", placeholder: "C1A2B3C4D5E6F7" }, { key: "ga4Id", label: "GA4 Measurement ID", placeholder: "G-XXXXXXXXXX" }]}
            initial={{ metaPixelId: org.metaPixelId ?? "", tiktokPixelId: org.tiktokPixelId ?? "", ga4Id: org.ga4Id ?? "" }}
          />
        </CardContent>
      </Card>

      <Card id="email" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Release-day email</CardTitle>
          <CardDescription>
            Sent from {process.env.RESEND_FROM_EMAIL || "RESEND_FROM_EMAIL"} with your label as the sender name. Replies go to your reply-to address.
            {!emailConfigured() && " ⚠ RESEND_API_KEY isn't set on this deployment, so emails won't send."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgFieldsForm fields={[{ key: "emailFromName", label: "Sender name", placeholder: org.name }, { key: "emailReplyTo", label: "Reply-to email", placeholder: "hello@yourlabel.com" }]} initial={{ emailFromName: org.emailFromName ?? "", emailReplyTo: org.emailReplyTo ?? "" }} />
        </CardContent>
      </Card>

      <Card id="domain" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Custom domain</CardTitle>
          <CardDescription>Serve every release from your own domain, e.g. presave.yourlabel.com/track-name. <Link className="underline" href="/docs/custom-domain">Setup guide</Link></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrgFieldsForm disabled={plan.customDomain ? undefined : "Custom domains are on Pro and above"} fields={[{ key: "customDomain", label: "Domain", placeholder: "presave.yourlabel.com" }]} initial={{ customDomain: org.customDomain ?? "" }} />
          {org.customDomain && (
            <ol className="list-decimal space-y-1 break-words pl-5 text-sm text-muted-foreground [&_code]:break-all">
              <li>At your DNS provider add <code className="text-foreground">CNAME {org.customDomain.split(".")[0]} → droplr-fm.netlify.app</code></li>
              <li>droplr.fm admin adds <code className="text-foreground">{org.customDomain}</code> as a domain alias in Netlify → Domain management (SSL provisions automatically).</li>
              <li>Visit <code className="text-foreground">https://{org.customDomain}</code> to check.</li>
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
