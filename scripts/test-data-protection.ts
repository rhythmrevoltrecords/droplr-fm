/**
 * What droplr's data processing terms promise, checked against what the code does.
 * Run: npm run test:dataprotection (needs local Postgres and a server on :3000; never Neon).
 *
 * Written on 25 Oct 2026 after an audit found the code and the terms disagreeing in places:
 * pixel ids that could load a Tag Manager container, cross-site writes on signed-in routes, fans'
 * Spotify/Deezer tokens kept forever, a Mailchimp unsubscribe that cancelled library saves, an
 * undo link that stamped the wrong consent wording onto gate rows, no record of when anyone
 * unsubscribed, and a news batch check that missed some opt-outs.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fails.push(name); console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

async function main() {
  if (/neon\.tech|neon\.build/i.test(`${process.env.DATABASE_URL ?? ""}${process.env.NETLIFY_DATABASE_URL ?? ""}`)) {
    console.error("Refusing to run against Neon.");
    process.exit(1);
  }
  const { pixelId } = await import("../src/lib/pixel-ids");
  const { crossOriginWrite } = await import("../src/lib/origin-check");
  const { storedImageKey } = await import("../src/lib/account-close-server");

  console.log("\nPixel ids");
  check("a real GA4 id passes", pixelId("ga4", "G-AB12CD34EF") === "G-AB12CD34EF");
  check("a Tag Manager container in the GA4 field is refused", pixelId("ga4", "GTM-ABCD123") === null);
  check("an old UA- id is refused", pixelId("ga4", "UA-12345-1") === null);
  check("script in the GA4 field is refused", pixelId("ga4", "G-AB12');alert(1)//") === null);
  check("a real Meta id passes and letters don't", pixelId("meta", "123456789012345") !== null && pixelId("meta", "GTM-ABCD123") === null);
  check("a real TikTok id passes and GTM doesn't", pixelId("tiktok", "C1A2B3C4D5E6F7G8H9I0") !== null && pixelId("tiktok", "GTM-ABCD123") === null);
  check("the settings route uses the strict rules", code("src/app/api/admin/org/route.ts").includes("PIXEL_ID_RULES[kind]"));
  check("the page re-checks stored ids before loading a script", code("src/components/public/pixels.tsx").includes('pixelId("ga4", ga4)'));

  console.log("\nCross-site writes");
  check("a write to a signed-in API from another origin is refused", crossOriginWrite("POST", "/api/admin/org", "https://evil.example", "droplr.fm"));
  check("a write from a label subdomain to droplr.fm is refused", crossOriginWrite("PATCH", "/api/admin/org", "https://label.droplr.fm", "droplr.fm"));
  check("Origin null is refused", crossOriginWrite("POST", "/api/platform/orgs/x", "null", "droplr.fm"));
  check("the same origin is allowed", !crossOriginWrite("POST", "/api/admin/org", "https://droplr.fm", "droplr.fm"));
  check("a custom domain's own dashboard is allowed", !crossOriginWrite("POST", "/api/admin/fans", "https://listen.label.com", "listen.label.com"));
  check("no Origin (a server, curl) is allowed", !crossOriginWrite("POST", "/api/admin/org", null, "droplr.fm"));
  check("reads are never refused", !crossOriginWrite("GET", "/api/admin/fans/export", "https://evil.example", "droplr.fm"));
  check("public fan endpoints are not in scope", !crossOriginWrite("POST", "/api/presave/email", "https://evil.example", "droplr.fm"));
  check("webhooks are not in scope", !crossOriginWrite("POST", "/api/stripe/webhook", null, "droplr.fm") && !crossOriginWrite("POST", "/api/webhooks/esp/mailchimp", "https://mailchimp.com", "droplr.fm"));
  const evil = await fetch(`${BASE}/api/admin/org`, { method: "PATCH", headers: { origin: "https://evil.example", "content-type": "text/plain" }, body: "{}" });
  check("the live server refuses a cross-site PATCH before auth", evil.status === 403, `got ${evil.status}`);
  const plain = await fetch(`${BASE}/api/admin/org`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" });
  check("the same request with no Origin reaches auth (401)", plain.status === 401, `got ${plain.status}`);

  console.log("\nVisitor cookie");
  for (const p of ["/blog", "/tools/release-plan", "/roadmap", "/b"]) {
    const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
    check(`${p} sets no dfm_anon`, !(r.headers.get("set-cookie") ?? "").includes("dfm_anon"));
  }
  // Positive control: without it, the checks above pass even if the cookie were never set anywhere.
  const bio = await fetch(`${BASE}/b/dptest-cookie-control`, { redirect: "manual" });
  check("a bio page does set it (control)", (bio.headers.get("set-cookie") ?? "").includes("dfm_anon"));

  console.log("\nFan tokens");
  const proc = code("src/lib/presave-processor.ts");
  check("a completed Spotify save drops the token", /status: "completed",[\s\S]{0,200}refreshTokenEncrypted: null/.test(proc));
  check("a failed save drops the token", /failed \? \{ refreshTokenEncrypted: null \}/.test(proc));
  check("Deezer drops it on success and failure", (proc.match(/refreshTokenEncrypted: null/g) ?? []).length >= 4);
  check("the instant save on connect drops it", code("src/app/api/spotify/callback/route.ts").includes("refreshTokenEncrypted: null"));
  check("the backfill clears spent tokens", readFileSync("prisma/migrations/20261109000000_drop_spent_fan_tokens/migration.sql", "utf8").includes(`SET "refreshTokenEncrypted" = NULL`));

  console.log("\nAccount close");
  check("a stored image key is read from its address", storedImageKey("https://droplr.fm/api/cover/1700000000-abcd1234.jpg") === "1700000000-abcd1234.jpg");
  check("anything else is not a key", storedImageKey("https://i.scdn.co/image/abc") === null && storedImageKey(null) === null && storedImageKey("https://droplr.fm/api/cover/../x") === null);
  const close = code("src/lib/account-close-server.ts");
  check("closing deletes only unreferenced images and detaches the domain", close.includes("deleteStoredImages(await unreferenced(images))") && close.includes("queueDetach(org.customDomain)"));
  check("the cover route tags its cache so a delete can purge it", code("src/app/api/cover/[key]/route.ts").includes("coverCacheTag(params.key)") && code("src/lib/blobs.ts").includes("purgeCache({ tags"));
  const { CLOSING_EXPORT_LIMIT } = await import("../src/lib/fans");
  check("the closing export is not capped at 50,000", CLOSING_EXPORT_LIMIT > 50_000 && code("src/app/api/admin/account/close/export/route.ts").includes("CLOSING_EXPORT_LIMIT)"));

  console.log("\nDomain probe");
  const { probeDomain } = await import("../src/lib/domains");
  const local = await probeDomain("localhost");
  check("the domain check refuses a private address before connecting", local.ok === false && local.status === undefined, JSON.stringify(local));
  check("the domain check goes through untrustedGet, not fetch()", /untrustedGet\(url/.test(code("src/lib/domains.ts")) && !/\bfetch\(/.test(code("src/lib/domains.ts")));

  console.log("\nNews batch re-check");
  check("each batch re-checks with optedOutAmong", /optedOutAmong\(pending\.map/.test(code("src/lib/news.ts")));

  // --- Database-backed: unsubscribe paths ---
  const { prisma } = await import("../src/lib/db");
  const { signToken } = await import("../src/lib/crypto");
  const { markUnsubscribedByEmail } = await import("../src/lib/esp/db");
  const { FAN_EMAIL_CONSENT_VERSION } = await import("../src/lib/legal");
  const tag = `dptest-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: "DP Test", slug: tag } });
  try {
    const mk = (kind: string, n: string) => prisma.release.create({ data: { organizationId: org.id, slug: `${tag}-${n}`, title: n, artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 86400_000), kind } });
    const rel = await mk("release", "r");
    const gate = await mk("download", "g");
    const email = `${tag}@example.com`;
    const emailRow = await prisma.preSave.create({ data: { releaseId: rel.id, platform: "email", email, emailConsent: true, newsConsent: true, status: "pending" } });
    const spotifyRow = await prisma.preSave.create({ data: { releaseId: rel.id, platform: "spotify", email, emailConsent: true, status: "pending", refreshTokenEncrypted: "x" } });
    const gateRow = await prisma.preSave.create({ data: { releaseId: gate.id, platform: "email", email, emailConsent: true, consentVersion: "gate-v1", status: "pending" } });
    // Mixed case on purpose: the unsubscribe link must find a contact however its address was typed.
    const contactEmail = email.replace(/^d/, "D");
    await prisma.fanContact.create({ data: { organizationId: org.id, email: contactEmail, consentSource: "bio", status: "mailable" } });

    console.log("\nClosing export");
    const { fanExportRows } = await import("../src/lib/fans");
    const exp = await fanExportRows(org.id, {}, CLOSING_EXPORT_LIMIT);
    check("it holds pre-save fans and the bio-page contact", exp.length >= 1 && JSON.stringify(exp).toLowerCase().includes(email), `${exp.length} rows`);

    console.log("\nImages other accounts use");
    const { unreferenced } = await import("../src/lib/account-close-server");
    const mine = `${tag}-mine.jpg`, shared = `${tag}-shared.jpg`;
    const other = await prisma.organization.create({ data: { name: "DP Other", slug: `${tag}-o` } });
    try {
      await prisma.release.create({ data: { organizationId: other.id, slug: `${tag}-or`, title: "o", artistName: "A", coverUrl: `https://droplr.fm/api/cover/${shared}`, releaseDate: new Date(), kind: "release" } });
      await prisma.artist.create({ data: { organizationId: other.id, name: "P", pressPhotoUrls: [`https://evil.example/x/api/cover/${tag}-press.jpg`] } });
      await prisma.release.create({ data: { organizationId: other.id, slug: `${tag}-oq`, title: "q", artistName: "A", coverUrl: `https://droplr.fm/api/cover/${tag}-q.jpg?v=2`, releaseDate: new Date(), kind: "release" } });
      const left = await unreferenced([mine, shared, `${tag}-press.jpg`, `${tag}-q.jpg`]);
      check("a reference with a query string still counts", !left.includes(`${tag}-q.jpg`), JSON.stringify(left));
      check("an image only this account used is deleted", left.includes(mine), JSON.stringify(left));
      check("an image another account's release points at is kept", !left.includes(shared), JSON.stringify(left));
      check("an image another account's press photos point at is kept", !left.includes(`${tag}-press.jpg`), JSON.stringify(left));
    } finally {
      await prisma.organization.delete({ where: { id: other.id } }).catch(() => {});
    }

    console.log("\nMailchimp unsubscribe");
    await markUnsubscribedByEmail(org.id, email.toUpperCase());
    const sp = await prisma.preSave.findUnique({ where: { id: spotifyRow.id } });
    const em = await prisma.preSave.findUnique({ where: { id: emailRow.id } });
    check("it does not cancel the fan's Spotify save", sp?.status === "pending", sp?.status);
    check("it turns email and news consent off everywhere", sp?.emailConsent === false && em?.emailConsent === false && em?.newsConsent === false);
    check("the email row is marked unsubscribed", em?.status === "unsubscribed", em?.status);
    const ev1 = await prisma.consentEvent.findMany({ where: { organizationId: org.id, email } });
    check("it is recorded with a time", ev1.length === 1 && ev1[0].kind === "unsubscribe" && ev1[0].via === "esp", JSON.stringify(ev1.map((e) => [e.kind, e.via])));

    console.log("\nUndo link");
    const resub = await signToken({ ps: emailRow.id, act: "resub" }, "30d", "unsub");
    const undo = await fetch(`${BASE}/api/unsubscribe/undo?t=${resub}`, { method: "POST" });
    check("the undo link works", undo.status === 200, `got ${undo.status}`);
    const g = await prisma.preSave.findUnique({ where: { id: gateRow.id } });
    const e2 = await prisma.preSave.findUnique({ where: { id: emailRow.id } });
    check("it restores the pre-save with the pre-save wording", e2?.emailConsent === true && e2.consentVersion === FAN_EMAIL_CONSENT_VERSION);
    check("it leaves the download-gate row's wording alone", g?.consentVersion === "gate-v1", g?.consentVersion ?? "null");
    check("the restore is recorded", (await prisma.consentEvent.count({ where: { organizationId: org.id, email, kind: "restore" } })) === 1);

    console.log("\nUnsubscribe link");
    // The Mailchimp step above already unsubscribed the contact; put it back so this step proves itself.
    await prisma.fanContact.updateMany({ where: { organizationId: org.id, email: contactEmail }, data: { status: "mailable" } });
    const unsub = await signToken({ ps: emailRow.id, act: "unsub" }, "30d", "unsub");
    const body = new URLSearchParams({ confirm: "1" });
    const u = await fetch(`${BASE}/api/unsubscribe?t=${unsub}`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    check("the unsubscribe link works", u.status === 200, `got ${u.status}`);
    const fc = await prisma.fanContact.findFirst({ where: { organizationId: org.id, email: contactEmail } });
    check("it also stops the bio-page subscription for that label", fc?.status === "unsubscribed", fc?.status);
    const ev = await prisma.consentEvent.findMany({ where: { organizationId: org.id, email }, orderBy: { createdAt: "asc" } });
    console.log("\nUndo for a download-gate-only fan");
    const gateOnly = `${tag}-g@example.com`;
    const gOnly = await prisma.preSave.create({ data: { releaseId: gate.id, platform: "email", email: gateOnly, emailConsent: false, consentVersion: "gate-v1", status: "unsubscribed" } });
    const gTok = await signToken({ ps: gOnly.id, act: "resub" }, "30d", "unsub");
    const gRes = await fetch(`${BASE}/api/unsubscribe/undo?t=${gTok}`, { method: "POST" });
    const gHtml = await gRes.text();
    check("it does not claim they're back on the list", !gHtml.includes("back on the list") && gHtml.includes("Nothing to turn back on"));
    check("it records no restore", (await prisma.consentEvent.count({ where: { organizationId: org.id, email: gateOnly } })) === 0);

    check("every change is in the history, in order", ev.map((e) => `${e.kind}:${e.via}`).join(",") === "unsubscribe:esp,restore:link,unsubscribe:link", ev.map((e) => `${e.kind}:${e.via}`).join(","));
  } finally {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
  }
  check("the history is deleted with the account", (await prisma.consentEvent.count({ where: { organizationId: org.id } })) === 0);
  await prisma.$disconnect();

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
