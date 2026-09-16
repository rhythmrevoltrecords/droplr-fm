import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  return (
    <AuthShell title="Log in" subtitle="Label owners land in Admin. Artists land in their Dashboard.">
      <form method="post" action="/api/auth/login" className="space-y-4">
        <input type="hidden" name="next" value={searchParams.next ?? ""} />
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs text-muted-foreground underline hover:text-foreground">Forgot password?</Link></div>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {searchParams.error === "locked" ? (
          <p className="text-sm text-red-400">Too many failed attempts. Wait 15 minutes, or <Link href="/forgot-password" className="underline">reset your password</Link>.</p>
        ) : searchParams.error ? (
          <p className="text-sm text-red-400">Wrong email or password.</p>
        ) : null}
        <Button className="w-full" type="submit">Log in</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">New label? <Link className="text-foreground underline" href="/signup">Start free</Link></p>
    </AuthShell>
  );
}
