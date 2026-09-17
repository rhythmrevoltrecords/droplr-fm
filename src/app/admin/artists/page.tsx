import Link from "next/link";
import { redirect } from "next/navigation";
import { AddArtistForm, ArtistAvatar } from "@/components/admin/artist-forms";
import { InviteForm, RemoveMemberButton } from "@/components/admin/org-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { releaseTotals } from "@/lib/analytics";
import { ARTIST_STATUS_LABELS, ARTIST_STATUSES, isArtistStatus } from "@/lib/artist-fields";
import { artistLimitMessage, artistSeatsUsed } from "@/lib/artists";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { fmtNum } from "@/lib/utils";

export const metadata = { title: "Roster" };

const statusVariant = (s: string) => (s === "active" ? "success" : s === "prospect" ? "warning" : "secondary");

export default async function RosterPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser("label");
  // Artist accounts have a single profile: go straight to it (create it if an older account has none).
  if (user.organization.kind === "artist") {
    const own = (await prisma.artist.findFirst({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true } }))
      ?? (await prisma.artist.create({ data: { organizationId: user.organizationId, name: user.organization.name, email: user.email }, select: { id: true } }));
    redirect(`/admin/artists/${own.id}`);
  }
  const plan = planOf(user.organization.plan);
  const orgId = user.organizationId;
  const filter = isArtistStatus(searchParams.status) ? searchParams.status : null;
  const now = new Date();

  const [artists, seats, invites, team, releases] = await Promise.all([
    prisma.artist.findMany({ where: { organizationId: orgId }, orderBy: [{ name: "asc" }], select: { id: true, name: true, status: true, genre: true, photoUrl: true, accentColor: true, userId: true } }),
    artistSeatsUsed(orgId),
    prisma.invite.findMany({ where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } }),
    plan.whiteLabel ? prisma.user.findMany({ where: { organizationId: orgId, role: { in: ["owner", "admin"] } }, orderBy: [{ role: "desc" }, { createdAt: "asc" }] }) : Promise.resolve([]),
    prisma.release.findMany({ where: { organizationId: orgId, artistProfileId: { not: null } }, select: { id: true, artistProfileId: true } }),
  ]);

  // Views / clicks / pre-saves summed per profile.
  const totals = await releaseTotals(releases.map((r) => r.id));
  const perArtist = new Map<string, { releases: number; views: number; clicks: number; presaves: number }>();
  for (const r of releases) {
    const t = totals.get(r.id)!;
    const cur = perArtist.get(r.artistProfileId!) ?? { releases: 0, views: 0, clicks: 0, presaves: 0 };
    perArtist.set(r.artistProfileId!, { releases: cur.releases + 1, views: cur.views + t.views, clicks: cur.clicks + t.clicks, presaves: cur.presaves + t.presaves });
  }
  const invitedProfiles = new Set(invites.map((i) => i.artistProfileId).filter(Boolean));
  const genericArtistInvites = invites.filter((i) => i.role === "artist" && !i.artistProfileId);
  const adminInvites = invites.filter((i) => i.role === "admin");
  const counts = Object.fromEntries(ARTIST_STATUSES.map((s) => [s, artists.filter((a) => a.status === s).length]));
  const shown = filter ? artists.filter((a) => a.status === filter) : artists;
  const limited = Number.isFinite(plan.artists);
  const atLimit = limited && seats.used >= plan.artists;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Roster</h1>
        <p className="text-sm text-muted-foreground">
          {artists.length} artist{artists.length === 1 ? "" : "s"}{limited ? ` of ${plan.artists} on ${plan.name}` : ""}
          {seats.pending > 0 && ` · ${seats.pending} pending invite${seats.pending === 1 ? "" : "s"}`}. Artists don&apos;t need a login to be on the roster.
          {atLimit && <> <Link href="/admin/settings/billing" className="text-violet-400 underline">Upgrade for more artists</Link></>}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Add artist</CardTitle><CardDescription>Start a profile now. Invite them to log in whenever you&apos;re ready.</CardDescription></CardHeader>
        <CardContent><AddArtistForm limitReached={atLimit ? artistLimitMessage(user.organization.plan) : undefined} /></CardContent>
      </Card>

      <section className="space-y-4">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
          {[{ key: null, label: "All", n: artists.length }, ...ARTIST_STATUSES.map((s) => ({ key: s, label: ARTIST_STATUS_LABELS[s], n: counts[s] }))].map((c) => (
            <Link
              key={c.label}
              href={c.key ? `/admin/artists?status=${c.key}` : "/admin/artists"}
              aria-current={filter === c.key ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${filter === c.key ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              {c.label} <span className="tabular-nums opacity-70">{c.n}</span>
            </Link>
          ))}
        </nav>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const s = perArtist.get(a.id);
            return (
              <Link key={a.id} href={`/admin/artists/${a.id}`} className="group block min-w-0">
                <Card className="h-full p-4 transition-colors group-hover:border-white/20 group-hover:bg-white/[0.02]">
                  <div className="flex min-w-0 items-center gap-3">
                    <ArtistAvatar name={a.name} photoUrl={a.photoUrl} accentColor={a.accentColor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium group-hover:underline">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{a.genre || "No genre yet"}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant={statusVariant(a.status)}>{ARTIST_STATUS_LABELS[a.status as keyof typeof ARTIST_STATUS_LABELS] ?? a.status}</Badge>
                        {a.userId ? <Badge variant="default">Has login</Badge> : invitedProfiles.has(a.id) ? <Badge variant="warning">Invited</Badge> : <Badge variant="secondary">No login</Badge>}
                      </div>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                    {[["Releases", s?.releases ?? 0], ["Views", s?.views ?? 0], ["Clicks", s?.clicks ?? 0], ["Pre-saves", s?.presaves ?? 0]].map(([k, n]) => (
                      <div key={k} className="min-w-0 rounded-lg bg-secondary/50 px-1 py-2">
                        <dd className="truncate text-sm font-semibold tabular-nums">{fmtNum(Number(n))}</dd>
                        <dt className="truncate text-muted-foreground">{k}</dt>
                      </div>
                    ))}
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
        {!shown.length && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            {filter ? `No ${ARTIST_STATUS_LABELS[filter].toLowerCase()} artists.` : "No artists yet. Add your first one above."}
          </Card>
        )}

        {genericArtistInvites.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Pending artist invites</CardTitle><CardDescription>Each gets a roster profile when accepted.</CardDescription></CardHeader>
            <CardContent className="divide-y">
              {genericArtistInvites.map((i) => (
                <div key={i.id} className="flex min-w-0 flex-wrap items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.artistName ?? i.email}</div><div className="truncate text-xs text-muted-foreground">{i.email} · expires {i.expiresAt.toLocaleDateString("en-AU")}</div></div>
                  {user.role === "owner" && <RemoveMemberButton inviteId={i.id} />}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {plan.whiteLabel && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Team</h2>
            <p className="text-sm text-muted-foreground">Admins manage every release and artist. They aren&apos;t on the roster.</p>
          </div>
          <Card>
            <CardContent className="divide-y p-0 px-5">
              {team.map((m) => (
                <div key={m.id} className="flex min-w-0 flex-wrap items-center gap-2 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{m.email}</span>
                  <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                  {m.role !== "owner" && user.role === "owner" && <RemoveMemberButton userId={m.id} />}
                </div>
              ))}
              {adminInvites.map((i) => (
                <div key={i.id} className="flex min-w-0 flex-wrap items-center gap-2 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.email} <span className="text-xs text-muted-foreground">· expires {i.expiresAt.toLocaleDateString("en-AU")}</span></span>
                  <Badge variant="warning">invited</Badge>
                  {user.role === "owner" && <RemoveMemberButton inviteId={i.id} />}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Invite an admin</CardTitle><CardDescription>They set a password and get full label access.</CardDescription></CardHeader>
            <CardContent><InviteForm allowAdmin adminOnly /></CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
