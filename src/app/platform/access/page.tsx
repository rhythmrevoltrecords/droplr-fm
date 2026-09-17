import Link from "next/link";
import { InviteActions, InviteForm, WaitlistInviteButton } from "@/components/platform/access-console";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { accountEmailConfigured } from "@/lib/account-email";
import { prisma } from "@/lib/db";
import { signupAllowlist, signupsOpen } from "@/lib/launch";
import { requirePlatformAdmin } from "@/lib/platform";
import { planOf } from "@/lib/plans";
import { inviteCodeOf, inviteState, inviteUrl } from "@/lib/signup-invites";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access · Platform", robots: { index: false, follow: false } };

const TZ = "Australia/Brisbane";
const stateVariant = { active: "success", used: "secondary", expired: "warning", revoked: "danger" } as const;

/** Owner console: who can create an account while signups are closed. Invite links, the env allowlist, and the launch waitlist. */
export default async function PlatformAccess() {
  const admin = await requirePlatformAdmin();
  const [invites, waitlist] = await Promise.all([
    prisma.signupInvite.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { organizations: { select: { id: true, name: true, slug: true, plan: true }, orderBy: { createdAt: "asc" } } } }),
    prisma.waitlistFeature.findMany({ where: { featureName: "launch" }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const waitEmails = waitlist.map((w) => w.email);
  const [accounts, invitedEmails] = await Promise.all([
    prisma.user.findMany({ where: { email: { in: waitEmails } }, select: { email: true } }),
    prisma.signupInvite.findMany({ where: { email: { in: waitEmails } }, select: { email: true, uses: true, maxUses: true, expiresAt: true, revokedAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const hasAccount = new Set(accounts.map((a) => a.email));
  const latestInvite = new Map<string, (typeof invitedEmails)[number]>();
  for (const i of invitedEmails) if (i.email && !latestInvite.has(i.email)) latestInvite.set(i.email, i);

  const now = new Date();
  const open = signupsOpen();
  const allowlist = signupAllowlist();
  const emailReady = accountEmailConfigured();
  const active = invites.filter((i) => inviteState(i, now) === "active").length;
  const joined = invites.reduce((n, i) => n + i.organizations.length, 0);

  return (
    <PlatformChrome email={admin.email} active="access">
      <div>
        <h1 className="text-2xl font-semibold">Access</h1>
        <p className="text-sm text-muted-foreground">{active} active invite{active === 1 ? "" : "s"} · {joined} account{joined === 1 ? "" : "s"} created from invites · {waitlist.length} on the waitlist</p>
      </div>

      <Card className="space-y-1 p-4 text-sm">
        <p>
          Signups are <Badge variant={open ? "success" : "warning"}>{open ? "open to everyone" : "closed (invite-only)"}</Badge>
          {open ? " Invite links still work." : " People can only create an account with an invite link below, or an email in SIGNUP_ALLOWLIST."}
        </p>
        <p className="text-xs text-muted-foreground">
          SIGNUP_ALLOWLIST (Netlify env): {allowlist.length ? allowlist.join(", ") : "empty"}. Invite links don&apos;t need a redeploy, so use them instead of editing the env. Artists a label adds to its roster are invited from that label&apos;s dashboard, not here.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Invite people</h2>
        <InviteForm emailReady={emailReady} />
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Invites</h2>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead><TR><TH>Who</TH><TH>Type</TH><TH>Status</TH><TH>Accounts</TH><TH>Link works until</TH><TH /></TR></THead>
            <TBody>
              {invites.map((i) => {
                const state = inviteState(i, now);
                const code = state === "active" ? inviteCodeOf(i) : null;
                return (
                  <TR key={i.id}>
                    <TD>
                      <div className="font-medium">{i.email ?? `Open link`}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.email ? (i.emailedAt ? `emailed ${formatInTz(i.emailedAt, TZ, { dateStyle: "medium" })}` : "not emailed") : `${i.uses} of ${i.maxUses} used`}
                        {i.note ? ` · ${i.note}` : ""}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      {i.kind ? (i.kind === "artist" ? "Artist account" : "Label account") : "Artist or label"}
                      <div className="text-muted-foreground">Free plan</div>
                    </TD>
                    <TD><Badge variant={stateVariant[state]}>{state}</Badge></TD>
                    <TD className="text-xs">
                      {i.organizations.length ? i.organizations.slice(0, 5).map((o) => (
                        <div key={o.id}>
                          <Link className="underline" href={`/platform?q=${encodeURIComponent(o.slug)}`}>{o.name}</Link>
                          <span className="text-muted-foreground"> · {planOf(o.plan).name}</span>
                        </div>
                      )) : <span className="text-muted-foreground">—</span>}
                      {i.organizations.length > 5 && <div className="text-muted-foreground">+{i.organizations.length - 5} more</div>}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{formatInTz(i.expiresAt, TZ, { dateStyle: "medium" })}<div className="text-muted-foreground">made {formatInTz(i.createdAt, TZ, { dateStyle: "medium" })}</div></TD>
                    <TD><InviteActions id={i.id} url={code ? inviteUrl(code) : null} canResend={!!i.email && emailReady} /></TD>
                  </TR>
                );
              })}
              {!invites.length && <TR><TD colSpan={6} className="py-10 text-center text-muted-foreground">No invites yet.</TD></TR>}
            </TBody>
          </Table>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Waitlist</h2>
          <p className="text-sm text-muted-foreground">People who asked for early access on the signup page. Invite makes a single-use link for that email (emailed when account email is set up). Use the form above to pick the account type or a longer expiry.</p>
        </div>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead><TR><TH>Email</TH><TH>Joined</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {waitlist.map((w) => {
                const inv = latestInvite.get(w.email);
                const invState = inv ? inviteState(inv, now) : null;
                return (
                  <TR key={w.id}>
                    <TD className="font-medium">{w.email}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatInTz(w.createdAt, TZ, { dateStyle: "medium" })}</TD>
                    <TD>{hasAccount.has(w.email) ? <Badge variant="success">has an account</Badge> : invState ? <Badge variant={stateVariant[invState]}>invite {invState}</Badge> : <Badge variant="secondary">waiting</Badge>}</TD>
                    <TD>{!hasAccount.has(w.email) && invState !== "active" && <WaitlistInviteButton email={w.email} emailReady={emailReady} />}</TD>
                  </TR>
                );
              })}
              {!waitlist.length && <TR><TD colSpan={4} className="py-10 text-center text-muted-foreground">Nobody on the waitlist yet.</TD></TR>}
            </TBody>
          </Table>
        </Card>
      </section>
    </PlatformChrome>
  );
}
