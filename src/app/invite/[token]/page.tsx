import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params, searchParams }: { params: { token: string }; searchParams: { error?: string } }) {
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(params.token) }, include: { organization: true } });
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();
  if (!valid) return <AuthShell title="Invite expired" subtitle="Ask your label to send a new invite link." ><span /></AuthShell>;
  return (
    <AuthShell title={`Join ${invite.organization.name}`} subtitle={`Set a password for ${invite.email}. You'll see your releases, links and stats.`}>
      <form method="post" action="/api/auth/invite" className="space-y-4">
        <input type="hidden" name="token" value={params.token} />
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        {searchParams.error && <p className="text-sm text-red-400">{searchParams.error}</p>}
        <Button className="w-full" type="submit">Open my dashboard</Button>
      </form>
    </AuthShell>
  );
}
