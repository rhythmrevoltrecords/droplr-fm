import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signupsOpen } from "@/lib/launch";
import { CONTACT } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start free" };

type SP = { error?: string; plan?: string; invite?: string; closed?: string; waitlisted?: string; waitlist_error?: string; type?: string };

/** Pre-launch: waitlist, with a small "have an invite?" route to the real form (the API still enforces the allowlist). */
function InviteOnly({ searchParams }: { searchParams: SP }) {
  if (searchParams.waitlisted) {
    return (
      <AuthShell title="You're on the list" subtitle="We'll email you when droplr.fm opens to more artists and labels.">
        <Button asChild variant="outline" className="w-full"><Link href="/">Back to droplr.fm</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="droplr.fm is invite-only for now" subtitle="We're onboarding a small group of artists and labels first. Leave your email and we'll let you know when signups open.">
      <form method="post" action="/api/waitlist/launch" className="space-y-4">
        {/* honeypot */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <div className="space-y-2"><Label htmlFor="email">Your email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        {searchParams.waitlist_error && <p className="text-sm text-red-400">Enter a valid email address.</p>}
        {searchParams.closed && <p className="text-sm text-amber-400">That email doesn&apos;t have an early-access invite yet. Join the waitlist, or email {CONTACT.hello}.</p>}
        <p className="text-xs text-muted-foreground">We&apos;ll only use this to tell you when droplr.fm opens. <Link href="/legal/privacy" className="underline">Privacy</Link></p>
        <Button className="w-full" type="submit">Request early access</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Have an invite? <Link className="text-foreground underline" href="/signup?invite=1">Create your account</Link> · <Link className="text-foreground underline" href="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}

export default async function SignupPage(props: { searchParams: Promise<SP> }) {
  const searchParams = await props.searchParams;
  if (!signupsOpen() && !searchParams.invite) return <InviteOnly searchParams={searchParams} />;
  const kind = searchParams.type === "artist" || searchParams.plan?.startsWith("artist") ? "artist" : "label";
  const planNames: Record<string, string> = { artist: "Artist", artist_pro: "Artist Pro", pro: "Pro", label: "Label" };
  const plan = searchParams.plan && planNames[searchParams.plan] && (kind === "artist" ? searchParams.plan.startsWith("artist") : !searchParams.plan.startsWith("artist")) ? searchParams.plan : null;
  const keep = (type: string) => `/signup?type=${type}${searchParams.invite ? "&invite=1" : ""}`;
  return (
    <AuthShell
      title={plan ? "Create your account" : "Start free"}
      subtitle={plan ? `Create your ${kind} account, then choose ${planNames[plan]} billing on the next screen.` : kind === "artist" ? "Pre-saves, a fan list and promo tools for your own releases. 3 releases free, no card." : "Smart links, pre-saves and a roster for your label. 3 releases free, no card."}
    >
      <div role="radiogroup" aria-label="Account type" className="mb-5 grid grid-cols-2 rounded-xl border p-1 text-sm">
        {(["artist", "label"] as const).map((k) => (
          <Link key={k} role="radio" aria-checked={kind === k} href={keep(k)} className={`rounded-lg px-3 py-2 text-center font-medium transition ${kind === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {k === "artist" ? "I'm an artist" : "I run a label"}
          </Link>
        ))}
      </div>
      <form method="post" action="/api/auth/signup" className="space-y-4">
        <input type="hidden" name="kind" value={kind} />
        <div className="space-y-2"><Label htmlFor="orgName">{kind === "artist" ? "Artist name" : "Label name"}</Label><Input id="orgName" name="orgName" required placeholder={kind === "artist" ? "Ototo" : "Rhythm Revolt Records"} /></div>
        <div className="space-y-2"><Label htmlFor="email">Your email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        {plan && <input type="hidden" name="plan" value={plan} />}
        <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <input type="checkbox" name="terms" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500" />
          <span>I agree to the <Link className="text-foreground underline" href="/legal/terms" target="_blank">Terms of Service</Link> and <Link className="text-foreground underline" href="/legal/privacy" target="_blank">Privacy Policy</Link>, including the <Link className="text-foreground underline" href="/legal/data-processing" target="_blank">Data Processing Terms</Link> for fan data.</span>
        </label>
        {searchParams.error && <p className="text-sm text-red-400">{searchParams.error}</p>}
        <Button className="w-full" type="submit">{kind === "artist" ? "Create artist account" : "Create label account"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">Have an account? <Link className="text-foreground underline" href="/login">Log in</Link></p>
    </AuthShell>
  );
}
