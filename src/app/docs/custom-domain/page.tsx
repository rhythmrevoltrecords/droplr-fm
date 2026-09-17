import { DocShell } from "@/components/marketing/doc-shell";

export const metadata = { title: "Custom domain setup" };

export default function CustomDomainDocs() {
  return (
    <DocShell title="Use your own domain">
      <p>On Pro and above, every release can live on your label&apos;s domain: <code>https://presave.yourlabel.com/track-name</code>. Variants work too: <code>/track-name/ig</code>.</p>

      <h2>1. Add the domain in droplr.fm</h2>
      <p>Admin → Settings → Custom domain → enter <code>presave.yourlabel.com</code> and save. Settings then shows the two DNS records for your domain, with copy buttons.</p>

      <h2>2. Add a TXT record (proves you own the domain)</h2>
      <pre>{`Type:   TXT
Name:   _droplr.presave     (full name: _droplr.presave.yourlabel.com)
Value:  droplr-verify=<your token from Settings>
TTL:    Auto / 3600`}</pre>
      <p>droplr only connects a domain after it finds this record, so nobody can attach a domain they don&apos;t control.</p>

      <h2>3. Add a CNAME record (points the domain at droplr)</h2>
      <pre>{`Type:   CNAME
Name:   presave            (the subdomain part only)
Value:  droplr-fm.netlify.app
TTL:    Auto / 3600`}</pre>
      <p>Use a subdomain (presave., links., music.) rather than your root domain so your main website isn&apos;t affected. If you really want the root domain, use an <code>A</code> record to <code>75.2.60.5</code>, or <code>ALIAS</code>/<code>ANAME</code> to <code>apex-loadbalancer.netlify.com</code> if your provider supports it.</p>
      <p><strong>Cloudflare:</strong> set the record to <strong>DNS only</strong> (grey cloud) so the certificate can be issued.</p>
      <p><strong>Netlify DNS:</strong> add both records in Netlify → Domains → yourlabel.com → DNS records. Don&apos;t add the domain to one of your own Netlify sites: a domain can only belong to one site, and droplr couldn&apos;t connect it.</p>

      <h2>4. Press Check now</h2>
      <p>droplr finds the TXT record, connects the domain on its side, and checks HTTPS. The certificate is usually issued within minutes. droplr also re-checks every 15 minutes, so you can close the page.</p>
      <p>Until the domain shows <strong>Live</strong>, your links keep using droplr.fm, so nothing you share breaks during setup. If a live domain stops working (for example the CNAME was deleted), new links switch back to droplr.fm after a few failed checks and Settings shows what&apos;s wrong.</p>

      <h2>5. Spotify BYO app (optional)</h2>
      <p>To keep the Spotify login on your own domain, also add <code>https://presave.yourlabel.com/api/spotify/callback</code> as a Redirect URI in your Spotify app.</p>

      <h2>If the plan changes</h2>
      <p>Custom domains are on Pro and above. If a label cancels or moves to Free, its domain keeps working for 14 days. After that, anyone opening a link on the domain is sent to the same page on droplr.fm, and new links use droplr.fm. Nothing breaks, and upgrading switches the domain back on.</p>
      <p>Changing or removing your domain disconnects the old one straight away. After 90 days on a plan without custom domains, droplr also lets go of the domain; it stays saved, and upgrading reconnects it.</p>
      <h2>Troubleshooting</h2>
      <ul>
        <li><strong>TXT value doesn&apos;t match</strong>: copy it again from Settings. Changing the domain issues a new token.</li>
        <li><strong>&ldquo;Already added to another Netlify site&rdquo;</strong>: remove the domain from that site&apos;s Domain management, then Check now.</li>
        <li><strong>Certificate error</strong>: DNS hasn&apos;t propagated, or a proxy (Cloudflare orange cloud) is in front. Check with <code>dig CNAME presave.yourlabel.com</code>.</li>
        <li><strong>Domain points somewhere else</strong>: an old A or CNAME record for the same name is still there. Delete it so only the droplr record remains.</li>
      </ul>
    </DocShell>
  );
}
