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
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required autoComplete="current-password" /></div>
        {searchParams.error && <p className="text-sm text-red-400">Wrong email or password.</p>}
        <Button className="w-full" type="submit">Log in</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">New label? <Link className="text-foreground underline" href="/signup">Start free</Link></p>
    </AuthShell>
  );
}
