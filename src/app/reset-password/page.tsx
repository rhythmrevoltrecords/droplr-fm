import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MIN_PASSWORD } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage(props: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const valid =
    /^[A-Za-z0-9_-]{20,100}$/.test(token) &&
    !!(await prisma.passwordResetToken.findFirst({ where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }));

  if (!valid) {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once and expire after 60 minutes. Request a new one.">
        <Button asChild className="w-full"><Link href="/forgot-password">Send a new link</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out everywhere else once it's changed.">
      <form method="post" action="/api/auth/reset" className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" minLength={MIN_PASSWORD} required autoComplete="new-password" autoFocus /></div>
        <div className="space-y-2"><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" name="confirm" type="password" minLength={MIN_PASSWORD} required autoComplete="new-password" /></div>
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters. A short phrase is easier to remember than symbols.</p>
        {searchParams.error && searchParams.error !== "invalid" && <p className="text-sm text-red-400">{searchParams.error}</p>}
        <Button className="w-full" type="submit">Save new password</Button>
      </form>
    </AuthShell>
  );
}
