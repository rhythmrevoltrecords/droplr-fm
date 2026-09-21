import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ctaCopy } from "@/lib/launch";
import { NOINDEX } from "@/lib/seo";

// Home Screen / install from the login page opens as the dashboard app.
export const metadata = { ...NOINDEX, title: "Log in", manifest: "/app/manifest.webmanifest", appleWebApp: { capable: true, title: "droplr", statusBarStyle: "black-translucent" as const } };

export default async function LoginPage(props: { searchParams: Promise<{ error?: string; next?: string; verified?: string; verify?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <AuthShell title="Log in" subtitle="Label owners land in Admin. Artists land in their Dashboard.">
      <form method="post" action="/api/auth/login" className="space-y-4">
        <input type="hidden" name="next" value={searchParams.next ?? ""} />
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs text-muted-foreground underline hover:text-foreground">Forgot password?</Link></div>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {searchParams.verified && <p className="text-sm text-emerald-400">Email confirmed. Log in to carry on.</p>}
        {searchParams.verify === "invalid" && <p className="text-sm text-red-400">That confirmation link is invalid, used or expired. Log in and press Resend link.</p>}
        {searchParams.error === "locked" ? (
          <p className="text-sm text-red-400">Too many failed attempts. Wait 15 minutes, or <Link href="/forgot-password" className="underline">reset your password</Link>.</p>
        ) : searchParams.error ? (
          <p className="text-sm text-red-400">Wrong email or password.</p>
        ) : null}
        <Button className="w-full" type="submit">Log in</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">New label? <Link className="text-foreground underline" href="/signup">{ctaCopy().open ? "Start free" : "Request early access"}</Link></p>
    </AuthShell>
  );
}
