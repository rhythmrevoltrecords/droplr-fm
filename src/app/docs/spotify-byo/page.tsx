import { DocShell } from "@/components/marketing/doc-shell";

export const metadata = { title: "Bring your own Spotify app" };

export default function SpotifyByoDocs() {
  return (
    <DocShell title="Bring your own Spotify app">
      <p>droplr.fm has two kinds of pre-save:</p>
      <ul>
        <li><strong>Email pre-save (every plan).</strong> The fan leaves an email. On release day they get a &quot;it&apos;s out, save it&quot; email with one-tap platform buttons. We track who opened the link through and which platform they chose. This works for every fan and doesn&apos;t touch Spotify&apos;s API.</li>
        <li><strong>True auto-save (Pro+, your own Spotify app).</strong> The fan logs in with Spotify and the release is added to their library automatically on release day.</li>
      </ul>

      <h2>The limit you need to know</h2>
      <p>Since February 2026, Spotify apps in <strong>Development Mode</strong> work for a maximum of <strong>5 users</strong>. You add each one by hand in the Spotify dashboard, and the app owner needs Spotify Premium. Quota is counted per developer account. Going past 5 users needs Spotify&apos;s <strong>Extended Quota</strong>, which Spotify currently reserves for established, scalable businesses. So for most labels, BYO auto-save is for testing, VIPs and your own team, and email is the pre-save for everyone else.</p>
      <p>Any fan who isn&apos;t allowlisted and taps &quot;Pre-save on Spotify&quot; gets sent back to the page with a prompt to use email.</p>

      <h2>Setup</h2>
      <ol>
        <li>Open <a href="https://developer.spotify.com/dashboard">developer.spotify.com/dashboard</a> with the Premium account that will own the app → <strong>Create app</strong>.</li>
        <li>Name it after your label, tick <strong>Web API</strong>, and add Redirect URIs:
          <pre>{`https://droplr.fm/api/spotify/callback
https://presave.yourlabel.com/api/spotify/callback   (if you use a custom domain)`}</pre>
        </li>
        <li>Open the app&apos;s <strong>Settings</strong> and copy the <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
        <li>In droplr.fm: Admin → Integrations → paste both → <strong>Save &amp; verify</strong>.</li>
        <li>In Spotify: <strong>User Management</strong> → add the name + Spotify email of each person who should be able to pre-save (up to 5).</li>
      </ol>

      <h2>What happens on release day</h2>
      <ol>
        <li>The hourly job sees the release is live and looks up Apple Music and Deezer from the release&apos;s UPC/ISRC, retrying for up to 72 hours.</li>
        <li>For each Spotify pre-save it refreshes the fan&apos;s token and calls <code>PUT /v1/me/library</code> with the album URI and the artist URI (that&apos;s the follow). If the new endpoint isn&apos;t available it falls back to the legacy album, track and following endpoints. A 429 backs off. <code>QUOTA_EXCEEDED</code> pauses the job until the next hour.</li>
        <li>Every fan who consented to email gets the release-day email.</li>
      </ol>

      <h2>Scopes requested</h2>
      <p><code>user-library-modify</code>, <code>user-follow-modify</code>, <code>user-read-email</code>. Refresh tokens are encrypted with AES-256-GCM.</p>
    </DocShell>
  );
}
