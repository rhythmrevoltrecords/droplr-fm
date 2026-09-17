import Link from "next/link";
import { CopyButton } from "@/components/admin/copy-button";
import { SpotifyButtonToggle, SpotifyConnectForm } from "@/components/admin/org-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { planOf } from "@/lib/plans";

export default async function IntegrationsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  const plan = planOf(org.plan);
  const redirectUris = [process.env.SPOTIFY_REDIRECT_URI || `${SITE_URL}/api/spotify/callback`, ...(org.customDomain ? [`https://${org.customDomain}/api/spotify/callback`] : [])];
  const statusBadge = { none: <Badge variant="secondary">Not connected</Badge>, pending: <Badge variant="warning">Saved, not verified</Badge>, active: <Badge variant="success">Active</Badge> }[org.spotifyAppStatus] ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Your Spotify Developer App</CardTitle>{statusBadge}</div>
          <CardDescription>
            True auto-saves run under <strong>your</strong> Spotify app, not droplr.fm&apos;s. Without one, fans pre-save by email and get a release-day email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <strong>Know the limit before you switch this on.</strong> Since February 2026, a Spotify app in Development Mode works for at most <strong>5 users</strong> that you allowlist by hand (Dashboard → your app → User Management). The app owner also needs Spotify Premium. Anyone else who taps &quot;Pre-save on Spotify&quot; gets sent back to the email option, so the button is hidden from the public unless you switch it on below. Past 5 users you need Spotify Extended Quota, which Spotify only grants to established businesses. For most accounts this is a test and VIP tool, and email is the main pre-save.
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Go to <a className="underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> → Create app. Tick <em>Web API</em>.</li>
            <li>Add these Redirect URIs exactly:
              <div className="mt-2 space-y-2">
                {redirectUris.map((u) => (
                  <div key={u} className="flex min-w-0 flex-wrap items-center gap-2"><code className="min-w-0 max-w-full break-all rounded bg-secondary px-2 py-1 text-xs text-foreground">{u}</code><CopyButton value={u} /></div>
                ))}
              </div>
            </li>
            <li>Settings → copy the Client ID and Client Secret into the form below.</li>
            <li>User Management → add the Spotify account emails that should be able to pre-save (max 5 in Development Mode).</li>
          </ol>

          <SpotifyConnectForm status={org.spotifyAppStatus} canEdit={user.role === "owner"} planAllows={plan.byoSpotify} kind={org.kind === "artist" ? "artist" : "label"} />
          {plan.byoSpotify && org.spotifyAppStatus === "active" && <SpotifyButtonToggle initial={org.spotifyPublicButton} canEdit={user.role === "owner"} />}
          <p className="text-xs text-muted-foreground">Credentials are encrypted with AES-256-GCM before storage. <Link className="underline" href="/docs/spotify-byo">Full guide</Link></p>
        </CardContent>
      </Card>

      <Card className="opacity-80">
        <CardHeader>
          <div className="flex items-center gap-2"><CardTitle>Deezer</CardTitle><Badge variant="secondary">Coming soon</Badge></div>
          <CardDescription>Deezer closed new app registrations in June 2026. The integration is built and switches on when they reopen.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" disabled checked={false} className="h-4 w-4" /> Enable Deezer pre-save
          </label>
        </CardContent>
      </Card>

      <Card className="opacity-80">
        <CardHeader>
          <div className="flex items-center gap-2"><CardTitle>Apple Music pre-add</CardTitle><Badge variant="secondary">Coming soon</Badge></div>
          <CardDescription>Needs MusicKit JS and an Apple Developer Program membership. Until then the button asks fans for their email instead.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
