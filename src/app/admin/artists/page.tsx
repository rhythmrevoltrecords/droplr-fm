import { InviteForm, RemoveMemberButton } from "@/components/admin/org-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { releaseTotals } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { fmtNum, pct } from "@/lib/utils";

export default async function RosterPage() {
  const user = await requireUser("label");
  const plan = planOf(user.organization.plan);
  const [members, invites, releases] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    prisma.invite.findMany({ where: { organizationId: user.organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    prisma.release.findMany({ where: { organizationId: user.organizationId }, select: { id: true, artistId: true } }),
  ]);
  const totals = await releaseTotals(releases.map((r) => r.id));
  const perArtist = new Map<string, { releases: number; views: number; clicks: number; presaves: number }>();
  for (const r of releases) {
    if (!r.artistId) continue;
    const t = totals.get(r.id)!;
    const cur = perArtist.get(r.artistId) ?? { releases: 0, views: 0, clicks: 0, presaves: 0 };
    perArtist.set(r.artistId, { releases: cur.releases + 1, views: cur.views + t.views, clicks: cur.clicks + t.clicks, presaves: cur.presaves + t.presaves });
  }
  const artistCount = members.filter((m) => m.role === "artist").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Roster</h1>
        <p className="text-sm text-muted-foreground">
          {artistCount} artist{artistCount === 1 ? "" : "s"}{Number.isFinite(plan.artists) ? ` of ${plan.artists} on ${plan.name}` : ""}. Artists see only their own releases and can copy links, but can&apos;t edit URLs.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Invite</CardTitle><CardDescription>They set a password and land on their own dashboard.</CardDescription></CardHeader>
        <CardContent><InviteForm allowAdmin={plan.whiteLabel} /></CardContent>
      </Card>
      <Card className="p-0">
        <Table>
          <THead><TR><TH>Member</TH><TH>Role</TH><TH className="text-right">Releases</TH><TH className="text-right">Views</TH><TH className="text-right">Clicks</TH><TH className="text-right">CTR</TH><TH className="text-right">Pre-saves</TH><TH /></TR></THead>
          <TBody>
            {members.map((m) => {
              const s = perArtist.get(m.id);
              return (
                <TR key={m.id}>
                  <TD><div className="font-medium">{m.artistName ?? m.email}</div>{m.artistName && <div className="text-xs text-muted-foreground">{m.email}</div>}</TD>
                  <TD><Badge variant={m.role === "artist" ? "secondary" : "default"}>{m.role}</Badge></TD>
                  <TD className="text-right tabular-nums">{s?.releases ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{s ? fmtNum(s.views) : "—"}</TD>
                  <TD className="text-right tabular-nums">{s ? fmtNum(s.clicks) : "—"}</TD>
                  <TD className="text-right tabular-nums">{s ? pct(s.clicks, s.views) : "—"}</TD>
                  <TD className="text-right tabular-nums">{s ? fmtNum(s.presaves) : "—"}</TD>
                  <TD className="text-right">{m.role !== "owner" && user.role === "owner" && <RemoveMemberButton userId={m.id} />}</TD>
                </TR>
              );
            })}
            {invites.map((i) => (
              <TR key={i.id}>
                <TD><div className="font-medium">{i.artistName ?? i.email}</div><div className="text-xs text-muted-foreground">{i.email}</div></TD>
                <TD><Badge variant="warning">invited</Badge></TD>
                <TD colSpan={5} className="text-xs text-muted-foreground">Pending · expires {i.expiresAt.toLocaleDateString("en-AU")}</TD>
                <TD className="text-right">{user.role === "owner" && <RemoveMemberButton inviteId={i.id} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
