import Link from "next/link";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { Card } from "@/components/ui/card";
import { accountEmailShell, passwordChangedEmail, resetPasswordEmail, verifyEmailEmail } from "@/lib/account-email";
import { button, quote } from "@/lib/email-design";
import { renderReleaseDayEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/env";
import { requirePlatformAdmin } from "@/lib/platform";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emails · Platform", robots: { index: false, follow: false } };

const sampleRelease = (over: Partial<Parameters<typeof renderReleaseDayEmail>[0]> = {}) =>
  renderReleaseDayEmail({
    preSaveId: "preview", releaseId: "preview", pst: "preview", unsub: "preview",
    title: "Mess It Up", artistName: "Ototo", orgName: "Rhythm Revolt Records",
    coverUrl: `${SITE_URL}/demo/email-sample-cover.jpg`, accentColor: "#8B5CF6",
    publicUrl: `${SITE_URL}/demo/demo-track`, linkBase: SITE_URL,
    platforms: ["appleMusic", "spotify", "beatport", "youtubeMusic", "soundcloud"], leadPlatform: "appleMusic",
    spotifyArtistId: "70Xz86ytGtHqZfHFEZ4w0V", logoUrl: null, showBranding: true,
    ...over,
  });

/** Every email droplr sends, rendered with sample data. */
export default async function PlatformEmails(props: { searchParams: Promise<{ e?: string }> }) {
  const [admin, sp] = await Promise.all([requirePlatformAdmin(), props.searchParams]);
  const emails = [
    { key: "release", group: "Fans", label: "Release day (Free plan, fan picked Apple Music)", ...sampleRelease() },
    { key: "release-pro", group: "Fans", label: "Release day (paid plan, orange accent, no droplr footer)", ...sampleRelease({ accentColor: "#F97316", showBranding: false, leadPlatform: null, platforms: ["spotify", "appleMusic", "tidal", "deezer", "bandcamp"] }) },
    { key: "verify", group: "Accounts", label: "Confirm your email", ...verifyEmailEmail(`${SITE_URL}/api/auth/verify-email?t=preview`) },
    { key: "reset", group: "Accounts", label: "Reset password", ...resetPasswordEmail(`${SITE_URL}/reset-password?token=preview`) },
    { key: "changed", group: "Accounts", label: "Password changed", ...passwordChangedEmail(new Date()) },
    { key: "fb-team", group: "Feedback", label: "New feedback (to you)", subject: "[droplr feedback] Pre-save email didn't arrive", html: accountEmailShell("New feedback: Pre-save email didn&#39;t arrive", `<p style="margin:0 0 14px;color:#a1a1aa;font-size:13px">artist@example.com · Test Records · Artist · Something&#39;s broken</p>${quote("A fan in the UK said they never got the release-day email.")}<div style="margin:24px 0 4px">${button(`${SITE_URL}/platform/feedback`, "Reply in the platform console")}</div>`) },
    { key: "fb-user", group: "Feedback", label: "Team replied (to the user)", subject: "Re: Pre-save email didn't arrive", html: accountEmailShell("The droplr.fm team replied", `<p style="margin:0 0 14px;color:#a1a1aa;font-size:13px">About: Pre-save email didn&#39;t arrive</p>${quote("Thanks for flagging! UK fans get it at 9am their time. Can you check again tomorrow?")}<div style="margin:24px 0 4px">${button(`${SITE_URL}/admin/feedback`, "Read and reply")}</div>`) },
  ];
  const current = emails.find((e) => e.key === sp.e) ?? emails[0];
  return (
    <PlatformChrome email={admin.email} active="emails">
      <div>
        <h1 className="text-2xl font-semibold">Emails</h1>
        <p className="text-sm text-muted-foreground">What people receive, rendered with sample data. Release-day emails go out as the artist or label, in their accent colour; account emails are droplr.fm branded.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-4 text-sm">
          {["Fans", "Accounts", "Feedback"].map((g) => (
            <div key={g}>
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
              {emails.filter((e) => e.group === g).map((e) => (
                <Link key={e.key} href={`/platform/emails?e=${e.key}`} className={cn("block rounded-md px-3 py-2", e.key === current.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{e.label}</Link>
              ))}
            </div>
          ))}
        </nav>
        <Card className="overflow-hidden p-0">
          <div className="border-b px-4 py-3 text-sm"><span className="text-muted-foreground">Subject:</span> {current.subject}</div>
          <iframe title={current.label} srcDoc={current.html} sandbox="" className="h-[1100px] w-full bg-[#0B0A10]" />
        </Card>
      </div>
    </PlatformChrome>
  );
}
