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

  console.log("\nKey rotation");
  {
    const { createCipheriv, randomBytes } = await import("node:crypto");
    const { decrypt, encrypt, needsReencrypt, signToken, verifyToken } = await import("../src/lib/crypto");
    const { ENCRYPTED_COLUMNS } = await import("../src/lib/key-rotation");
    const orig = { key: process.env.ENCRYPTION_KEY, prev: process.env.ENCRYPTION_KEY_PREVIOUS, jwt: process.env.JWT_SECRET, jwtPrev: process.env.JWT_SECRET_PREVIOUS };
    const A = randomBytes(32).toString("base64"), B = randomBytes(32).toString("base64");
    try {
      process.env.ENCRYPTION_KEY = A; delete process.env.ENCRYPTION_KEY_PREVIOUS;
      const underA = encrypt("secret-a");
      const legacyIv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", Buffer.from(A, "base64"), legacyIv);
      const legacyCt = Buffer.concat([c.update("secret-old", "utf8"), c.final()]);
      const legacyVal = [legacyIv.toString("base64"), c.getAuthTag().toString("base64"), legacyCt.toString("base64")].join(".");
      check("a new value names its key", /^k1:[0-9a-f]{8}:/.test(underA) && !underA.includes(A));
      check("a value from before key ids still opens", decrypt(legacyVal) === "secret-old");
      process.env.ENCRYPTION_KEY = B;
      let threw = false;
      try { decrypt(underA); } catch { threw = true; }
      check("without the old key, an old value can't be opened (control)", threw);
      process.env.ENCRYPTION_KEY_PREVIOUS = A;
      check("with ENCRYPTION_KEY_PREVIOUS set, old and pre-id values open", decrypt(underA) === "secret-a" && decrypt(legacyVal) === "secret-old");
      check("both are marked for re-encryption, a new one isn't", needsReencrypt(underA) && needsReencrypt(legacyVal) && !needsReencrypt(encrypt("x")));

      process.env.JWT_SECRET = "old-secret-old-secret-old-secret-xx"; delete process.env.JWT_SECRET_PREVIOUS;
      const oldJwt = await signToken({ t: 1 }, "1h", "unsub");
      process.env.JWT_SECRET = "new-secret-new-secret-new-secret-xx";
      check("a token signed with a retired JWT secret is refused (control)", (await verifyToken(oldJwt, "unsub")) === null);
      process.env.JWT_SECRET_PREVIOUS = "old-secret-old-secret-old-secret-xx";
      check("with JWT_SECRET_PREVIOUS set, it still verifies", (await verifyToken<{ t: number }>(oldJwt, "unsub"))?.t === 1);
      check("but only for its own audience", (await verifyToken(oldJwt, "session")) === null);
    } finally {
      for (const [k, v] of [["ENCRYPTION_KEY", orig.key], ["ENCRYPTION_KEY_PREVIOUS", orig.prev], ["JWT_SECRET", orig.jwt], ["JWT_SECRET_PREVIOUS", orig.jwtPrev]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const listed = new Set(ENCRYPTED_COLUMNS.map((c) => c.field));
    const missing = [...schema.matchAll(/^\s+(\w+Encrypted)\s/gm)].map((m) => m[1]).filter((f) => !listed.has(f));
    check("every encrypted column in the schema is covered by rotation", missing.length === 0, missing.join(", "));
    check("the scheduled check runs the re-encryption", code("netlify/functions/release-check.mts").includes("reencryptStale(deadline)"));
  }

  // --- Database-backed: unsubscribe paths ---
  const { prisma } = await import("../src/lib/db");
  const { signToken } = await import("../src/lib/crypto");
  const { markUnsubscribedByEmail } = await import("../src/lib/esp/db");
  const { FAN_EMAIL_CONSENT_VERSION } = await import("../src/lib/legal");
  const tag = `dptest-${Date.now()}`;
  // The fan forms rate-limit by IP; several runs in an hour from one machine would trip them.
  await prisma.authThrottle.deleteMany({ where: { OR: ["presave-email:", "bio-subscribe:", "news-confirm:"].map((k) => ({ key: { startsWith: k } })) } }).catch(() => {});
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

    console.log("\nRe-encryption sweep");
    {
      const { createHash } = await import("node:crypto");
      const { decrypt, encrypt } = await import("../src/lib/crypto");
      const { reencryptStale } = await import("../src/lib/key-rotation");
      const orig = process.env.ENCRYPTION_KEY!;
      const origPrev = process.env.ENCRYPTION_KEY_PREVIOUS;
      // Derived from the real key, not random: if this run is killed between the two sweeps, setting
      // ENCRYPTION_KEY_PREVIOUS to this value and running reencryptStale recovers the local data.
      const NEW = createHash("sha256").update(`rotation-test|${orig}`).digest().toString("base64");
      const row = await prisma.preSave.findUnique({ where: { id: spotifyRow.id } });
      await prisma.preSave.update({ where: { id: spotifyRow.id }, data: { refreshTokenEncrypted: encrypt("fan-refresh") } });
      try {
        process.env.ENCRYPTION_KEY = NEW; process.env.ENCRYPTION_KEY_PREVIOUS = orig;
        // A value no key opens sits first in id order; with a page size of 1 it must be stepped over.
        await prisma.preSave.update({ where: { id: emailRow.id }, data: { refreshTokenEncrypted: "k1:deadbeef:AAAA.AAAA.AAAA" } });
        await prisma.preSave.update({ where: { id: gateRow.id }, data: { refreshTokenEncrypted: encrypt("gate-x").replace(/^k1:[0-9a-f]+:/, "") } });
        const legacyGate = (await prisma.preSave.findUnique({ where: { id: gateRow.id } }))!.refreshTokenEncrypted!;
        const r = await reencryptStale(Date.now() + 120_000, 1);
        const gateAfter = (await prisma.preSave.findUnique({ where: { id: gateRow.id } }))!.refreshTokenEncrypted!;
        check("an unreadable value is stepped over, and what follows it is rotated", gateAfter !== legacyGate && decrypt(gateAfter) === "gate-x" && r.unreadable > 0, JSON.stringify(r));
        await prisma.preSave.updateMany({ where: { id: { in: [emailRow.id, gateRow.id] } }, data: { refreshTokenEncrypted: null } });
        const moved = await prisma.preSave.findUnique({ where: { id: spotifyRow.id } });
        delete process.env.ENCRYPTION_KEY_PREVIOUS;
        check("after the sweep, the stored value opens with the new key alone", decrypt(moved!.refreshTokenEncrypted!) === "fan-refresh", JSON.stringify(r));
      } finally {
        // Put everything back under the server's key, or the running server can't read it.
        process.env.ENCRYPTION_KEY = orig; process.env.ENCRYPTION_KEY_PREVIOUS = NEW;
        await reencryptStale(Date.now() + 120_000);
        if (origPrev === undefined) delete process.env.ENCRYPTION_KEY_PREVIOUS; else process.env.ENCRYPTION_KEY_PREVIOUS = origPrev;
        await prisma.preSave.update({ where: { id: spotifyRow.id }, data: { refreshTokenEncrypted: row?.refreshTokenEncrypted ?? null } });
      }
    }

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

    console.log("\nLink tokens at rest");
    const { enableReport, reportByToken, reportTokenFor, sealLegacyReportTokens } = await import("../src/lib/report");
    const rtok = await enableReport(rel.id);
    const stored = await prisma.release.findUnique({ where: { id: rel.id } });
    check("a report token is not stored in plain text", !!stored && !JSON.stringify(stored).includes(rtok));
    check("the dashboard can still show the link", !!stored && reportTokenFor(stored) === rtok);
    check("the link still opens the report", (await reportByToken(rtok))?.release.id === rel.id);
    // A link shared before hashing: plaintext column plus the hash the migration computes in SQL.
    const legacy = `legacy${tag}`.slice(0, 40);
    await prisma.$executeRaw`UPDATE "Release" SET "reportToken" = ${legacy}, "reportTokenEncrypted" = NULL,
      "reportTokenHash" = encode(sha256(convert_to(${legacy}, 'UTF8')), 'hex') WHERE id = ${rel.id}`;
    check("an old shared link keeps working after the migration", (await reportByToken(legacy))?.release.id === rel.id);
    await sealLegacyReportTokens();
    const sealedRow = await prisma.release.findUnique({ where: { id: rel.id } });
    check("the sweep removes the old plaintext and keeps the link", sealedRow?.reportToken === null && reportTokenFor(sealedRow!) === legacy && (await reportByToken(legacy))?.release.id === rel.id);
    const { withdrawTokenHash } = await import("../src/lib/contest-server");
    const sqlHash = (await prisma.$queryRaw<{ h: string }[]>`SELECT encode(sha256(convert_to(${legacy}, 'UTF8')), 'hex') AS h`)[0].h;
    check("the migration's hash matches the app's", sqlHash === withdrawTokenHash(legacy));
    check("a link turned off by older code (hash left behind) stays off", await (async () => {
      await prisma.release.update({ where: { id: rel.id }, data: { reportSharedAt: null } });
      const dead = (await reportByToken(legacy)) === null;
      await sealLegacyReportTokens();
      const cleared = (await prisma.release.findUnique({ where: { id: rel.id } }))?.reportTokenHash === null;
      return dead && cleared;
    })());

    const { enterContest, hashLegacyWithdrawTokens } = await import("../src/lib/contest-server");
    const contest = await prisma.contest.create({ data: { organizationId: org.id, releaseId: rel.id, headline: "DP contest", published: true, opensAt: new Date(Date.now() - 86400_000), closesAt: new Date(Date.now() + 86400_000) } });
    const entered = await enterContest({ contestId: contest.id, email: `${tag}-remix@example.com`, artistName: "Remixer", link: `https://soundcloud.com/${tag}/one`, declarationAccepted: true });
    const entryRow = entered.ok ? await prisma.contestEntry.findUnique({ where: { id: entered.entryId } }) : null;
    check("the token in the entrant's email is the one the database can find", entered.ok && !!entryRow && entryRow.withdrawTokenHash === withdrawTokenHash(entered.withdrawToken) && entryRow.withdrawToken === null, entered.ok ? "" : entered.error);
    // An entry written by the old code mid-deploy: plaintext, no hash.
    const oldTok = `old${tag}`;
    await prisma.contestEntry.update({ where: { id: entryRow!.id }, data: { withdrawToken: oldTok, withdrawTokenHash: null } });
    await hashLegacyWithdrawTokens();
    const healed = await prisma.contestEntry.findUnique({ where: { id: entryRow!.id } });
    check("the sweep hashes a plaintext withdraw token and empties it", healed?.withdrawToken === null && healed?.withdrawTokenHash === withdrawTokenHash(oldTok));
    const viaLink = await fetch(`${BASE}/api/contest/withdraw/${oldTok}`);
    check("and that entrant's emailed link still works", viaLink.status === 200 && (await viaLink.text()).includes("Yes, withdraw it"), `${viaLink.status}`);
    // An entry from before hashing (plaintext plus the migration's hash) that is withdrawn and then
    // revived before the sweep reaches it: the new receipt's link must be the one that works.
    const preTok = `pre${tag}`;
    await prisma.contestEntry.update({ where: { id: entryRow!.id }, data: { withdrawToken: preTok, withdrawTokenHash: withdrawTokenHash(preTok), withdrawnAt: new Date() } });
    const revived = await enterContest({ contestId: contest.id, email: `${tag}-remix@example.com`, artistName: "Remixer", link: `https://soundcloud.com/${tag}/one`, declarationAccepted: true });
    await hashLegacyWithdrawTokens();
    const afterRevive = await prisma.contestEntry.findUnique({ where: { id: entryRow!.id } });
    check("a revive before the sweep keeps the new receipt's link working, not the old one", revived.ok && revived.revived && afterRevive?.withdrawTokenHash === withdrawTokenHash(revived.withdrawToken) && afterRevive.withdrawToken === null, revived.ok ? `${revived.revived}` : revived.error);

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
    console.log("\nConfirming ongoing mail");
    {
      const { espAudience } = await import("../src/lib/esp/audience");
      const { newsAudience } = await import("../src/lib/news");
      const { requestNewsConfirmation, setConfirmSenderForTests } = await import("../src/lib/news-confirm");
      const inAudience = async (e: string) =>
        (await espAudience(org.id)).some((m) => m.email === e) || (await newsAudience(org.id, {})).some((m) => m.email === e);
      const fan = `${tag}-news@example.com`;
      const pre = await fetch(`${BASE}/api/presave/email`, { method: "POST", redirect: "manual", body: new URLSearchParams({ releaseId: rel.id, email: fan, consent: "yes", news: "yes" }) });
      const ticked = await prisma.preSave.findFirst({ where: { releaseId: rel.id, email: fan } });
      check("a pre-save with the news box ticked is stored", pre.status === 303 && ticked?.newsConsent === true, `${pre.status}`);
      check("…but is not confirmed, so gets no news and isn't synced", ticked?.newsConfirmedAt === null && !(await inAudience(fan)));

      const ctok = await signToken({ e: fan, org: org.id }, "30d", "confirm");
      const ask = await fetch(`${BASE}/api/news/confirm?t=${encodeURIComponent(ctok)}`);
      const askHtml = await ask.text();
      const afterAsk = await prisma.preSave.findFirst({ where: { releaseId: rel.id, email: fan } });
      check("opening the confirm link only asks (a mail scanner confirms nothing)", ask.status === 200 && askHtml.includes("Yes, send me news") && afterAsk?.newsConfirmedAt === null);
      const forged = await signToken({ e: fan, org: org.id }, "30d", "unsub");
      const wrongAud = await fetch(`${BASE}/api/news/confirm?t=${encodeURIComponent(forged)}`, { method: "POST" });
      check("an unsubscribe token can't be used to confirm", wrongAud.status === 400 && (await prisma.preSave.findFirst({ where: { releaseId: rel.id, email: fan } }))?.newsConfirmedAt === null);
      const yes = await fetch(`${BASE}/api/news/confirm?t=${encodeURIComponent(ctok)}`, { method: "POST" });
      const yesHtml = await yes.text();
      check("pressing the button confirms", yes.status === 200 && yesHtml.includes("You're in") && !!(await prisma.preSave.findFirst({ where: { releaseId: rel.id, email: fan } }))?.newsConfirmedAt);
      check("once confirmed, the fan is in the news and Mailchimp audience", await inAudience(fan));
      check("the confirmation is in the history", (await prisma.consentEvent.count({ where: { organizationId: org.id, email: fan, kind: "confirm" } })) === 1);
      const again = await fetch(`${BASE}/api/news/confirm?t=${encodeURIComponent(ctok)}`, { method: "POST" });
      check("pressing it twice doesn't claim a second signup", (await again.text()).includes("Nothing to confirm") && (await prisma.consentEvent.count({ where: { organizationId: org.id, email: fan, kind: "confirm" } })) === 1);

      // Unsubscribe, then restore release-day email only, then a stranger ticks news again.
      const tickedRow = await prisma.preSave.findFirst({ where: { releaseId: rel.id, email: fan } });
      const unTok = await signToken({ ps: tickedRow!.id, act: "unsub" }, "30d", "unsub");
      await fetch(`${BASE}/api/unsubscribe?t=${unTok}`, { method: "POST", body: new URLSearchParams({ confirm: "1" }), headers: { "content-type": "application/x-www-form-urlencoded" } });
      const reTok = await signToken({ ps: tickedRow!.id, act: "resub" }, "30d", "unsub");
      await fetch(`${BASE}/api/unsubscribe/undo?t=${reTok}`, { method: "POST" });
      await fetch(`${BASE}/api/presave/email`, { method: "POST", redirect: "manual", body: new URLSearchParams({ releaseId: rel.id, email: fan, consent: "yes", news: "yes" }) });
      const reTicked = await prisma.preSave.findFirst({ where: { releaseId: rel.id, email: fan } });
      check("after an unsubscribe, an old confirmation can't be reused by a stranger re-ticking", reTicked?.newsConsent === true && reTicked.newsConfirmedAt === null && !(await inAudience(fan)), JSON.stringify({ c: reTicked?.newsConsent, at: reTicked?.newsConfirmedAt }));
      // Put the fan back to confirmed for the checks that follow.
      await prisma.preSave.updateMany({ where: { email: fan, newsConsent: true }, data: { newsConfirmedAt: new Date() } });

      const sent: { to: string; subject: string; html: string; text: string }[] = [];
      setConfirmSenderForTests(async (m) => { sent.push(m); });
      try {
        const rel2 = await prisma.release.create({ data: { organizationId: org.id, slug: `${tag}-r2`, title: "r2", artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 86400_000), kind: "release" } });
        const row2 = await prisma.preSave.create({ data: { releaseId: rel2.id, platform: "email", email: fan, emailConsent: true, newsConsent: true, status: "pending" } });
        const r1 = await requestNewsConfirmation(org, fan);
        check("an address already confirmed for this account is confirmed again at once, with no email", r1 === "confirmed" && sent.length === 0 && !!(await prisma.preSave.findUnique({ where: { id: row2.id } }))?.newsConfirmedAt, `${r1} ${sent.length}`);
        const stranger = `${tag}-new@example.com`;
        const r2 = await requestNewsConfirmation(org, stranger);
        check("a new address gets one email with a confirm link", r2 === "sent" && sent.length === 1 && sent[0].to === stranger && sent[0].html.includes("/api/news/confirm?t=") && sent[0].text.includes("/api/news/confirm?t="), `${r2} ${sent.length}`);
        const r3 = await requestNewsConfirmation(org, stranger);
        check("and no second one the same day: the form can't flood an inbox", r3 === "skipped" && sent.length === 1, `${r3} ${sent.length}`);
        check("the subject doesn't carry the account's name", !/DP Test/.test(sent[0]?.subject ?? "DP Test"));

        const { confirmLegacyNewsTicks, PRE_CONFIRMATION_PRESAVE_WORDING } = await import("../src/lib/news-confirm");
        const oldTick = await prisma.preSave.create({ data: { releaseId: rel2.id, platform: "email", email: `${tag}-v3@example.com`, emailConsent: true, newsConsent: true, consentVersion: PRE_CONFIRMATION_PRESAVE_WORDING, status: "pending" } });
        const newTick = await prisma.preSave.create({ data: { releaseId: rel2.id, platform: "email", email: `${tag}-v4@example.com`, emailConsent: true, newsConsent: true, consentVersion: FAN_EMAIL_CONSENT_VERSION, status: "pending" } });
        await confirmLegacyNewsTicks();
        check("a tick under the old wording (taken mid-deploy) is confirmed by the sweep", !!(await prisma.preSave.findUnique({ where: { id: oldTick.id } }))?.newsConfirmedAt);
        check("a tick under the new wording never is", (await prisma.preSave.findUnique({ where: { id: newTick.id } }))?.newsConfirmedAt === null);
      } finally {
        setConfirmSenderForTests(null);
      }

      console.log("\nBio-page subscribe");
      const bio = await prisma.bioPage.create({ data: { organizationId: org.id, slug: `${tag}-bio`, title: "Bio", imageUrl: "https://example.com/i.jpg", subscribe: "on" } });
      const sub = `${tag}-sub@example.com`;
      const subRes = await fetch(`${BASE}/api/bio/subscribe`, { method: "POST", redirect: "manual", body: new URLSearchParams({ bioPageId: bio.id, email: sub, consent: "yes" }) });
      const subRow = await prisma.fanContact.findFirst({ where: { organizationId: org.id, email: sub } });
      check("a subscribe waits for confirmation", subRes.status === 303 && subRow?.status === "pending", `${subRes.status} ${subRow?.status}`);
      check("…so it isn't in the news or Mailchimp audience yet", !(await inAudience(sub)));
      const stok = await signToken({ e: sub, org: org.id }, "30d", "confirm");
      await fetch(`${BASE}/api/news/confirm?t=${encodeURIComponent(stok)}`, { method: "POST" });
      check("confirming makes it mailable", (await prisma.fanContact.findFirst({ where: { organizationId: org.id, email: sub } }))?.status === "mailable" && (await inAudience(sub)));
      const imp = `${tag}-imp@example.com`;
      await prisma.fanContact.create({ data: { organizationId: org.id, email: imp, consentSource: "hypeddit", consentKind: "transactional", status: "pending", importId: "x" } });
      const impRes = await fetch(`${BASE}/api/bio/subscribe`, { method: "POST", redirect: "manual", body: new URLSearchParams({ bioPageId: bio.id, email: imp, consent: "yes" }) });
      const impRow = await prisma.fanContact.findFirst({ where: { organizationId: org.id, email: imp } });
      check("a stranger typing an imported address no longer makes it mailable", impRes.status === 303 && (impRes.headers.get("location") ?? "").includes("done=subscribed") && impRow?.bioPageId === bio.id && impRow.status === "pending", `${impRes.status} ${impRow?.bioPageId} ${impRow?.status}`);
      const mailable = `${tag}-ok@example.com`;
      await prisma.fanContact.create({ data: { organizationId: org.id, email: mailable, consentSource: "mailchimp", consentKind: "marketing", status: "mailable", importId: "y" } });
      const okRes = await fetch(`${BASE}/api/bio/subscribe`, { method: "POST", redirect: "manual", body: new URLSearchParams({ bioPageId: bio.id, email: mailable, consent: "yes" }) });
      const okRow = await prisma.fanContact.findFirst({ where: { organizationId: org.id, email: mailable } });
      check("an address the account could already mail is never moved down", okRes.status === 303 && okRow?.bioPageId === bio.id && okRow.status === "mailable", `${okRes.status} ${okRow?.bioPageId} ${okRow?.status}`);
    }

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
