import { DocShell } from "@/components/marketing/doc-shell";

export const metadata = { title: "Custom domain setup" };

export default function CustomDomainDocs() {
  return (
    <DocShell title="Use your own domain">
      <p>On Pro and above, every release can live on your label&apos;s domain: <code>https://presave.yourlabel.com/track-name</code>. Variants work too: <code>/track-name/ig</code>.</p>

      <h2>1. Add the domain in droplr.fm</h2>
      <p>Admin → Settings → Custom domain → enter <code>presave.yourlabel.com</code> and save.</p>

      <h2>2. Add a CNAME record at your DNS provider</h2>
      <pre>{`Type:   CNAME
Name:   presave            (the subdomain part only)
Value:  droplr-fm.netlify.app
TTL:    Auto / 3600`}</pre>
      <p>If your DNS provider supports CNAME flattening you can point at <code>droplr.fm</code> instead. Use a subdomain (presave., links., music.) rather than your root domain so your main website isn&apos;t affected.</p>
      <p>Cloudflare users: set the record to <strong>DNS only</strong> (grey cloud) so Netlify can issue the SSL certificate.</p>

      <h2>3. Add the domain in Netlify (droplr.fm operator)</h2>
      <ol>
        <li>Netlify dashboard → the droplr.fm site → <strong>Domain management</strong>.</li>
        <li><strong>Add a domain</strong> → enter <code>presave.yourlabel.com</code> → it&apos;s added as a domain alias.</li>
        <li>Netlify checks the CNAME and provisions a Let&apos;s Encrypt certificate automatically (usually minutes, up to 24h after DNS propagates).</li>
      </ol>
      <p>If the label&apos;s domain already uses <strong>Netlify DNS in the same Netlify team</strong> as the droplr.fm site (for example the operator&apos;s own label), skip the CNAME in step 2: adding the domain alias creates the DNS record and certificate automatically. Netlify warns about a CNAME to <code>*.netlify.app</code> in that case because it isn&apos;t needed.</p>
      <p>Self-hosting droplr.fm on your own Netlify account? You are the operator, so do step 3 on your own site and point the CNAME at <code>your-site.netlify.app</code>.</p>

      <h2>4. Spotify BYO app (optional)</h2>
      <p>To keep the Spotify login on your own domain, also add <code>https://presave.yourlabel.com/api/spotify/callback</code> as a Redirect URI in your Spotify app.</p>

      <h2>If the plan changes</h2>
      <p>Custom domains are on Pro and above. If a label cancels or moves to Free, its domain keeps working for 14 days. After that, anyone opening a link on the domain is sent to the same page on droplr.fm, and new links use droplr.fm. Nothing breaks, and upgrading switches the domain back on.</p>
      <h2>Troubleshooting</h2>
      <ul>
        <li><strong>404 on your domain</strong>: the domain saved in droplr.fm must exactly match the hostname (no https://, no trailing slash).</li>
        <li><strong>Certificate error</strong>: DNS hasn&apos;t propagated, or a proxy (Cloudflare orange cloud) is in front. Check with <code>dig CNAME presave.yourlabel.com</code>.</li>
      </ul>
    </DocShell>
  );
}
