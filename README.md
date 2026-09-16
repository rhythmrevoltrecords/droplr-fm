# droplr.fm

Pre-saves and smart links for independent labels. Self-hostable on Netlify, and sellable as SaaS.

- **Smart links**: paste a Spotify link and the UPC. Apple Music and Deezer are found automatically. Beatport, Traxsource, Bandcamp, Juno, Audius and custom buttons (Merch & Vinyl, Dubplate Download) get the same size button as Spotify, and any link can be hidden, renamed or given its own button text.
- **Email pre-save + release-day email** (every plan): fans leave an email, and on release day the hourly job emails them one-tap platform links through Resend.
- **BYO Spotify app** (Pro+): each label connects its own Spotify developer app for true auto-saves.
- **Label vs artist logins**: owners and admins see the whole roster. Artists only see releases assigned to them and can copy links, but can't edit them.
- **Label-level pixels** (Meta, TikTok, GA4), link variants (`/ig`, `/tiktok`, `/bio`), QR codes, CSV export, and custom domains per label.

---

## Read this first: what the 2026 platform rules mean

| Thing | Reality (checked 15 Sep 2026) | What droplr.fm does |
|---|---|---|
| Spotify Web API | Since Feb 2026, a Development Mode app is limited to **5 allowlisted users** and the owner needs Premium. Quota is counted per developer account. Extended quota is reserved for "established, scalable" businesses. | True saves only work through each label's **own** app (BYO). Email pre-save is the primary product. |
| Spotify save endpoints | `PUT /me/albums`, `/me/tracks` and `/me/following` were replaced by `PUT /v1/me/library?uris=…`, which also accepts artist URIs for follows. | Calls `/me/library` first and falls back to the legacy endpoints on 404/405. |
| Deezer | New app creation has been suspended since June 2026. | Code is built but gated behind `DEEZER_ENABLED=false`. |
| Odesli | Public API discontinued 31 Jul 2026. | Removed. Apple Music comes from the iTunes Lookup API (UPC, then ISRC) and Deezer from its public API (`album/upc:` / `track/isrc:`). Both are free and need no key. They only find music that is already live, so the hourly job retries for 72h after release. DJ stores are added by hand. |
| Apple Music pre-add | Needs MusicKit JS and an Apple Developer membership. | The button currently points fans to email. |

**About BYO.** Moving the app to the label doesn't lift Spotify's 5-user cap. Every label's own app still has that cap until Spotify grants that label extended quota. Market BYO as "true saves for your team, VIPs and testers, or unlimited if you have extended quota", not as auto-save for every fan. The pricing page footnote says exactly this.

---

## Stack

- Next.js 14 App Router, TypeScript, Tailwind, shadcn-style UI (`src/components/ui`)
- **Netlify DB** (Neon Postgres) with **Prisma 6**, using the Rust-free client (`engineType = "client"` + `@prisma/adapter-pg`), so no engine binaries ship to functions
- Auth: `User` table, bcrypt, and a JWT (jose) in an httpOnly cookie
- Cron: Netlify Scheduled Function `release-check` (hourly) triggers Background Function `process-presaves-background` (15 min)
- Queue: the background function itself, with concurrency 50, 429 backoff and self re-invocation. No Upstash/QStash needed.
- Storage: Netlify Blobs for uploaded covers
- Email: Resend (batch API)
- QR: `qrcode.react`. Colour: `node-vibrant`. Charts: Recharts. Drag and drop: dnd-kit.

---

## Run locally with `netlify dev`

Requires Node 22 and the Netlify CLI (`npm i -g netlify-cli`).

```bash
npm install
cp .env.example .env

# secrets
openssl rand -base64 32   # → ENCRYPTION_KEY
openssl rand -base64 48   # → JWT_SECRET
openssl rand -hex 24      # → CRON_SECRET

# database: EITHER Netlify DB…
netlify link              # link to your Netlify site
netlify db init           # provisions Neon and injects NETLIFY_DATABASE_URL + _UNPOOLED
# …OR any Postgres: put the same URL in both NETLIFY_DATABASE_URL vars in .env

npx prisma migrate deploy
npm run db:seed

netlify dev               # http://localhost:8888
```

Set `NEXT_PUBLIC_SITE_URL=http://localhost:8888` in `.env` for local dev. In production it must be `https://droplr.fm`. That's the variable this app reads for absolute URLs, redirects, emails and the Spotify callback. `NEXTAUTH_URL` isn't used (auth is custom JWT, not NextAuth), so setting it changes nothing.

### Seeded logins (change these before deploying)

| Role | Email | Password |
|---|---|---|
| Owner (Rhythm Revolt Records, Pro plan) | owner@rhythmrevoltrecords.com | admin123 |
| Artist | artist@rhythmrevoltrecords.com | demo123 |

The seed also creates the `droplr` platform org, a pre-save release at `/rhythm-revolt/demo-presave` (24 sample email pre-saves) and a live release at `/rhythm-revolt/demo-release` (30 days of sample analytics). Spotify credentials for Rhythm Revolt are left empty on purpose.

