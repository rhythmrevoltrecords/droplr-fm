import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const metadata = { title: "Start free" };

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <AuthShell title="Start free" subtitle="3 releases, email pre-saves and release-day emails. No card.">
      <form method="post" action="/api/auth/signup" className="space-y-4">
        <div className="space-y-2"><Label htmlFor="orgName">Label name</Label><Input id="orgName" name="orgName" required placeholder="Rhythm Revolt Records" /></div>
        <div className="space-y-2"><Label htmlFor="email">Your email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        {searchParams.error && <p className="text-sm text-red-400">{searchParams.error}</p>}
        <Button className="w-full" type="submit">Create label account</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">Have an account? <Link className="text-foreground underline" href="/login">Log in</Link></p>
    </AuthShell>
  );
}
