import { DocShell } from "@/components/marketing/doc-shell";

export const metadata = { title: "Custom domain setup" };

export default function CustomDomainDocs() {
  return (
    <DocShell title="Use your own domain">
      <p>On Artist Pro and the label plans, every release can live on your own domain: <code>https://listen.yourlabel.com/track-name</code>. Variants work too: <code>/track-name/ig</code>.</p>

      <h2>1. Add the domain in droplr.fm</h2>
      <p>Admin → Settings → Custom domain → enter <code>listen.yourlabel.com</code> and save. Settings then shows the two DNS records for your domain, with copy buttons.</p>

      <h2>2. Add a TXT record (proves you own the domain)</h2>
      <pre>{`Type:   TXT
Name:   _droplr.listen      (full name: _droplr.listen.yourlabel.com)
Value:  droplr-verify=<your token from Settings>
TTL:    Auto / 3600`}</pre>
      <p>droplr only connects a domain after it finds this record, so nobody can attach a domain they don&apos;t control.</p>

      <h2>3. Add a CNAME record (points the domain at droplr)</h2>
      <pre>{`Type:   CNAME
Name:   listen             (the subdomain part only)
Value:  droplr-fm.netlify.app
TTL:    Auto / 3600`}</pre>
      <p>Use a subdomain (listen., music., links.) rather than your root domain so your main website isn&apos;t affected. Avoid words that describe one moment in a release&apos;s life — presave., outnow. — because this domain carries every link you share, long after the track is out. If you really want the root domain, use an <code>A</code> record to <code>75.2.60.5</code>, or <code>ALIAS</code>/<code>ANAME</code> to <code>apex-loadbalancer.netlify.com</code> if your provider supports it.</p>
      <p><strong>Cloudflare:</strong> set the record to <strong>DNS only</strong> (grey cloud) so the certificate can be issued.</p>
      <p><strong>Netlify DNS:</strong> add both records in Netlify → Domains → yourlabel.com → DNS records. Don&apos;t add the domain to one of your own Netlify sites: a domain can only belong to one site, and droplr couldn&apos;t connect it.</p>

      <h2>4. Press Check now</h2>
      <p>droplr finds the TXT record, connects the domain on its side, and checks HTTPS. The certificate is usually issued within minutes. droplr also re-checks every 15 minutes, so you can close the page.</p>
      <p>Until the domain shows <strong>Live</strong>, your links keep using droplr.fm, so nothing you share breaks during setup. If a live domain stops working (for example the CNAME was deleted), new links switch back to droplr.fm after a few failed checks and Settings shows what&apos;s wrong.</p>

      <h2>5. Spotify BYO app (optional)</h2>
      <p>To keep the Spotify login on your own domain, also add <code>https://listen.yourlabel.com/api/spotify/callback</code> as a Redirect URI in your Spotify app.</p>

      <h2>If the plan changes</h2>
      <p>Custom domains are on Artist Pro and the label plans. If an account cancels or moves to a plan without them, its domain keeps working for 14 days. After that, anyone opening a link on the domain is sent to the same page on droplr.fm, and new links use droplr.fm. Nothing breaks, and upgrading switches the domain back on.</p>
      <p>Changing your domain doesn&apos;t break the old one. Anything already shared on it &mdash; printed cards, a pinned bio link, someone&apos;s saved message &mdash; redirects to the same page on the new domain for a year, then droplr lets the old one go. Removing your domain outright disconnects it straight away. After 90 days on a plan without custom domains, droplr also lets go of the domain; it stays saved, and upgrading reconnects it.</p>
      <h2>Troubleshooting</h2>
      <ul>
        <li><strong>TXT value doesn&apos;t match</strong>: copy it again from Settings. Changing the domain issues a new token.</li>
        <li><strong>&ldquo;Already added to another Netlify site&rdquo;</strong>: remove the domain from that site&apos;s Domain management, then Check now.</li>
        <li><strong>Certificate error</strong>: DNS hasn&apos;t propagated, or a proxy (Cloudflare orange cloud) is in front. Check with <code>dig CNAME listen.yourlabel.com</code>.</li>
        <li><strong>Domain points somewhere else</strong>: an old A or CNAME record for the same name is still there. Delete it so only the droplr record remains.</li>
      </ul>
    </DocShell>
  );
}
