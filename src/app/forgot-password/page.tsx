import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CONTACT } from "@/lib/legal";

export const metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  if (searchParams.sent) {
    return (
      <AuthShell title="Check your email" subtitle="If there's a droplr.fm account for that address, we've sent a link to reset the password. It expires in 60 minutes.">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Nothing arrived after a few minutes? Check spam, and make sure you used the email you log in with.</p>
          <p>Still stuck? Email <a className="text-foreground underline" href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>.</p>
          <Button asChild variant="outline" className="w-full"><Link href="/login">Back to log in</Link></Button>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter the email you log in with and we'll send you a reset link.">
      <form method="post" action="/api/auth/forgot" className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" autoFocus /></div>
        {searchParams.error && <p className="text-sm text-red-400">Enter a valid email address.</p>}
        <Button className="w-full" type="submit">Send reset link</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">Remembered it? <Link className="text-foreground underline" href="/login">Log in</Link></p>
    </AuthShell>
  );
}