### Useful URLs

| URL | What |
|---|---|
| `/` `/pricing` `/demo/demo-track` | Marketing and a static demo (`?view=presave`) |
| `/docs/custom-domain` `/docs/spotify-byo` | Docs |
| `/admin` | Label dashboard: releases, roster, settings, integrations |
| `/dashboard` | Artist dashboard |
| `/{orgSlug}/{release}[/{variant}]` | Canonical public page on droplr.fm |
| `/{release}`, `/{release}/{variant}`, `?v=ig`, `/r/{releaseId}` | Legacy/short forms → permanent redirect to the canonical URL (query string kept) |
| `/{oldOrgSlug}/…` | A renamed label's old slug keeps redirecting (`Organization.previousSlugs`) |
| `presave.label.com/{release}[/{variant}]` | Public pages on a custom domain (the domain already names the label; `/{orgSlug}/{release}` there redirects to the short form) |

### Test the release-day job locally

```bash
# same logic as the scheduled + background functions, run inline:
curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:8888/api/cron/release-check

# or invoke the scheduled function through the CLI:
netlify functions:invoke release-check
```

To see it fire, set a release's date in the past (Admin → release → Settings).

---

## Getting the Spotify URI for an unreleased DistroKid release

1. Upload in DistroKid with a future release date (give yourself 3–4+ weeks if you want time to promote the pre-save).
2. **Wait about 2 days**, sometimes longer, while Spotify ingests the release.
3. Open **Spotify for Artists → Music → Upcoming**, click the release, then **Share → Copy URI** (or Copy link). You'll get `spotify:album:XXXXXXXXXXXXXXXXXXXXXX`.
4. Copy the **UPC** (and ISRC for singles) from the DistroKid release page.
5. droplr.fm → **Create link → Pre-Save Link** → paste the URI + UPC → **Resolve**. Apple Music and Deezer won't exist yet, which is expected, so fill in title, artist and cover (upload works). Leave **Auto re-resolve links on release day** ticked and the hourly job adds them once the stores list the release.
6. Add Beatport, Traxsource and Bandcamp links on the Links tab whenever you have them.

---

## Spotify developer app (BYO, per label)

1. Sign in to <https://developer.spotify.com/dashboard> with a **Spotify Premium** account, then **Create app** → tick **Web API**.
2. Add these Redirect URIs:
   - `https://droplr.fm/api/spotify/callback`
   - `https://presave.rhythmrevoltrecords.com/api/spotify/callback` (a white-label custom domain uses its own callback)
   - Local testing: `http://127.0.0.1:8888/api/spotify/callback`. Spotify no longer accepts `localhost` redirect URIs, so browse the app at `127.0.0.1` when testing OAuth.
3. Copy the Client ID and Secret into **Admin → Integrations**. They're verified with a client-credentials call and stored AES-256-GCM encrypted.
4. **User Management**: add up to **5** Spotify users (name + Spotify account email). The old "25 testers" limit no longer exists. It has been 5 since February 2026. Non-allowlisted fans get a 403 from Spotify, and droplr.fm sends them back with a "use email instead" notice.
5. **Extended quota**: request it from the app's dashboard. Since May 2025 Spotify only grants it to established, scalable businesses, so expect a no for a small label, and treat email as the main pre-save.

Scopes: `user-library-modify user-follow-modify user-read-email`.

Optional platform-wide fallback app: set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_PLATFORM_FALLBACK=true`. That makes droplr.fm the pre-save provider, which is the thing BYO avoids, so leave it off in production.

---

## Release-day email (Resend)

1. Create a Resend account and verify the sending domain (e.g. `droplr.fm`) with its DNS records.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL=presave@droplr.fm`.
3. Each label sets its sender name and reply-to in **Admin → Settings**.

Each email includes the label name, why the fan is getting it, and a one-click unsubscribe (`List-Unsubscribe` + RFC 8058). These cover the basics of Australia's Spam Act (consent, identify, unsubscribe). Get your own advice before scaling it up. Links carry a signed `pst` token, so a click marks the pre-save `emailed_and_clicked` and the ClickEvent `convertedToPreSave=true`.

---

## Deploy to Netlify

