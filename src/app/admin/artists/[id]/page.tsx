import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtistAvatar, ArtistLoginAccess, ArtistProfileEditor, DeleteArtistButton, type LoginState } from "@/components/admin/artist-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ARTIST_STATUS_LABELS, readSocialLinks } from "@/lib/artist-fields";
import { labelArtist } from "@/lib/artists";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatInTz, isReleased } from "@/lib/time";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Artist" };

export default async function ArtistProfilePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const user = await requireUser("label");
  const artist = await labelArtist(user, id);
  if (!artist) notFound();
  const tz = user.organization.timezone;

  const [login, invite, releases] = await Promise.all([
    artist.userId ? prisma.user.findFirst({ where: { id: artist.userId, organizationId: user.organizationId }, select: { email: true } }) : null,
    prisma.invite.findFirst({ where: { artistProfileId: artist.id, organizationId: user.organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    prisma.release.findMany({ where: { artistProfileId: artist.id, organizationId: user.organizationId }, orderBy: { releaseDate: "desc" }, select: { id: true, title: true, coverUrl: true, releaseDate: true } }),
  ]);
  const state: LoginState = login ? { kind: "login", email: login.email } : invite ? { kind: "invited", email: invite.email, expires: formatInTz(invite.expiresAt, tz, { dateStyle: "medium" }) } : { kind: "none" };
  const isOwner = user.role === "owner";
  // An artist account has exactly one profile: its own. No roster, status, login invites or delete.
  const own = user.organization.kind === "artist";

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
        <ArtistAvatar name={artist.name} photoUrl={artist.photoUrl} accentColor={artist.accentColor} size={72} />
        <div className="min-w-0 flex-1">
          {own ? <p className="text-sm text-muted-foreground">Your profile</p> : <p className="text-sm text-muted-foreground"><Link href="/admin/artists" className="hover:underline">Roster</Link> / Artist</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-2xl font-semibold">{artist.name}</h1>
            {!own && <Badge variant={artist.status === "active" ? "success" : artist.status === "prospect" ? "warning" : "secondary"}>{ARTIST_STATUS_LABELS[artist.status as keyof typeof ARTIST_STATUS_LABELS] ?? artist.status}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{[artist.genre, artist.location].filter(Boolean).join(" · ") || "Add a genre and location below."}</p>
        </div>
      </div>

      {searchParams.created && !own && <Card className="border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">Artist added. Fill in their profile, then invite them to log in when you&apos;re ready.</Card>}

      <div className={own ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        {!own && (
          <Card>
            <CardHeader><CardTitle>Login access</CardTitle></CardHeader>
            <CardContent><ArtistLoginAccess artistId={artist.id} state={state} isOwner={isOwner} defaultEmail={artist.email ?? ""} /></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Releases</CardTitle>
            <CardDescription>{releases.length ? `${releases.length} release${releases.length === 1 ? "" : "s"}.${own ? "" : " Assign more from a release's Settings tab."}` : own ? "None yet. Create one from Releases." : "None yet. Pick this artist when creating a release, or in a release's Settings tab."}</CardDescription>
          </CardHeader>
          {releases.length > 0 && (
            <CardContent className="max-h-72 space-y-1 overflow-y-auto">
              {releases.map((r) => (
                <Link key={r.id} href={`/admin/releases/${r.id}`} className="flex min-w-0 items-center gap-3 rounded-lg p-1.5 hover:bg-secondary/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.coverUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{formatInTz(r.releaseDate, tz, { dateStyle: "medium" })}</span>
                  {isReleased(r.releaseDate) ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Pre-save</Badge>}
                </Link>
              ))}
            </CardContent>
          )}
        </Card>
      </div>

      <ArtistProfileEditor
        mode="label"
        own={own}
        artistId={artist.id}
        statsUpdated={artist.statsUpdatedAt ? timeAgo(artist.statsUpdatedAt) : null}
        initial={{
          name: artist.name,
          status: artist.status,
          genre: artist.genre ?? "",
          location: artist.location ?? "",
          bio: artist.bio ?? "",
          website: artist.website ?? "",
          socialLinks: readSocialLinks(artist.socialLinks),
          photoUrl: artist.photoUrl ?? "",
          accentColor: artist.accentColor ?? "",
          pressPhotoUrls: artist.pressPhotoUrls,
          email: artist.email ?? "",
          phone: artist.phone ?? "",
          spotifyArtistId: artist.spotifyArtistId ?? "",
          monthlyListeners: artist.monthlyListeners?.toString() ?? "",
          followers: artist.followers?.toString() ?? "",
          notes: artist.notes ?? "",
          signedAt: artist.signedAt ? artist.signedAt.toISOString().slice(0, 10) : "",
        }}
      />

      {isOwner && !own && (
        <Card className="border-red-500/30">
          <CardHeader><CardTitle>Danger zone</CardTitle><CardDescription>Deletes the profile, photos list and notes. Releases stay and become unassigned.</CardDescription></CardHeader>
          <CardContent><DeleteArtistButton artistId={artist.id} name={artist.name} hasLogin={!!artist.userId} /></CardContent>
        </Card>
      )}
    </div>
  );
}
