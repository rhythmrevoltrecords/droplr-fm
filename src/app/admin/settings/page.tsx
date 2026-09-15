import Link from "next/link";
import { OrgFieldsForm } from "@/components/admin/org-forms";
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

      <Card>
        <CardHeader><CardTitle>Label</CardTitle><CardDescription>Plan: {plan.name}. Your free subdomain is {org.slug}.droplr.fm</CardDescription></CardHeader>
        <CardContent><OrgFieldsForm fields={[{ key: "name", label: "Label name" }]} initial={{ name: org.name }} /></CardContent>
      </Card>

      <Card>
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

      <Card>
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

      <Card>
        <CardHeader>
          <CardTitle>Custom domain</CardTitle>
          <CardDescription>Serve every release from your own domain, e.g. presave.yourlabel.com/track-name. <Link className="underline" href="/docs/custom-domain">Setup guide</Link></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrgFieldsForm disabled={plan.customDomain ? undefined : "Custom domains are on Pro and above"} fields={[{ key: "customDomain", label: "Domain", placeholder: "presave.yourlabel.com" }]} initial={{ customDomain: org.customDomain ?? "" }} />
          {org.customDomain && (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
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
