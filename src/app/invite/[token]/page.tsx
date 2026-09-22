import Link from "next/link";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { NOINDEX } from "@/lib/seo";
import { getCurrentUser } from "@/lib/auth";

// Never indexed: signed in, or the URL itself is the credential. See lib/seo NEVER_INDEX.
export const metadata = { ...NOINDEX };

export const dynamic = "force-dynamic";

export default async function InvitePage(
  props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(params.token) }, include: { organization: true } });
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();
  if (!valid) return <AuthShell title="Invite expired" subtitle="Ask your label to send a new invite link." ><span /></AuthShell>;

  // A link invite doesn't create anything: it grants an account that already exists read access
  // to the releases this label puts out under that artist's name. Only the artist can accept it,
  // and only from the account the invitation names — a forwarded link is useless to anyone else.
  if (invite.kind === "link") {
    const me = await getCurrentUser();
    if (!me) {
      return (
        <AuthShell title={`${invite.organization.name} wants to link your account`} subtitle={`Log in as ${invite.email}, then open this link again to accept.`}>
          <Button className="w-full" asChild><Link href={`/login?next=${encodeURIComponent(`/invite/${params.token}`)}`}>Log in</Link></Button>
        </AuthShell>
      );
    }
    if (me.email.toLowerCase() !== invite.email.toLowerCase()) {
      return (
        <AuthShell title="Wrong account" subtitle={`This invitation was sent to ${invite.email}, and you're signed in as ${me.email}.`}><span /></AuthShell>
      );
    }
    return (
      <AuthShell
        title={`Link your account to ${invite.organization.name}`}
        subtitle="You keep your own account. Nothing is merged."
      >
        <form method="post" action="/api/roster-link" className="space-y-4">
          <input type="hidden" name="token" value={params.token} />
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>You&apos;ll see the releases {invite.organization.name} puts out under your name — numbers, links and QR codes.</li>
            <li>You can&apos;t edit them; they stay the label&apos;s.</li>
            <li>Their fan list stays theirs, and nothing of yours is shared with them.</li>
            <li>You can end the link whenever you want.</li>
          </ul>
          {searchParams.error && <p className="text-sm text-red-400">{searchParams.error}</p>}
          <Button className="w-full" type="submit">Accept</Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${invite.organization.name}`} subtitle={`Set a password for ${invite.email}. You'll see your releases, links and stats.`}>
      <form method="post" action="/api/auth/invite" className="space-y-4">
        <input type="hidden" name="token" value={params.token} />
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <input type="checkbox" name="terms" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500" />
          <span>I agree to the <Link className="text-foreground underline" href="/legal/terms" target="_blank">Terms of Service</Link> and <Link className="text-foreground underline" href="/legal/privacy" target="_blank">Privacy Policy</Link>.</span>
        </label>
        {searchParams.error && <p className="text-sm text-red-400">{searchParams.error}</p>}
        <Button className="w-full" type="submit">Open my dashboard</Button>
      </form>
    </AuthShell>
  );
}