1. Push to GitHub and import to Netlify. `netlify.toml` builds with `prisma migrate deploy && npm run build`.
2. `netlify db init` (or connect Netlify DB in the UI).
3. Add env vars from `.env.example` (at minimum `ENCRYPTION_KEY`, `JWT_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `RESEND_*`).
4. Add `droplr.fm` as the primary domain.
5. Scheduled functions only run on **published production deploys**, not previews or `netlify dev`.

### Custom domain for a label (e.g. customer #1)

1. The label enters `presave.rhythmrevoltrecords.com` in Admin → Settings.
2. DNS: `CNAME presave → droplr-fm.netlify.app` (Cloudflare: DNS only, grey cloud).
3. Netlify → Domain management → **Add domain alias** `presave.rhythmrevoltrecords.com`. SSL is automatic.

Middleware rewrites any non-platform host to `/host/{host}/…`, and the page resolves the org by `customDomain`. `{org}.droplr.fm` subdomains work the same way once you add a wildcard `*.droplr.fm` domain in Netlify.

---

## Link types (Admin → Create link)

| Type | Status | Route |
|---|---|---|
| Pre-Save Link | Live | `/{org}/{release}` (flips to smart link on release date) |
| Music Smart Link | Live | same release page, created with a past release date |
| Bio Link | Live | `/b/{slug}` (also `presave.label.com/b/{slug}`) |
| Future Save, Short Link, Tour, Action Page, Contest, Podcast, Scheduled Release | Coming soon | "Notify Me" → `waitlist_features (email, feature_name)` |

Every public page renders through `src/components/public/artwork-shell.tsx`:
`ArtworkPageShell` (blurred artwork + dark gradient + accent glow), `ArtworkHero` and `GlassLink`.
The accent colour is extracted from the uploaded image or cover with node-vibrant (`src/lib/color.ts`) and stored on the record.
Bio links count views and clicks (`/api/b/{linkId}` counts, then redirects).

## Label settings (Admin → Settings)

- **Label identity**: name, slug (renames keep old links redirecting), location/timezone (IANA, DST-safe; drives the `DATE (SYDNEY)` column, release date inputs and analytics days), optional accent colour (admin top border + glow fallback), logo.
- **Appearance**: Dark / Light / System for admin and artist dashboards. **Apply theme to public smart links** is off by default, so fan pages keep the signature blurred-artwork + black-gradient look, pixel-identical to before.
- **Duplicate platforms**: any platform can be added more than once (e.g. three SoundCloud links for a mashup pack). Untitled repeats are labelled "SoundCloud (2)", and each button has its own visibility, order, button text and click count (`ClickEvent.linkId`).

## How tracking works

- `middleware.ts` gives every visitor a `dfm_anon` cookie (1 year) and forwards it as `x-anon-id`.
- Page render logs a `PageView` server-side (bots and prefetches skipped) with source, UTMs, country from `x-nf-geo`, device and a daily-salted IP hash.
- Every button is a plain `<a>` or `<form>` to `/api/r/{releaseId}/{platform}`. The handler **writes the `ClickEvent` before returning the 302/303**, increments the variant counter and sets a `dfm_src` cookie. It works with JavaScript off.
- Source attribution order: variant source, then `utm_source`, then referrer host, then `direct`.
- CTR = clicks / views. Conversion = pre-saves / views. Brisbane-day buckets for charts.

---

## Plans: what's enforced in code

| Enforced | Not yet enforced / built |
|---|---|
| Release count (Free: 3) | Monthly click caps (display only) |
| Artist seats (Free 1, Pro 5, Label unlimited) | Billing. There's no Stripe; set `Organization.plan` in the DB |
| Custom domain, pixels, BYO Spotify, CSV export, QR, branding removal (Pro+) | API + webhooks, SSO (marked "coming soon" on /pricing) |
| Admin team role (Label plan) | Apple Music pre-add |

---

## Project map

```
prisma/schema.prisma            data model (+ PageView, Invite, BYO Spotify fields)
prisma/migrations/…_init        initial SQL
prisma/seed.ts                  Rhythm Revolt + demo data
netlify/functions/
  release-check.mts             @hourly: find due releases → background
  process-presaves-background.mts  15-min worker
src/middleware.ts               anon id, auth guard, custom-domain rewrite
src/lib/presave-processor.ts    re-resolve, Spotify saves, Deezer, emails (shared by functions + /api/cron)
src/lib/spotify.ts              URI parsing, BYO creds, OAuth, /me/library + legacy fallback
src/lib/odesli.ts (UPC/ISRC store lookup, no Odesli)  email.ts  analytics.ts  releases.ts  tracking.ts  crypto.ts  plans.ts
src/app/[slug]/…  src/app/host/[host]/…   public pages
src/app/api/r/[releaseId]/[platform]      click logging + redirect
src/app/api/presave/email                 email pre-save (no-JS form)
src/app/api/spotify|deezer/login|callback multi-tenant OAuth
src/app/admin/…  src/app/dashboard        label + artist UIs
```

## Known gaps / next steps

- **Migration SQL was written by hand.** Prisma's engine download was blocked in the build sandbox. It was applied to Postgres 16 and exercised by the seed and a full smoke test. Run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <url>` once on your machine to confirm there's no drift.
- The iTunes Lookup and Deezer endpoints couldn't be reached from the build sandbox, so store lookups were tested against mocked responses. Test one real released UPC after deploy. iTunes `lookup?isrc=` isn't in Apple's published docs, so UPC is the reliable path.
- No rate limiting on the email form beyond a honeypot. Add Netlify rate-limit rules before launch.
- Stripe billing, API/webhooks and SSO aren't built.
