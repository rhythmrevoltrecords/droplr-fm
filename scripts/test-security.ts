/**
 * Security regression tests against a running droplr.fm server and its database.
 *
 *   BASE_URL=http://localhost:3000 PLATFORM_TEST_ADMIN=you@example.com npm run test:security
 *
 * Creates two throwaway labels (A and B), an artist in each, releases, bio pages, pre-saves and invites,
 * then checks that:
 *   1. Label A can't read, edit, export or delete anything that belongs to label B (and vice versa).
 *   2. Artists can't reach label admin APIs or another artist's release.
 *   3. Password change / reset revoke old sessions; reset links are single-use and expire.
 *   4. /platform is hidden from non-owners; platform admin emails can't be registered.
 *   5. Cover uploads, fan email pre-saves, token audiences and security headers.
 *   6. Artist roster profiles: org scoping, artist self-service allowlist, hosted photos only, plan limits, invite → login linking.
 *   7. Custom domain grace / fallback after a downgrade.
 *   8. Self-serve custom domains: TXT token, validation, check-now auth + rate limit, links only on live domains,
 *      Netlify alias add/remove against a mock API (start the server with NETLIFY_API_URL=http://127.0.0.1:4777
 *      NETLIFY_API_TOKEN=test NETLIFY_SITE_ID=test-site to include those).
 *   9. Spotify pre-save button: hidden from the public unless switched on or opened via ?spotify=1; owner-only toggle.
 *  13. Artist accounts, fan list + news opt-in, promo plan (artist sign-up needs SIGNUP_ALLOWLIST=artist-signup-test@sectest.dev on the server).
 *  12. Insights + share graphics: analytics page renders, share images scoped to the label, milestones must be real.
 *  11. Local release time: fan timezone + store pick saved on pre-save, per-fan "out" check, Spotify follow link.
 *  10. Email verification: unconfirmed accounts can't invite / connect domains or Spotify; links are single-use,
 *      expire and die if the address changes; invites don't count as proof; a password reset by email does.
 * Everything it creates is deleted at the end. Never point it at production.
 */
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { encrypt, signToken } from "../src/lib/crypto";
import { createVerificationToken } from "../src/lib/email-verification";
import { prisma } from "../src/lib/db";
import { LEGAL } from "../src/lib/legal";
import { linkCustomDomain } from "../src/lib/plans";

// The cleanup below wipes every auth_throttle row: never let this touch the production (Neon) database.
for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    host = raw;
  }
  if (host.includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run: ${name} points at ${host} (production). Set ALLOW_PROD_TEST=1 only if this really is a throwaway database.`);
    process.exit(1);
  }
}

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
if (/droplr\.fm/.test(BASE)) throw new Error("Refusing to run against production");
const RUN = randomBytes(3).toString("hex");
const PW = "correct-horse-battery-" + RUN;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

type Jar = { cookie: string };
async function http(jar: Jar | null, method: string, path: string, body?: unknown, form?: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (jar?.cookie) headers.cookie = jar.cookie;
  let payload: BodyInit | undefined;
  if (form) { payload = new URLSearchParams(form); headers["content-type"] = "application/x-www-form-urlencoded"; }
  else if (body !== undefined && method !== "GET") { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  const set = res.headers.getSetCookie?.() ?? [];
  const session = set.find((c) => c.startsWith("dfm_session="));
  if (jar && session) jar.cookie = session.split(";")[0];
  const text = await res.text();
  return { status: res.status, location: res.headers.get("location") ?? "", text };
}

async function login(email: string, password = PW): Promise<Jar> {
  const jar: Jar = { cookie: "" };
  const r = await http(jar, "POST", "/api/auth/login", undefined, { email, password });
  if (!jar.cookie) throw new Error(`login failed for ${email}: ${r.status} ${r.location}`);
  return jar;
}

async function fixtures(tag: "a" | "b") {
  const hash = await bcrypt.hash(PW, 10);
  const org = await prisma.organization.create({ data: { name: `Sec Test ${tag.toUpperCase()} ${RUN}`, slug: `sectest-${tag}-${RUN}`, plan: "label" } });
  const owner = await prisma.user.create({ data: { email: `owner-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "owner", organizationId: org.id, emailVerifiedAt: new Date() } });
  const artist = await prisma.user.create({ data: { email: `artist-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "artist", artistName: `Artist ${tag}`, organizationId: org.id, emailVerifiedAt: new Date() } });
  const artist2 = await prisma.user.create({ data: { email: `artist2-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "artist", artistName: `Artist2 ${tag}`, organizationId: org.id, emailVerifiedAt: new Date() } });
  const release = await prisma.release.create({
    data: {
      organizationId: org.id, artistId: artist.id, slug: `sectest-rel-${tag}-${RUN}`, title: `Secret ${tag}`, artistName: "X", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 86400_000),
      links: { create: [{ platform: "spotify", url: "https://open.spotify.com/album/x", position: 0 }] },
      linkVariants: { create: [{ slug: "ig", source: "instagram" }] },
      preSaves: { create: [{ platform: "email", email: `fan-${tag}-${RUN}@fans.dev`, emailConsent: true }] },
    },
    include: { links: true, linkVariants: true },
  });
  const otherRelease = await prisma.release.create({ data: { organizationId: org.id, artistId: artist2.id, slug: `sectest-rel2-${tag}-${RUN}`, title: `Other ${tag}`, artistName: "Y", coverUrl: "https://example.com/c.jpg", releaseDate: new Date() } });
  const bio = await prisma.bioPage.create({ data: { organizationId: org.id, slug: `sectest-bio-${tag}-${RUN}`, title: `Bio ${tag}`, imageUrl: "https://example.com/b.jpg", links: { create: [{ platform: "instagram", url: "https://instagram.com/x", order: 0 }] } }, include: { links: true } });
  const invite = await prisma.invite.create({ data: { organizationId: org.id, email: `invitee-${tag}-${RUN}@sectest.dev`, tokenHash: createHash("sha256").update(randomBytes(16)).digest("hex"), expiresAt: new Date(Date.now() + 86400_000) } });
  return { org, owner, artist, artist2, release, otherRelease, bio, invite };
}

async function main() {
  console.log(`Security tests against ${BASE} (run ${RUN})`);
  // Start clean: rate-limit rows left by earlier runs (or by load testing against the same server)
  // would make the pre-save and sign-up sections fail for reasons that have nothing to do with the code.
  await prisma.authThrottle.deleteMany({}).catch(() => {});
  const A = await fixtures("a");
  const B = await fixtures("b");
  const extraOrgs: string[] = [];
  try {
    const ownerA = await login(A.owner.email);
    const artistA = await login(A.artist.email);

    console.log("\n1. Label A → label B's data");
    const rid = B.release.id;
    const cross: [string, string, unknown?][] = [
      ["GET", `/admin/releases/${rid}`],
      ["GET", `/admin/bio/${B.bio.id}`],
      ["PATCH", `/api/admin/releases/${rid}`, { title: "pwned" }],
      ["DELETE", `/api/admin/releases/${rid}`],
      ["PUT", `/api/admin/releases/${rid}/links`, { links: [{ platform: "spotify", url: "https://evil.example/x", visible: true }] }],
      ["POST", `/api/admin/releases/${rid}/variants`, { slug: "pwn" }],
      ["DELETE", `/api/admin/releases/${rid}/variants?variantId=${B.release.linkVariants[0].id}`],
      ["POST", `/api/admin/releases/${rid}/reresolve`],
      ["GET", `/api/admin/releases/${rid}/export?type=presaves`],
      ["GET", `/api/admin/releases/${rid}/export?type=clicks`],
      ["PATCH", `/api/admin/bio/${B.bio.id}`, { title: "pwned" }],
      ["DELETE", `/api/admin/bio/${B.bio.id}`],
      ["PUT", `/api/admin/bio/${B.bio.id}/links`, { links: [] }],
    ];
    for (const [m, p, body] of cross) {
      const r = await http(ownerA, m, p, body);
      const blocked = r.status === 404 || r.status === 401 || r.status === 403;
      check(`${m} ${p.replace(RUN, "…")} blocked`, blocked, `got ${r.status}`);
      check(`${m} ${p.replace(RUN, "…")} leaks nothing`, !r.text.includes(`Secret b`) && !r.text.includes(`fan-b-${RUN}`), "response contains label B data");
    }
    // Using label A's own release id but label B's link ids: must not edit B's rows.
    await http(ownerA, "PUT", `/api/admin/releases/${A.release.id}/links`, { links: [{ id: B.release.links[0].id, platform: "spotify", url: "https://evil.example/hijack", visible: true }] });
    await http(ownerA, "PUT", `/api/admin/bio/${A.bio.id}/links`, { links: [{ id: B.bio.links[0].id, platform: "instagram", url: "https://evil.example/hijack", visible: true }] });
    // Remove team members / invites of B by id.
    await http(ownerA, "DELETE", `/api/admin/artists?userId=${B.artist.id}`);
    await http(ownerA, "DELETE", `/api/admin/artists?inviteId=${B.invite.id}`);

    const bNow = await prisma.release.findUnique({ where: { id: rid }, include: { links: true, linkVariants: true, preSaves: true } });
    check("B release untouched", !!bNow && bNow.title === "Secret b" && bNow.links.length === 1 && bNow.links[0].url.includes("open.spotify.com") && bNow.linkVariants.length === 1 && bNow.preSaves.length === 1);
    const bBio = await prisma.bioPage.findUnique({ where: { id: B.bio.id }, include: { links: true } });
    check("B bio untouched", !!bBio && bBio.title === "Bio b" && bBio.links.length === 1 && !bBio.links[0].url.includes("evil"));
    check("B artist not removed", !!(await prisma.user.findUnique({ where: { id: B.artist.id } })));
    check("B invite not removed", !!(await prisma.invite.findUnique({ where: { id: B.invite.id } })));

    const home = await http(ownerA, "GET", "/admin");
    check("A's release list excludes B", home.status === 200 && !home.text.includes("Secret b") && home.text.includes("Secret a"), `status ${home.status}`);
    const roster = await http(ownerA, "GET", "/admin/artists");
    check("A's roster excludes B's people", roster.status === 200 && !roster.text.includes(`artist-b-${RUN}`) && !roster.text.includes(`invitee-b-${RUN}`));
    const bioList = await http(ownerA, "GET", "/admin/bio");
    check("A's bio list excludes B", bioList.status === 200 && !bioList.text.includes("Bio b"));

    console.log("\n2. Artists");
    for (const [m, p] of [["GET", "/api/admin/releases"], ["PATCH", `/api/admin/releases/${A.release.id}`], ["PATCH", "/api/admin/org"], ["POST", "/api/stripe/checkout"], ["POST", "/api/stripe/portal"], ["DELETE", `/api/admin/artists?userId=${A.artist2.id}`]] as const) {
      const r = await http(artistA, m, p, {});
      check(`artist ${m} ${p.replace(RUN, "…")} blocked`, [401, 403, 404, 405].includes(r.status), `got ${r.status}`);
    }
    const aPage = await http(artistA, "GET", "/admin");
    check("artist /admin redirects to dashboard", aPage.status === 307 && aPage.location.includes("/dashboard"), `${aPage.status} ${aPage.location}`);
    const dash = await http(artistA, "GET", "/dashboard");
    check("artist dashboard shows only own release", dash.status === 200 && dash.text.includes("Secret a") && !dash.text.includes("Other a") && !dash.text.includes("Secret b"));
    const exp = await http(artistA, "GET", `/api/admin/releases/${A.otherRelease.id}/export?type=presaves`);
    check("artist can't export another artist's release", exp.status === 404 || exp.status === 401, `got ${exp.status}`);
    const expB = await http(artistA, "GET", `/api/admin/releases/${B.release.id}/export?type=presaves`);
    check("artist can't export other label's release", expB.status === 404 || expB.status === 401, `got ${expB.status}`);
    check("artist still can't remove team member", !!(await prisma.user.findUnique({ where: { id: A.artist2.id } })));

    console.log("\n3. Passwords and sessions");
    const second = await login(A.owner.email); // another "device"
    const wrong = await http(ownerA, "POST", "/api/auth/password", { currentPassword: "nope-nope-nope", newPassword: "new-password-" + RUN });
    check("change password rejects wrong current password", wrong.status === 400);
    const weak = await http(ownerA, "POST", "/api/auth/password", { currentPassword: PW, newPassword: "short" });
    check("change password rejects weak password", weak.status === 400);
    await new Promise((r) => setTimeout(r, 1100)); // JWT iat is in seconds
    const NEWPW = "brand-new-password-" + RUN;
    const changed = await http(ownerA, "POST", "/api/auth/password", { currentPassword: PW, newPassword: NEWPW });
    check("change password succeeds", changed.status === 200, `${changed.status} ${changed.text}`);
    check("this browser stays signed in", (await http(ownerA, "GET", "/admin")).status === 200);
    const other = await http(second, "GET", "/admin");
    check("other device signed out", other.status === 307 && other.location.includes("/login"), `${other.status} ${other.location}`);
    check("old session rejected by API", (await http(second, "PATCH", "/api/admin/org", {})).status === 401);
    const oldLogin = await http({ cookie: "" }, "POST", "/api/auth/login", undefined, { email: A.owner.email, password: PW });
    check("old password no longer works", oldLogin.location.includes("error"));
    await login(A.owner.email, NEWPW);

    // Forgot password: same response for real and unknown emails
    const f1 = await http(null, "POST", "/api/auth/forgot", undefined, { email: A.artist.email });
    const f2 = await http(null, "POST", "/api/auth/forgot", undefined, { email: `nobody-${RUN}@sectest.dev` });
    check("forgot: identical response for unknown email", f1.status === f2.status && f1.location === f2.location, `${f1.location} vs ${f2.location}`);
    check("forgot: token created for real account", (await prisma.passwordResetToken.count({ where: { userId: A.artist.id } })) === 1);

    // Reset with a known token (the emailed one isn't recoverable by design)
    const artistOld = await login(A.artist.email);
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.deleteMany({ where: { userId: A.artist.id } });
    await prisma.passwordResetToken.create({ data: { userId: A.artist.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    const page = await http(null, "GET", `/reset-password?token=${token}`);
    check("reset page accepts valid token", page.status === 200 && page.text.includes("Choose a new password"));
    const mismatch = await http(null, "POST", "/api/auth/reset", undefined, { token, password: "reset-password-" + RUN, confirm: "different-" + RUN });
    check("reset rejects mismatched confirm", mismatch.location.includes("error=") && !mismatch.location.includes("invalid"));
    await new Promise((r) => setTimeout(r, 1100));
    const resetJar: Jar = { cookie: "" };
    const ok = await http(resetJar, "POST", "/api/auth/reset", undefined, { token, password: "reset-password-" + RUN, confirm: "reset-password-" + RUN });
    check("reset succeeds and signs in", ok.status === 303 && ok.location.includes("/dashboard") && !!resetJar.cookie, `${ok.status} ${ok.location}`);
    const reuse = await http(null, "POST", "/api/auth/reset", undefined, { token, password: "again-password-" + RUN, confirm: "again-password-" + RUN });
    check("reset token is single-use", reuse.location.includes("error=invalid"));
    check("reset signs out old sessions", (await http(artistOld, "GET", "/dashboard")).status === 307);
    const expired = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({ data: { userId: A.artist.id, tokenHash: createHash("sha256").update(expired).digest("hex"), expiresAt: new Date(Date.now() - 1000) } });
    const exPage = await http(null, "GET", `/reset-password?token=${expired}`);
    check("expired token shows expired page", exPage.text.includes("expired"));
    const exPost = await http(null, "POST", "/api/auth/reset", undefined, { token: expired, password: "expired-password-" + RUN, confirm: "expired-password-" + RUN });
    check("expired token can't reset", exPost.location.includes("error=invalid"));

    // Login throttling
    for (let i = 0; i < 10; i++) await http(null, "POST", "/api/auth/login", undefined, { email: B.artist2.email, password: "wrong-" + i });
    const locked = await http({ cookie: "" }, "POST", "/api/auth/login", undefined, { email: B.artist2.email, password: PW });
    check("login locks after 10 failures (even with right password)", locked.location.includes("error=locked"), locked.location);
    const safeNext = await http({ cookie: "" }, "POST", "/api/auth/login", undefined, { email: B.owner.email, password: PW, next: "//evil.example/admin" });
    check("login ignores off-site next", !safeNext.location.includes("evil"), safeNext.location);
    // Netlify can hand route handlers its internal deploy host; redirects must never carry it.
    const outLoc = (await http({ cookie: "" }, "POST", "/api/auth/logout")).location;
    const badLogin = (await http({ cookie: "" }, "POST", "/api/auth/login", undefined, { email: `nobody-${RUN}@sectest.dev`, password: "x" })).location;
    const permalink = await fetch(BASE + "/admin", { redirect: "manual", headers: { "x-forwarded-host": "6aab78e4c2bb350008b57737--droplr-fm.netlify.app" } });
    check("auth redirects stay on the host the browser is using", outLoc === "/login" && badLogin.startsWith("/login?error=") && !(permalink.headers.get("location") ?? "").includes("netlify.app"), `${outLoc} | ${badLogin} | ${permalink.headers.get("location")}`);

    console.log("\n4. Platform console");
    const plat = await http(ownerA, "GET", "/platform");
    check("/platform is 404 for a label owner", plat.status === 404, `got ${plat.status}`);
    const platApi = await http(ownerA, "PATCH", `/api/platform/orgs/${A.org.id}`, { compPlan: "enterprise" });
    check("comp API is 404 for a label owner", platApi.status === 404, `got ${platApi.status}`);
    check("label owner can't comp themselves", (await prisma.organization.findUnique({ where: { id: A.org.id } }))?.compPlan == null);
    check("/platform needs login", (await http(null, "GET", "/platform")).status === 307);

    const adminEmail = (process.env.PLATFORM_TEST_ADMIN ?? "").trim().toLowerCase();
    if (!adminEmail) {
      console.log("  (skipped platform admin email checks: set PLATFORM_TEST_ADMIN to an address in the server's PLATFORM_ADMIN_EMAILS)");
    } else {
      const inv = await http(ownerA, "POST", "/api/admin/artists", { email: adminEmail, artistName: "Nope" });
      check("can't invite a platform admin email", [400, 409].includes(inv.status) && !inv.text.includes("/invite/"), `got ${inv.status}`);
      check("no invite row for platform admin email", (await prisma.invite.count({ where: { email: adminEmail, organizationId: A.org.id } })) === 0);
      if (!(await prisma.user.findUnique({ where: { email: adminEmail } }))) {
        // An invite that predates the block must not be accepted either.
        const token = randomBytes(24).toString("base64url");
        await prisma.invite.create({ data: { organizationId: A.org.id, email: adminEmail, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400_000) } });
        const acc = await http({ cookie: "" }, "POST", "/api/auth/invite", undefined, { token, password: PW, terms: "yes" });
        check("old invite for platform admin email can't be accepted", acc.location.includes("error=") && !(await prisma.user.findUnique({ where: { email: adminEmail } })), acc.location);
        // Same email on a non-owner account (e.g. created before the block) still isn't a platform admin.
        await prisma.user.create({ data: { email: adminEmail, passwordHash: await bcrypt.hash(PW, 10), role: "artist", artistName: "Impostor", organizationId: A.org.id, emailVerifiedAt: new Date() } });
        const impostor = await login(adminEmail);
        const impPlat = await http(impostor, "GET", "/platform");
        const impPatch = await http(impostor, "PATCH", `/api/platform/orgs/${A.org.id}`, { compPlan: "enterprise" });
        check("platform admin email on a non-owner account isn't platform admin", impPatch.status === 404 && impPlat.status !== 200, `api ${impPatch.status}, page ${impPlat.status}`);

        // Promote that address to a real owner (own org) and exercise the account-type switch.
        const platOrg = await prisma.organization.create({ data: { name: `Sec Platform ${RUN}`, slug: `sectest-platform-${RUN}`, plan: "free" } });
        extraOrgs.push(platOrg.id);
        await prisma.user.update({ where: { email: adminEmail }, data: { role: "owner", organizationId: platOrg.id } });
        const platAdmin = await login(adminEmail);
        const toOrg = await prisma.organization.create({ data: { name: `Sec Kind ${RUN}`, slug: `sectest-kind-${RUN}`, plan: "free" } });
        extraOrgs.push(toOrg.id);
        const flip = await http(platAdmin, "PATCH", `/api/platform/orgs/${toOrg.id}`, { kind: "artist" });
        check("platform owner can switch a label to artist", flip.status === 200 && (await prisma.organization.findUnique({ where: { id: toOrg.id } }))?.kind === "artist", `${flip.status} ${flip.text.slice(0, 120)}`);
        const badComp = await http(platAdmin, "PATCH", `/api/platform/orgs/${toOrg.id}`, { compPlan: "label" });
        const okComp = await http(platAdmin, "PATCH", `/api/platform/orgs/${toOrg.id}`, { compPlan: "artist_pro" });
        check("artist accounts only take artist comps", badComp.status === 400 && okComp.status === 200 && (await prisma.organization.findUnique({ where: { id: toOrg.id } }))?.plan === "artist_pro", `${badComp.status}/${okComp.status}`);
        const compBlocks = await http(platAdmin, "PATCH", `/api/platform/orgs/${toOrg.id}`, { kind: "label" });
        const compAndKind = await http(platAdmin, "PATCH", `/api/platform/orgs/${toOrg.id}`, { kind: "label", compPlan: "pro" });
        check("switching type needs a comp that fits the new type", compBlocks.status === 409 && compAndKind.status === 200 && (await prisma.organization.findUnique({ where: { id: toOrg.id } }))?.plan === "pro", `${compBlocks.status}/${compAndKind.status}`);
        await prisma.organization.update({ where: { id: toOrg.id }, data: { compPlan: null, plan: "free", stripeSubscriptionId: `sub_sectest_${RUN}` } });
        const subBlocks = await http(platAdmin, "PATCH", `/api/platform/orgs/${toOrg.id}`, { kind: "artist" });
        check("can't switch type while a Stripe subscription is attached", subBlocks.status === 409 && (await prisma.organization.findUnique({ where: { id: toOrg.id } }))?.kind === "label", `${subBlocks.status}`);
        const ownerFlip = await http(ownerA, "PATCH", `/api/platform/orgs/${A.org.id}`, { kind: "artist" });
        check("a label owner can't switch their own type", ownerFlip.status === 404 && (await prisma.organization.findUnique({ where: { id: A.org.id } }))?.kind !== "artist", `${ownerFlip.status}`);
        check("platform page lists account types", (await http(platAdmin, "GET", "/platform")).text.includes("Make artist"));
      } else {
        console.log("  (skipped invite-acceptance/impostor checks: a user with PLATFORM_TEST_ADMIN already exists locally)");
      }
    }

    console.log("\n5. Uploads, fan pre-saves, tokens, headers");
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"/>'], { type: "image/png" });
    const fd = new FormData();
    fd.append("file", svg, "cover.png");
    const up = await fetch(`${BASE}/api/admin/upload-cover`, { method: "POST", headers: { cookie: ownerA.cookie }, body: fd });
    const upText = await up.text();
    check("SVG disguised as PNG is rejected", up.status === 400 && upText.includes("JPG, PNG or WebP"), `${up.status} ${upText.slice(0, 120)}`);
    const cover = await fetch(`${BASE}/api/cover/does-not-exist-${RUN}.svg`);
    check("cover route sends nosniff", cover.headers.get("x-content-type-options") === "nosniff");
    check("cover route sends sandbox CSP", (cover.headers.get("content-security-policy") ?? "").includes("sandbox"));
    const loginPage = await fetch(`${BASE}/login`, { redirect: "manual" });
    check("login page can't be framed", loginPage.headers.get("x-frame-options") === "DENY");

    // Fan unsubscribed from label A: posting the form again (anyone can type their email) must not re-subscribe.
    const fan = `fan-a-${RUN}@fans.dev`;
    await prisma.preSave.updateMany({ where: { email: fan }, data: { status: "unsubscribed", emailConsent: false } });
    const again = await http(null, "POST", "/api/presave/email", undefined, { releaseId: A.release.id, email: fan, consent: "yes" });
    const fanRows = await prisma.preSave.findMany({ where: { email: fan } });
    check("unsubscribed fan isn't re-subscribed", again.location.includes("done=email") && fanRows.length === 1 && fanRows.every((r) => r.status === "unsubscribed" && !r.emailConsent), `${again.location} ${JSON.stringify(fanRows.map((r) => [r.status, r.emailConsent]))}`);
    const released = await http(null, "POST", "/api/presave/email", undefined, { releaseId: A.otherRelease.id, email: `late-${RUN}@fans.dev`, consent: "yes" });
    check("already-released release takes no email pre-saves", released.location.includes("notice=error") && (await prisma.preSave.count({ where: { email: `late-${RUN}@fans.dev` } })) === 0, released.location);
    const spam = `spam-${RUN}@fans.dev`;
    const codes: string[] = [];
    for (let i = 0; i < 6; i++) codes.push((await http(null, "POST", "/api/presave/email", undefined, { releaseId: A.release.id, email: spam, consent: "yes" })).location);
    check("email pre-save limited to 5 per address", codes.slice(0, 5).every((l) => l.includes("done=email")) && codes[5].includes("notice=error"), codes.map((l) => l.split("?")[1]).join(" | "));

    if (!process.env.JWT_SECRET) {
      console.log("  (skipped token audience checks: set JWT_SECRET to the server's value)");
    } else {
      const claims = { sub: A.owner.id, org: A.org.id, role: "owner" };
      const asCookie = (t: string): Jar => ({ cookie: `dfm_session=${t}` });
      const control = await http(asCookie(await signToken(claims, "1h", "session")), "GET", "/admin");
      check("session-audience token works (control)", control.status === 200, `got ${control.status}: JWT_SECRET must match the server`);
      for (const aud of ["pst", "unsub"] as const) {
        const jar = asCookie(await signToken(claims, "1h", aud));
        const page = await http(jar, "GET", "/admin");
        const api = await http(jar, "PATCH", "/api/admin/org", {});
        check(`${aud} token rejected as a session`, page.status === 307 && api.status === 401, `page ${page.status}, api ${api.status}`);
      }
      const bFan = await prisma.preSave.findFirstOrThrow({ where: { email: `fan-b-${RUN}@fans.dev` } });
      // Unsubscribe, then the "didn't mean to" link on that page: only the fan can use it.
    const unsubFan = await prisma.preSave.findFirst({ where: { releaseId: B.release.id, email: { not: null } } });
    if (unsubFan) {
      const unsubPage = await http(null, "GET", `/api/unsubscribe?t=${await signToken({ ps: unsubFan.id, act: "unsub" }, "1h", "unsub")}`);
      const undoUrl = unsubPage.text.match(/\/api\/unsubscribe\/undo\?t=([\w.-]+)/)?.[1] ?? "";
      const afterUnsub = await prisma.preSave.findUnique({ where: { id: unsubFan.id } });
      const wrongAct = await http(null, "GET", `/api/unsubscribe/undo?t=${await signToken({ ps: unsubFan.id, act: "unsub" }, "1h", "unsub")}`);
      const undo = await http(null, "GET", `/api/unsubscribe/undo?t=${undoUrl}`);
      const afterUndo = await prisma.preSave.findUnique({ where: { id: unsubFan.id } });
      check("unsubscribe offers a way back, and only a real re-subscribe token works", unsubPage.status === 200 && !!undoUrl && afterUnsub?.status === "unsubscribed" && wrongAct.status === 400 && undo.status === 200 && afterUndo?.emailConsent === true && afterUndo.status !== "unsubscribed" && !afterUndo.newsConsent, `${unsubPage.status}/${wrongAct.status}/${undo.status} ${afterUndo?.status}`);
      const undoJunk = await http(null, "GET", "/api/unsubscribe/undo?t=nope");
      check("a junk re-subscribe link is refused", undoJunk.status === 400);
    }
    const unsubWithPst = await http(null, "GET", `/api/unsubscribe?t=${await signToken({ ps: bFan.id, act: "unsub" }, "1h", "pst")}`);
      const bFanNow = await prisma.preSave.findUnique({ where: { id: bFan.id } });
      check("pst token can't unsubscribe", unsubWithPst.status === 400 && !!bFanNow?.emailConsent, `got ${unsubWithPst.status}`);
    }

    console.log("\n6. Artist roster");
    const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8888").replace(/\/$/, "");
    const NOTE = `label-secret-note-${RUN}`;
    const PHONE = `+61400${RUN}`;
    const ownerB = await login(B.owner.email);
    const artistA2 = await login(A.artist.email, "reset-password-" + RUN); // password was reset in section 3

    const made = await http(ownerA, "POST", "/api/admin/roster", { name: `Roster A ${RUN}`, status: "prospect", genre: "UK garage" });
    const profA = (() => { try { return JSON.parse(made.text).id as string; } catch { return ""; } })();
    check("label creates a roster profile", made.status === 200 && !!profA, `${made.status} ${made.text.slice(0, 120)}`);
    const upd = await http(ownerA, "PATCH", `/api/admin/roster/${profA}`, { bio: "Label bio", notes: NOTE, phone: PHONE, monthlyListeners: 1234, socialLinks: { instagram: "https://instagram.com/rostera", bogus: "https://x.dev" } });
    const profRow = await prisma.artist.findUnique({ where: { id: profA } });
    check("label updates the profile (stats timestamped, unknown social keys dropped)", upd.status === 200 && profRow?.notes === NOTE && profRow.monthlyListeners === 1234 && !!profRow.statsUpdatedAt && JSON.stringify(profRow.socialLinks) === JSON.stringify({ instagram: "https://instagram.com/rostera" }), `${upd.status} ${upd.text}`);

    for (const [m, p, body] of [["PATCH", `/api/admin/roster/${profA}`, { name: "pwned", notes: "pwned" }], ["DELETE", `/api/admin/roster/${profA}`], ["POST", `/api/admin/roster/${profA}/invite`, { email: `steal-${RUN}@sectest.dev` }], ["POST", `/api/admin/roster/${profA}/revoke-login`]] as const) {
      const r = await http(ownerB, m, p, body);
      check(`label B ${m} ${p.replace(profA, "<A profile>")} → 404`, r.status === 404, `got ${r.status}`);
    }
    check("A profile untouched by B", (await prisma.artist.findUnique({ where: { id: profA } }))?.name === `Roster A ${RUN}` && (await prisma.invite.count({ where: { artistProfileId: profA } })) === 0);
    const attach = await http(ownerB, "PATCH", `/api/admin/releases/${B.release.id}`, { artistProfileId: profA });
    const attachLegacy = await http(ownerB, "PATCH", `/api/admin/releases/${B.release.id}`, { artistId: A.artist.id });
    const bRel = await prisma.release.findUnique({ where: { id: B.release.id } });
    check("label B can't attach A's profile (or A's login) to B's release", [400, 404].includes(attach.status) && [400, 404].includes(attachLegacy.status) && bRel?.artistProfileId === null && bRel?.artistId === B.artist.id, `${attach.status}/${attachLegacy.status}`);
    const bProfile = await prisma.artist.create({ data: { organizationId: B.org.id, name: `Roster B ${RUN}` } });
    check("A can't open B's profile page", (await http(ownerA, "GET", `/admin/artists/${bProfile.id}`)).status === 404);
    const rosterA = await http(ownerA, "GET", "/admin/artists");
    check("A's roster lists A's profile, not B's", rosterA.status === 200 && rosterA.text.includes(`Roster A ${RUN}`) && !rosterA.text.includes(`Roster B ${RUN}`));

    // Hosted photos only
    const ext = await http(ownerA, "PATCH", `/api/admin/roster/${profA}`, { photoUrl: "https://evil.example/photo.jpg" });
    check("external photoUrl rejected", ext.status === 400, `got ${ext.status}`);
    const lookalike = await http(ownerA, "PATCH", `/api/admin/roster/${profA}`, { pressPhotoUrls: [`${SITE}.evil.example/api/cover/x.jpg`] });
    check("look-alike host in press photos rejected", lookalike.status === 400, `got ${lookalike.status}`);
    const badSocial = await http(ownerA, "PATCH", `/api/admin/roster/${profA}`, { socialLinks: { instagram: "javascript:alert(1)" }, website: "http://insecure.example" });
    check("non-https links rejected", badSocial.status === 400, `got ${badSocial.status}`);
    const hosted = await http(ownerA, "PATCH", `/api/admin/roster/${profA}`, { photoUrl: `${SITE}/api/cover/123-abc.jpg`, pressPhotoUrls: [`${SITE}/api/cover/456-def.webp`] });
    check("hosted photo URLs accepted", hosted.status === 200, `${hosted.status} ${hosted.text}`);

    // Artist self-service (link A's artist login to the profile)
    await prisma.artist.update({ where: { id: profA }, data: { userId: A.artist.id, email: A.artist.email } });
    const selfUpd = await http(artistA2, "PATCH", "/api/artist/profile", { bio: `Artist wrote this ${RUN}`, name: "hacked", status: "alumni", notes: "hacked", userId: A.artist2.id, email: `evil-${RUN}@evil.example`, monthlyListeners: 999999, phone: "000" });
    const afterSelf = await prisma.artist.findUnique({ where: { id: profA } });
    check("artist can edit own bio", selfUpd.status === 200 && afterSelf?.bio === `Artist wrote this ${RUN}`, `${selfUpd.status} ${selfUpd.text}`);
    check("artist can't change name/status/notes/userId/email/stats", !!afterSelf && afterSelf.name === `Roster A ${RUN}` && afterSelf.status === "prospect" && afterSelf.notes === NOTE && afterSelf.userId === A.artist.id && afterSelf.email === A.artist.email && afterSelf.monthlyListeners === 1234 && afterSelf.phone === PHONE);
    check("artist external photo rejected", (await http(artistA2, "PATCH", "/api/artist/profile", { photoUrl: "https://evil.example/p.png" })).status === 400);
    for (const [m, p] of [["PATCH", `/api/admin/roster/${profA}`], ["POST", "/api/admin/roster"], ["DELETE", `/api/admin/roster/${profA}`], ["POST", `/api/admin/roster/${profA}/invite`], ["POST", `/api/admin/roster/${profA}/revoke-login`]] as const) {
      const r = await http(artistA2, m, p, { name: "hacked", notes: "hacked" });
      check(`artist ${m} ${p.replace(profA, "<profile>")} blocked`, [401, 403, 404].includes(r.status), `got ${r.status}`);
    }
    check("profile still exists and unchanged after artist attempts", (await prisma.artist.findUnique({ where: { id: profA } }))?.name === `Roster A ${RUN}`);
    const selfPage = await http(artistA2, "GET", "/dashboard/profile");
    check("artist profile page shows their bio", selfPage.status === 200 && selfPage.text.includes(`Artist wrote this ${RUN}`), `status ${selfPage.status}`);
    check("artist profile page never contains label notes or phone", !selfPage.text.includes(NOTE) && !selfPage.text.includes(PHONE));
    check("artist dashboard never contains label notes", !(await http(artistA2, "GET", "/dashboard")).text.includes(NOTE));
    check("artist of label B can't reach A's profile", (await http(await login(B.artist.email), "PATCH", "/api/artist/profile", { bio: "x" })).status === 404 && (await prisma.artist.findUnique({ where: { id: profA } }))?.bio === `Artist wrote this ${RUN}`);
    check("owner can't delete a profile that has a login", (await http(ownerA, "DELETE", `/api/admin/roster/${profA}`)).status === 409);
    const adminA = await prisma.user.create({ data: { email: `admin-a-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(PW, 10), role: "admin", organizationId: A.org.id, emailVerifiedAt: new Date() } });
    const adminJar = await login(adminA.email);
    const adminRevoke = await http(adminJar, "POST", `/api/admin/roster/${profA}/revoke-login`);
    const adminDelete = await http(adminJar, "DELETE", `/api/admin/roster/${profA}`);
    check("admin (non-owner) can't revoke a login or delete a profile", adminRevoke.status === 403 && adminDelete.status === 403 && !!(await prisma.user.findUnique({ where: { id: A.artist.id } })), `${adminRevoke.status}/${adminDelete.status}`);

    // Plan limit (Free: 1 artist)
    const freeOrg = await prisma.organization.create({ data: { name: `Sec Test Free ${RUN}`, slug: `sectest-free-${RUN}`, plan: "free" } });
    extraOrgs.push(freeOrg.id);
    const freeOwner = await prisma.user.create({ data: { email: `owner-free-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(PW, 10), role: "owner", organizationId: freeOrg.id, emailVerifiedAt: new Date() } });
    const freeJar = await login(freeOwner.email);
    const first = await http(freeJar, "POST", "/api/admin/roster", { name: "First" });
    const secondProfile = await http(freeJar, "POST", "/api/admin/roster", { name: "Second" });
    check("Free plan: first profile allowed, second → 402", first.status === 200 && secondProfile.status === 402 && (await prisma.artist.count({ where: { organizationId: freeOrg.id } })) === 1, `${first.status}/${secondProfile.status}`);
    const genericOver = await http(freeJar, "POST", "/api/admin/artists", { email: `over-${RUN}@sectest.dev` });
    check("Free plan: generic artist invite over the limit → 402", genericOver.status === 402, `got ${genericOver.status}`);

    // Invite linked to a profile → accepting links the login and syncs release access
    const linkedEmail = `linked-${RUN}@sectest.dev`;
    const p2res = await http(ownerA, "POST", "/api/admin/roster", { name: `Linked ${RUN}`, email: linkedEmail });
    const prof2 = JSON.parse(p2res.text).id as string;
    const rel2 = await prisma.release.create({ data: { organizationId: A.org.id, slug: `sectest-rel3-a-${RUN}`, title: `Linked release ${RUN}`, artistName: "Z", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 86400_000) } });
    const attachOwn = await http(ownerA, "PATCH", `/api/admin/releases/${rel2.id}`, { artistProfileId: prof2 });
    const rel2a = await prisma.release.findUnique({ where: { id: rel2.id } });
    check("label attaches own profile to release (no login → no artistId)", attachOwn.status === 200 && rel2a?.artistProfileId === prof2 && rel2a.artistId === null, `${attachOwn.status} ${attachOwn.text}`);
    const inv2 = await http(ownerA, "POST", `/api/admin/roster/${prof2}/invite`, {});
    const link2 = (() => { try { return JSON.parse(inv2.text).link as string; } catch { return ""; } })();
    check("profile invite returns a link", inv2.status === 200 && link2.includes("/invite/"), `${inv2.status} ${inv2.text}`);
    const newJar: Jar = { cookie: "" };
    const acc2 = await http(newJar, "POST", "/api/auth/invite", undefined, { token: link2.split("/invite/")[1] ?? "", password: PW, terms: "yes" });
    const newUser = await prisma.user.findUnique({ where: { email: linkedEmail } });
    const prof2Row = await prisma.artist.findUnique({ where: { id: prof2 } });
    const rel2b = await prisma.release.findUnique({ where: { id: rel2.id } });
    check("accepting links the login to the profile", acc2.status === 303 && !!newUser && newUser.role === "artist" && prof2Row?.userId === newUser.id, `${acc2.status} ${acc2.location}`);
    check("release access synced to the new login", !!newUser && rel2b?.artistId === newUser.id);
    const newDash = await http(newJar, "GET", "/dashboard");
    check("new artist sees the release on /dashboard", newDash.status === 200 && newDash.text.includes(`Linked release ${RUN}`) && !newDash.text.includes("Secret a"), `status ${newDash.status}`);
    check("invite for a profile that has a login → 409", (await http(ownerA, "POST", `/api/admin/roster/${prof2}/invite`, { email: `again-${RUN}@sectest.dev` })).status === 409);
    const revoke = await http(ownerA, "POST", `/api/admin/roster/${prof2}/revoke-login`);
    const rel2c = await prisma.release.findUnique({ where: { id: rel2.id } });
    check("owner removes login: user gone, profile kept, release access cleared", revoke.status === 200 && !(await prisma.user.findUnique({ where: { email: linkedEmail } })) && (await prisma.artist.findUnique({ where: { id: prof2 } }))?.userId === null && rel2c?.artistId === null && rel2c.artistProfileId === prof2, `${revoke.status} ${revoke.text}`);
    const del2 = await http(ownerA, "DELETE", `/api/admin/roster/${prof2}`);
    const rel2d = await prisma.release.findUnique({ where: { id: rel2.id } });
    check("owner deletes profile without login; release kept, unassigned", del2.status === 200 && !(await prisma.artist.findUnique({ where: { id: prof2 } })) && !!rel2d && rel2d.artistProfileId === null, `${del2.status} ${del2.text}`);

    // Generic invite → accepting creates a profile
    const genericEmail = `generic-${RUN}@sectest.dev`;
    const gInv = await http(ownerA, "POST", "/api/admin/artists", { email: genericEmail, artistName: `Generic ${RUN}` });
    const gLink = (() => { try { return JSON.parse(gInv.text).link as string; } catch { return ""; } })();
    await http({ cookie: "" }, "POST", "/api/auth/invite", undefined, { token: gLink.split("/invite/")[1] ?? "", password: PW, terms: "yes" });
    const gUser = await prisma.user.findUnique({ where: { email: genericEmail }, include: { artistProfile: true } });
    check("generic artist invite creates a linked profile on accept", !!gUser?.artistProfile && gUser.artistProfile.name === `Generic ${RUN}` && gUser.artistProfile.organizationId === A.org.id, gInv.text.slice(0, 120));

    console.log("\n7. Custom domain after a downgrade");
    // Three labels on custom domains: Pro (active), Free within the 14-day grace (active), Free after it (paused → droplr.fm).
    const domainOrg = async (tag: string, plan: string, daysAgo: number) => {
      const o = await prisma.organization.create({ data: { name: `Dom ${tag} ${RUN}`, slug: `sectest-dom-${tag}-${RUN}`, plan, customDomain: `presave-${tag}-${RUN}.sectest.dev`, planUpdatedAt: new Date(Date.now() - daysAgo * 86400_000) } });
      extraOrgs.push(o.id);
      const r = await prisma.release.create({ data: { organizationId: o.id, slug: `dom-rel-${tag}`, title: `Dom ${tag}`, artistName: "D", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() + 86400_000) } });
      const b = await prisma.bioPage.create({ data: { organizationId: o.id, slug: `sectest-dombio-${tag}-${RUN}`, title: `Dom bio ${tag}`, imageUrl: "https://example.com/b.jpg" } });
      return { o, r, b };
    };
    const onHost = (host: string, path: string) => fetch(BASE + path, { headers: { "x-forwarded-host": host }, redirect: "manual" });
    const pro = await domainOrg("pro", "pro", 40);
    const grace = await domainOrg("grace", "free", 3);
    const paused = await domainOrg("paused", "free", 20);
    const proRes = await onHost(pro.o.customDomain!, `/${pro.r.slug}`);
    check("Pro label: release page served on its custom domain", proRes.status === 200, `status ${proRes.status}`);
    const graceRes = await onHost(grace.o.customDomain!, `/${grace.r.slug}`);
    check("Free label inside 14-day grace: still served on its domain", graceRes.status === 200, `status ${graceRes.status}`);
    const pausedRes = await onHost(paused.o.customDomain!, `/${paused.r.slug}/ig?utm_source=x`);
    const loc = pausedRes.headers.get("location") ?? "";
    check("after grace: release link redirects (307) to the same page on droplr.fm", pausedRes.status === 307 && loc.includes(`/${paused.o.slug}/${paused.r.slug}/ig`) && loc.includes("utm_source=x"), `${pausedRes.status} ${loc}`);
    const pausedRoot = await onHost(paused.o.customDomain!, "/");
    check("after grace: domain root redirects to the label page on droplr.fm", pausedRoot.status === 307 && (pausedRoot.headers.get("location") ?? "").endsWith(`/${paused.o.slug}`), `${pausedRoot.status} ${pausedRoot.headers.get("location")}`);
    const pausedBio = await onHost(paused.o.customDomain!, `/b/${paused.b.slug}`);
    check("after grace: bio page redirects to droplr.fm/b/…", pausedBio.status === 307 && (pausedBio.headers.get("location") ?? "").endsWith(`/b/${paused.b.slug}`), `${pausedBio.status} ${pausedBio.headers.get("location")}`);
    const graceBio = await onHost(grace.o.customDomain!, `/b/${grace.b.slug}`);
    check("inside grace: bio page still served on its domain", graceBio.status === 200, `status ${graceBio.status}`);
    const freeSet = await http(ownerA, "PATCH", "/api/admin/org", { customDomain: "" });
    check("clearing a domain is always allowed", freeSet.status === 200, `${freeSet.status}`);

    console.log("\n8. Self-serve custom domains");
    // Mock Netlify site API: records every alias list it's given.
    const mock = { primary: "droplr.fm", aliases: ["www.droplr.fm"], patches: [] as string[][], auth: [] as string[] };
    const mockServer = createServer((req, res) => {
      mock.auth.push(req.headers.authorization ?? "");
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.method === "PATCH") {
          const next = (JSON.parse(body || "{}").domain_aliases ?? []) as string[];
          mock.patches.push(next);
          mock.aliases = next;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(req.method === "POST" ? "{}" : JSON.stringify({ custom_domain: mock.primary, domain_aliases: mock.aliases }));
      });
    });
    await new Promise<void>((r) => mockServer.listen(4777, "127.0.0.1", () => r()));
    try {
      const dom = `presave-self-${RUN}.sectest.dev`;
      const setRes = await http(ownerA, "PATCH", "/api/admin/org", { customDomain: dom });
      let orgA = await prisma.organization.findUniqueOrThrow({ where: { id: A.org.id } });
      check("saving a domain issues a TXT token and starts unverified", setRes.status === 200 && /^[0-9a-f]{24}$/.test(orgA.customDomainToken ?? "") && !orgA.customDomainVerifiedAt && !orgA.customDomainLiveAt, `${setRes.status} ${orgA.customDomainToken}`);
      const token1 = orgA.customDomainToken;
      await http(ownerA, "PATCH", "/api/admin/org", { customDomain: dom.toUpperCase() });
      orgA = await prisma.organization.findUniqueOrThrow({ where: { id: A.org.id } });
      check("re-saving the same domain keeps the token", orgA.customDomainToken === token1);

      for (const bad of ["droplr.fm", "evil.droplr.fm", "droplr-fm.netlify.app", "10.0.0.1", "localhost"]) {
        const r = await http(ownerA, "PATCH", "/api/admin/org", { customDomain: bad });
        check(`domain rejected: ${bad}`, r.status === 400, `${r.status}`);
      }

      const anon = await http(null, "POST", "/api/admin/org/domain");
      const asArtist = await http(artistA, "POST", "/api/admin/org/domain");
      check("check-now needs a label login", anon.status === 401 && asArtist.status === 401, `${anon.status} ${asArtist.status}`);

      const first = await http(ownerA, "POST", "/api/admin/org/domain");
      const firstView = (() => { try { return JSON.parse(first.text).view; } catch { return null; } })();
      check("check-now without the TXT record stays unverified and says why", first.status === 200 && firstView?.state === "verify" && !!firstView?.error && mock.patches.length === 0, first.text.slice(0, 160));

      check("links ignore a domain that isn't live", linkCustomDomain({ plan: "label", customDomain: dom, customDomainLiveAt: null }) === null && linkCustomDomain({ plan: "label", customDomain: dom, customDomainLiveAt: new Date() }) === dom);
      check("links ignore a live domain once the plan is paused", linkCustomDomain({ plan: "free", customDomain: dom, customDomainLiveAt: new Date(), planUpdatedAt: new Date(Date.now() - 30 * 86400_000) }) === null);
      const dash = await http(ownerA, "GET", `/admin/releases/${A.release.id}`);
      check("release admin shows droplr.fm links while the domain is connecting", dash.status === 200 && !dash.text.includes(`https://${dom}/${A.release.slug}`), `${dash.status}`);

      const probe = await fetch(`${BASE}/api/domain-check`, { headers: { "x-forwarded-host": dom } });
      const pj = (await probe.json().catch(() => ({}))) as { service?: string; host?: string };
      check("/api/domain-check answers on a label host", probe.status === 200 && pj.service === "droplr.fm" && pj.host === dom, JSON.stringify(pj));

      const mocked = process.env.NETLIFY_MOCK === "1";
      if (!mocked) console.log("  (skipped Netlify alias checks: run the server with the mock Netlify env and NETLIFY_MOCK=1)");
      else {
        // Pretend the TXT record was found; the next check should attach the alias.
        await prisma.organization.update({ where: { id: A.org.id }, data: { customDomainVerifiedAt: new Date() } });
        await prisma.domainDetach.create({ data: { domain: dom } }); // stale removal from an earlier owner
        const attach = await http(ownerA, "POST", "/api/admin/org/domain");
        orgA = await prisma.organization.findUniqueOrThrow({ where: { id: A.org.id } });
        check("verified domain is added as a Netlify alias (keeping existing aliases)", !!orgA.customDomainAttachedAt && mock.aliases.includes(dom) && mock.aliases.includes("www.droplr.fm"), `${attach.status} ${JSON.stringify(mock.aliases)} ${attach.text.slice(0, 120)}`);
        check("Netlify calls use the token", mock.auth.every((a) => a === "Bearer test"));
        check("attaching clears a stale removal for the same domain", (await prisma.domainDetach.count({ where: { domain: dom } })) === 0);
        check("unreachable domain isn't marked live", !orgA.customDomainLiveAt && !!orgA.customDomainError, orgA.customDomainError ?? "");

        const dom2 = `links-self-${RUN}.sectest.dev`;
        await http(ownerA, "PATCH", "/api/admin/org", { customDomain: dom2 });
        orgA = await prisma.organization.findUniqueOrThrow({ where: { id: A.org.id } });
        check("changing the domain removes the old alias and resets setup", !mock.aliases.includes(dom) && mock.aliases.includes("www.droplr.fm") && orgA.customDomainToken !== token1 && !orgA.customDomainAttachedAt, JSON.stringify(mock.aliases));
        check("droplr.fm's own domains are never in a removal", mock.patches.every((p) => p.includes("www.droplr.fm")));

        // A removal for a domain another label now uses is dropped without touching Netlify.
        await prisma.organization.update({ where: { id: B.org.id }, data: { customDomain: `claimed-${RUN}.sectest.dev` } });
        await prisma.domainDetach.create({ data: { domain: `claimed-${RUN}.sectest.dev` } });
        const before = mock.patches.length;
        const cron = await fetch(`${BASE}/api/cron/domains`, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" } });
        check("cron drops removals for domains still in use", cron.status === 200 && (await prisma.domainDetach.count({ where: { domain: `claimed-${RUN}.sectest.dev` } })) === 0 && mock.patches.length === before, `${cron.status}`);
      }

      const badCron = await fetch(`${BASE}/api/cron/domains`, { method: "POST", headers: { "x-cron-secret": "nope" } });
      check("domain cron needs the cron secret", badCron.status === 401, `${badCron.status}`);

      let limited = 0;
      for (let i = 0; i < 12; i++) if ((await http(ownerA, "POST", "/api/admin/org/domain")).status === 429) limited++;
      check("check-now is rate limited", limited > 0, `${limited}`);
    } finally {
      await new Promise<void>((r) => mockServer.close(() => r()));
      await prisma.domainDetach.deleteMany({ where: { domain: { endsWith: `${RUN}.sectest.dev` } } }).catch(() => {});
    }

    console.log("\n9. Spotify pre-save button visibility");
    await prisma.organization.update({ where: { id: A.org.id }, data: { spotifyClientIdEncrypted: encrypt("a".repeat(32)), spotifyClientSecretEncrypted: encrypt("b".repeat(32)), spotifyAppStatus: "active", spotifyPublicButton: false } });
    const pagePath = `/${A.org.slug}/${A.release.slug}`;
    const hidden = await http(null, "GET", pagePath);
    const vip = await http(null, "GET", `${pagePath}?spotify=1`);
    check("Spotify button hidden by default (Development Mode apps)", hidden.status === 200 && !hidden.text.includes("Pre-save on Spotify"), `${hidden.status}`);
    check("?spotify=1 VIP link shows the Spotify button", vip.status === 200 && vip.text.includes("Pre-save on Spotify"), `${vip.status}`);
    const artistToggle = await http(artistA, "PATCH", "/api/admin/org/spotify", { publicButton: true });
    check("artist can't switch the Spotify button on", artistToggle.status === 401, `${artistToggle.status}`);
    const badToggle = await http(ownerA, "PATCH", "/api/admin/org/spotify", { publicButton: "yes" });
    const ownerToggle = await http(ownerA, "PATCH", "/api/admin/org/spotify", { publicButton: true });
    const shown = await http(null, "GET", pagePath);
    check("owner switches the Spotify button on for everyone", badToggle.status === 400 && ownerToggle.status === 200 && shown.text.includes("Pre-save on Spotify"), `${badToggle.status} ${ownerToggle.status}`);

    console.log("\n10. Email verification");
    const uvOrg = await prisma.organization.create({ data: { name: `Unverified ${RUN}`, slug: `sectest-uv-${RUN}`, plan: "label" } });
    extraOrgs.push(uvOrg.id);
    const uvOwner = await prisma.user.create({ data: { email: `owner-uv-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(PW, 10), role: "owner", organizationId: uvOrg.id } });
    const uvProfile = await prisma.artist.create({ data: { organizationId: uvOrg.id, name: "UV artist", email: `uv-artist-${RUN}@sectest.dev` } });
    const uvJar = await login(uvOwner.email);
    const uvAdmin = await http(uvJar, "GET", "/admin");
    check("unconfirmed account sees the confirm-email banner", uvAdmin.status === 200 && uvAdmin.text.includes("Confirm your email"), `${uvAdmin.status}`);
    const uvBlocked = [
      await http(uvJar, "POST", "/api/admin/artists", { email: `x-${RUN}@sectest.dev` }),
      await http(uvJar, "POST", `/api/admin/roster/${uvProfile.id}/invite`, {}),
      await http(uvJar, "PATCH", "/api/admin/org", { customDomain: `uv-${RUN}.sectest.dev` }),
      await http(uvJar, "POST", "/api/admin/org/spotify", { clientId: "a".repeat(32), clientSecret: "b".repeat(32) }),
    ];
    check("unconfirmed account can't invite, add a domain or connect Spotify", uvBlocked.every((r) => r.status === 403) && (await prisma.invite.count({ where: { organizationId: uvOrg.id } })) === 0, uvBlocked.map((r) => r.status).join("/"));
    check("unconfirmed account can still edit ordinary settings", (await http(uvJar, "PATCH", "/api/admin/org", { name: `Unverified ${RUN} x` })).status === 200);
    check("resend needs a login", (await http(null, "POST", "/api/auth/verify-email")).status === 401);
    const resend = await http(uvJar, "POST", "/api/auth/verify-email");
    check("resend answers for an unconfirmed account", [200, 502, 503].includes(resend.status), `${resend.status}`);
    const gen = await prisma.user.findUnique({ where: { email: genericEmail } });
    check("accepting an invite doesn't confirm the address", !!gen && !gen.emailVerifiedAt);

    const vt = await createVerificationToken(uvOwner);
    const click = await http(null, "GET", `/api/auth/verify-email?t=${vt}`);
    check("verification link confirms the account", click.status === 303 && click.location.includes("/login?verified=1") && !!(await prisma.user.findUnique({ where: { id: uvOwner.id } }))?.emailVerifiedAt, `${click.status} ${click.location}`);
    const vAgain = await http(null, "GET", `/api/auth/verify-email?t=${vt}`);
    check("verification link is single-use", vAgain.location.includes("verify=invalid"), vAgain.location);
    check("confirmed account can invite", (await http(uvJar, "POST", "/api/admin/artists", { email: `ok-${RUN}@sectest.dev` })).status === 200);

    const uv2 = await prisma.user.create({ data: { email: `uv2-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(PW, 10), role: "artist", organizationId: uvOrg.id } });
    const vExpired = await createVerificationToken(uv2);
    await prisma.emailVerificationToken.updateMany({ where: { userId: uv2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expClick = await http(null, "GET", `/api/auth/verify-email?t=${vExpired}`);
    const moved = await createVerificationToken(uv2);
    await prisma.user.update({ where: { id: uv2.id }, data: { email: `uv2-moved-${RUN}@sectest.dev` } });
    const movedClick = await http(null, "GET", `/api/auth/verify-email?t=${moved}`);
    check("expired link and link for an old address are refused", expClick.location.includes("verify=invalid") && movedClick.location.includes("verify=invalid") && !(await prisma.user.findUnique({ where: { id: uv2.id } }))?.emailVerifiedAt, `${expClick.location} ${movedClick.location}`);
    const uv2Jar = await login(`uv2-moved-${RUN}@sectest.dev`);
    const own = await createVerificationToken({ id: uv2.id, email: `uv2-moved-${RUN}@sectest.dev` });
    const ownClick = await http(uv2Jar, "GET", `/api/auth/verify-email?t=${own}`);
    check("signed-in click lands back in the dashboard", ownClick.location.includes("/dashboard?verified=1"), ownClick.location);

    const uv3 = await prisma.user.create({ data: { email: `uv3-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(PW, 10), role: "artist", organizationId: uvOrg.id } });
    const rt = randomBytes(24).toString("base64url");
    await prisma.passwordResetToken.create({ data: { userId: uv3.id, tokenHash: createHash("sha256").update(rt).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    await http({ cookie: "" }, "POST", "/api/auth/reset", undefined, { token: rt, password: PW + "x", confirm: PW + "x" });
    check("resetting the password by email confirms the address", !!(await prisma.user.findUnique({ where: { id: uv3.id } }))?.emailVerifiedAt);

    console.log("\n11. Local release time and fan store choice");
    await prisma.release.update({ where: { id: A.release.id }, data: { spotifyArtistId: "70Xz86ytGtHqZfHFEZ4w0V" } });
    const pre = await http(null, "GET", `/${A.org.slug}/${A.release.slug}`);
    check("pre-save page asks where the fan listens and has a Follow on Spotify button", pre.text.includes("Where do you listen?") && pre.text.includes(`/api/r/${A.release.id}/spotifyFollow`), `${pre.status}`);
    const follow = await http(null, "GET", `/api/r/${A.release.id}/spotifyFollow`);
    check("follow click is logged and goes to the artist on Spotify", follow.status === 302 && follow.location === "https://open.spotify.com/artist/70Xz86ytGtHqZfHFEZ4w0V" && (await prisma.clickEvent.count({ where: { releaseId: A.release.id, platform: "spotifyFollow" } })) >= 1, `${follow.status} ${follow.location}`);
    const fanEmail = `tzfan-${RUN}@fans.dev`;
    await http({ cookie: "" }, "POST", "/api/presave/email", undefined, { releaseId: A.release.id, email: fanEmail, consent: "yes", tz: "America/Los_Angeles", listenOn: "beatport" });
    const tzRow = await prisma.preSave.findFirst({ where: { releaseId: A.release.id, email: fanEmail } });
    check("email pre-save stores the fan's timezone and store", tzRow?.timezone === "America/Los_Angeles" && tzRow?.listenOn === "beatport", JSON.stringify(tzRow && { tz: tzRow.timezone, lo: tzRow.listenOn }));
    const junkEmail = `tzjunk-${RUN}@fans.dev`;
    await http({ cookie: "" }, "POST", "/api/presave/email", undefined, { releaseId: A.release.id, email: junkEmail, consent: "yes", tz: "Mars/Olympus_Mons", listenOn: "myspace" });
    const junk = await prisma.preSave.findFirst({ where: { releaseId: A.release.id, email: junkEmail } });
    check("invalid timezone and store are dropped", !!junk && junk.timezone === null && junk.listenOn === null);
    // Out in the label's timezone (Brisbane) 3h ago, but not yet in Los Angeles: an LA fan can still pre-save.
    await prisma.organization.update({ where: { id: A.org.id }, data: { timezone: "Australia/Brisbane" } });
    await prisma.release.update({ where: { id: A.release.id }, data: { releaseDate: new Date(Date.now() - 3 * 3600_000), rollout: "local" } });
    const laLate = `tzla-${RUN}@fans.dev`;
    const brLate = `tzbr-${RUN}@fans.dev`;
    await http({ cookie: "" }, "POST", "/api/presave/email", undefined, { releaseId: A.release.id, email: laLate, consent: "yes", tz: "America/Los_Angeles" });
    await http({ cookie: "" }, "POST", "/api/presave/email", undefined, { releaseId: A.release.id, email: brLate, consent: "yes", tz: "Australia/Brisbane" });
    check("LA fan can pre-save after it's out in Brisbane; Brisbane fan can't", !!(await prisma.preSave.findFirst({ where: { email: laLate } })) && !(await prisma.preSave.findFirst({ where: { email: brLate } })));
    const releaseSet = await http(ownerA, "PATCH", `/api/admin/releases/${A.release.id}`, { rollout: "everywhere" });
    const hourSet = await http(ownerA, "PATCH", "/api/admin/org", { releaseEmailHour: 25 });
    const hourOk = await http(ownerA, "PATCH", "/api/admin/org", { releaseEmailHour: null });
    check("rollout and email hour are validated", releaseSet.status === 400 && hourSet.status === 400 && hourOk.status === 200, `${releaseSet.status}/${hourSet.status}/${hourOk.status}`);

    console.log("\n12. Insights and share graphics");
    await prisma.release.update({ where: { id: B.release.id }, data: { releaseDate: new Date(Date.now() + 5 * 86400_000) } });
    const shareOwnerB = await login(B.owner.email);
    const insightsPage = await http(shareOwnerB, "GET", `/admin/releases/${B.release.id}?tab=analytics`);
    check("analytics tab renders with activity chart", insightsPage.status === 200 && insightsPage.text.includes("When fans are active"), `${insightsPage.status}`);
    const shareOk = await fetch(`${BASE}/api/admin/releases/${B.release.id}/share?kind=countdown&format=story`, { headers: { cookie: shareOwnerB.cookie } });
    check("owner gets a countdown story PNG", shareOk.status === 200 && (shareOk.headers.get("content-type") ?? "").includes("image/png"), `${shareOk.status}`);
    const shareCross = await http(ownerA, "GET", `/api/admin/releases/${B.release.id}/share?kind=out&format=post`);
    const shareArtist = await http(artistA, "GET", `/api/admin/releases/${A.release.id}/share?kind=out&format=post`);
    check("share images: other label 404, artist 401", shareCross.status === 404 && shareArtist.status === 401, `${shareCross.status}/${shareArtist.status}`);
    const fakeMilestone = await http(shareOwnerB, "GET", `/api/admin/releases/${B.release.id}/share?kind=milestone&n=10000&format=post`);
    const badFormat = await http(shareOwnerB, "GET", `/api/admin/releases/${B.release.id}/share?kind=out&format=billboard`);
    check("can't make a milestone that wasn't reached, or an unknown format", fakeMilestone.status === 400 && badFormat.status === 400, `${fakeMilestone.status}/${badFormat.status}`);

    console.log("\n13. Artist accounts, fans and promo plan");
    const artistSignupEmail = "artist-signup-test@sectest.dev";
    const stale = await prisma.user.findUnique({ where: { email: artistSignupEmail } });
    if (stale) await prisma.organization.delete({ where: { id: stale.organizationId } }).catch(() => {});
    // Refer a friend: org A's link → cookie → the sign-up is recorded as A's referral.
    const refCode = `k${RUN.replace(/[^a-hjkmnp-z2-9]/g, "a")}zzzz`.slice(0, 8);
    await prisma.organization.update({ where: { id: A.org.id }, data: { referralCode: refCode } });
    const joinRes = await fetch(`${BASE}/join/${refCode}`, { redirect: "manual" });
    const joinCookie = (joinRes.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("dfm_ref=")) ?? "";
    const joinBad = await fetch(`${BASE}/join/nope`, { redirect: "manual" });
    check("referral link sets a 30-day cookie and goes to sign-up; unknown codes set nothing", joinRes.status === 307 && (joinRes.headers.get("location") ?? "").startsWith("/signup") && joinCookie.includes(refCode) && /max-age=2592000/i.test(joinCookie) && /httponly/i.test(joinCookie) && !(joinBad.headers.getSetCookie?.() ?? []).some((c) => c.startsWith("dfm_ref=")), `${joinRes.status} ${joinCookie}`);
    const signupJar: Jar = { cookie: `dfm_ref=${refCode}` };
    const su = await http(signupJar, "POST", "/api/auth/signup", undefined, { kind: "artist", orgName: `Solo Artist ${RUN}`, email: artistSignupEmail, password: PW, terms: "yes" });
    const artistUser = await prisma.user.findUnique({ where: { email: artistSignupEmail }, include: { organization: { include: { artists: true } } } });
    if (!artistUser) {
      console.log(`  (skipped artist sign-up checks: start the server with SIGNUP_ALLOWLIST=${artistSignupEmail}) ${su.status} ${su.location}`);
    } else {
      extraOrgs.push(artistUser.organizationId);
      const ref = await prisma.referral.findUnique({ where: { referredOrgId: artistUser.organizationId } });
      check("sign-up through a referral link is recorded as pending for the referrer", ref?.referrerOrgId === A.org.id && ref.status === "pending");
      check("artist sign-up creates an artist account with its own profile", artistUser.organization.kind === "artist" && artistUser.role === "owner" && artistUser.organization.artists.length === 1 && artistUser.organization.artists[0].name === `Solo Artist ${RUN}`);
      const nav = await http(signupJar, "GET", "/admin");
      check("artist admin shows Fans and Profile, not Roster", nav.status === 200 && nav.text.includes(">Profile<") && nav.text.includes(">Fans<") && !nav.text.includes(">Roster<"), `${nav.status}`);
      const roster = await http(signupJar, "GET", "/admin/artists");
      check("artist's roster page goes to their own profile", [307, 308].includes(roster.status) && roster.location.includes(`/admin/artists/${artistUser.organization.artists[0].id}`), `${roster.status} ${roster.location}`);
      await prisma.user.update({ where: { id: artistUser.id }, data: { emailVerifiedAt: new Date() } });
      const wrongTier = await http(signupJar, "POST", "/api/stripe/checkout", { tier: "label", interval: "monthly" });
      check("artist account can't buy a label plan", wrongTier.status === 400, `${wrongTier.status}`);
    }
    const labelArtistTier = await http(ownerA, "POST", "/api/stripe/checkout", { tier: "artist", interval: "monthly" });
    const labelArtistProTier = await http(ownerA, "POST", "/api/stripe/checkout", { tier: "artist_pro", interval: "yearly" });
    check("label account can't buy the Artist or Artist Pro plan", labelArtistTier.status === 400 && labelArtistProTier.status === 400, `${labelArtistTier.status}/${labelArtistProTier.status}`);

    // Release limit counts a rolling 12 months: old releases never have to be deleted.
    const limOrg = await prisma.organization.create({ data: { name: `Limit ${RUN}`, slug: `sectest-limit-${RUN}`, plan: "free" } });
    extraOrgs.push(limOrg.id);
    const limOwner = await prisma.user.create({ data: { email: `owner-limit-${RUN}@sectest.dev`, passwordHash: await bcrypt.hash(PW, 10), role: "owner", organizationId: limOrg.id, emailVerifiedAt: new Date() } });
    const old = new Date(Date.now() - 400 * 86400_000);
    for (let i = 0; i < 3; i++) await prisma.release.create({ data: { organizationId: limOrg.id, slug: `sectest-old-${i}-${RUN}`, title: `Old ${i}`, artistName: "L", coverUrl: "https://example.com/c.jpg", releaseDate: old, createdAt: old } });
    const limJar = await login(limOwner.email);
    const newRel = (n: number) => http(limJar, "POST", "/api/admin/releases", { title: `New ${n}`, artistName: "L", coverUrl: "https://example.com/c.jpg", slug: `sectest-new-${n}-${RUN}`, releaseDateLocal: "2027-01-01T00:00", links: [] });
    const afterOld = await newRel(1);
    check("Free: releases older than 12 months don't count toward the limit", afterOld.status === 200 || afterOld.status === 201, `${afterOld.status} ${afterOld.text.slice(0, 120)}`);
    await newRel(2);
    await newRel(3);
    const fourth = await newRel(4);
    check("Free: a 4th new release in 12 months is blocked", fourth.status === 402, `${fourth.status}`);

    // News opt-in on the pre-save form, fan list and export
    await prisma.authThrottle.deleteMany({}); // earlier sections used up the per-IP pre-save limit
    await prisma.release.update({ where: { id: B.release.id }, data: { releaseDate: new Date(Date.now() + 5 * 86400_000), isPublic: true } });
    const newsFan = `newsfan-${RUN}@fans.dev`;
    const plainFan = `plainfan-${RUN}@fans.dev`;
    await http({ cookie: "" }, "POST", "/api/presave/email", undefined, { releaseId: B.release.id, email: newsFan, consent: "yes", news: "yes", listenOn: "spotify" });
    await http({ cookie: "" }, "POST", "/api/presave/email", undefined, { releaseId: B.release.id, email: plainFan, consent: "yes" });
    const nf = await prisma.preSave.findFirst({ where: { email: newsFan } });
    const pf = await prisma.preSave.findFirst({ where: { email: plainFan } });
    check("news opt-in is stored separately from release-day consent", !!nf?.newsConsent && !!nf.newsConsentAt && !!pf && !pf.newsConsent && pf.emailConsent, JSON.stringify({ nf: nf?.newsConsent, pf: pf?.newsConsent }));
    const fansOwnerB = await login(B.owner.email);
    const fansPage = await http(fansOwnerB, "GET", "/admin/fans?news=1");
    check("fan list filters to news opt-ins", fansPage.status === 200 && fansPage.text.includes(newsFan) && !fansPage.text.includes(plainFan), `${fansPage.status}`);
    const crossFans = await http(ownerA, "GET", "/admin/fans");
    check("another label's fan list doesn't include these fans", crossFans.status === 200 && !crossFans.text.includes(newsFan));
    await prisma.organization.update({ where: { id: B.org.id }, data: { plan: "free" } });
    const exportFree = await http(fansOwnerB, "GET", "/api/admin/fans/export");
    await prisma.organization.update({ where: { id: B.org.id }, data: { plan: "label" } });
    const exportPaid = await http(fansOwnerB, "GET", "/api/admin/fans/export?news=1");
    check("fan export is paid-only and marks news opt-ins", exportFree.status === 402 && exportPaid.status === 200 && exportPaid.text.includes("news_opt_in") && exportPaid.text.includes(newsFan) && !exportPaid.text.includes(plainFan), `${exportFree.status}/${exportPaid.status}`);
    const artistExport = await http(artistA, "GET", "/api/admin/fans/export");
    check("artist logins can't export the label's fans", artistExport.status === 401, `${artistExport.status}`);

    // Promo plan
    const promoTab = await http(fansOwnerB, "GET", `/admin/releases/${B.release.id}?tab=promo`);
    check("promo plan tab renders dated steps", promoTab.status === 200 && promoTab.text.includes("Pitch to Spotify") && promoTab.text.includes("droplr does these for you"), `${promoTab.status}`);
    const tick = await http(fansOwnerB, "POST", `/api/admin/releases/${B.release.id}/promo`, { key: "announce", done: true });
    const badKey = await http(fansOwnerB, "POST", `/api/admin/releases/${B.release.id}/promo`, { key: "hack", done: true });
    const crossTick = await http(ownerA, "POST", `/api/admin/releases/${B.release.id}/promo`, { key: "teaser", done: true });
    check("promo steps tick per release; unknown step 400, other label 404", tick.status === 200 && badKey.status === 400 && crossTick.status === 404 && (await prisma.promoTaskDone.count({ where: { releaseId: B.release.id } })) === 1, `${tick.status}/${badKey.status}/${crossTick.status}`);

    console.log("\n14. Feedback conversations and referral page");
    const fbNew = await http(ownerA, "POST", "/api/feedback", { category: "bug", body: `<img src=x onerror=alert(1)> fb-${RUN}`, page: "//evil.example/x" });
    const fbThread = await prisma.feedbackThread.findFirst({ where: { organizationId: A.org.id, userId: A.owner.id }, include: { messages: true }, orderBy: { createdAt: "desc" } });
    check("feedback starts a conversation for the sender (off-site page ignored)", fbNew.status === 200 && !!fbThread && fbThread.category === "bug" && fbThread.unreadByTeam && fbThread.page === null && fbThread.messages.length === 1, `${fbNew.status} ${fbNew.text.slice(0, 80)}`);
    if (fbThread) {
      const mine = await http(ownerA, "GET", `/admin/feedback/${fbThread.id}`);
      check("sender sees their conversation, escaped", mine.status === 200 && mine.text.includes(`fb-${RUN}`) && !mine.text.includes("<img src=x"), `${mine.status}`);
      const otherLabel = await http(ownerB, "GET", `/admin/feedback/${fbThread.id}`);
      const otherReply = await http(ownerB, "POST", `/api/feedback/${fbThread.id}`, { body: "hijack" });
      const fbArtist = await login(A.artist2.email); // a fresh session: earlier sections sign artistA out
      const sameOrgArtist = await http(fbArtist, "POST", `/api/feedback/${fbThread.id}`, { body: "hijack" });
      check("nobody else can read or reply to someone's feedback (other label, same-label artist)", otherLabel.status === 404 && otherReply.status === 404 && sameOrgArtist.status === 404, `${otherLabel.status}/${otherReply.status}/${sameOrgArtist.status}`);
      const teamReplyByOwner = await http(ownerA, "POST", `/api/platform/feedback/${fbThread.id}`, { body: "I'm the team now" });
      check("a normal account can't post as the droplr team", teamReplyByOwner.status === 404 && (await prisma.feedbackMessage.count({ where: { threadId: fbThread.id, fromTeam: true } })) === 0, `${teamReplyByOwner.status}`);
      const tooLong = await http(ownerA, "POST", `/api/feedback/${fbThread.id}`, { body: "x".repeat(4001) });
      check("feedback over 4000 characters is refused", tooLong.status === 400, `${tooLong.status}`);
      const artistPage = await http(fbArtist, "GET", "/dashboard/feedback");
      check("artist logins have their own feedback page", artistPage.status === 200 && artistPage.text.includes("Your conversations"), `${artistPage.status}`);
      const platUser = adminEmail ? await prisma.user.findUnique({ where: { email: adminEmail } }) : null;
      if (platUser?.role === "owner") {
        const pa = await login(adminEmail);
        const inbox = await http(pa, "GET", "/platform/feedback?show=unread");
        const reply = await http(pa, "POST", `/api/platform/feedback/${fbThread.id}`, { body: `team-reply-${RUN}`, status: "closed" });
        const after = await prisma.feedbackThread.findUnique({ where: { id: fbThread.id } });
        check("platform owner sees it, replies and closes; the sender gets an unread reply", inbox.status === 200 && inbox.text.includes(`fb-${RUN}`) && reply.status === 200 && !!after?.unreadByUser && after.status === "closed" && !after.unreadByTeam, `${inbox.status}/${reply.status}`);
        const badge = await http(ownerA, "GET", "/admin");
        check("the header shows a new-reply dot", badge.text.includes("New reply"));
        const reopen = await http(ownerA, "POST", `/api/feedback/${fbThread.id}`, { body: "thanks" });
        const reopened = await prisma.feedbackThread.findUnique({ where: { id: fbThread.id } });
        check("replying reopens a closed conversation for the team", reopen.status === 200 && reopened?.status === "open" && !!reopened.unreadByTeam && !reopened.unreadByUser, `${reopen.status}`);
        const refPage = await http(pa, "GET", "/platform/referrals");
        check("platform referrals page lists referrals", refPage.status === 200 && refPage.text.includes("Referrals"), `${refPage.status}`);
      } else {
        console.log("  (skipped platform feedback reply checks: needs PLATFORM_TEST_ADMIN)");
      }
    }
    console.log("\n15. Push notifications");
    const pushSub = (host: string, n = "1") => ({ subscription: { endpoint: `${host}/push/${n}-${RUN}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } } });
    const subAnon = await http(null, "POST", "/api/push/subscribe", pushSub("https://fcm.googleapis.com/fcm/send"));
    check("push subscribe needs a login", subAnon.status === 401, `${subAnon.status}`);
    const probe = await http(ownerA, "POST", "/api/push/subscribe", pushSub("https://fcm.googleapis.com/fcm/send", "probe"));
    if (probe.status === 503) {
      console.log("  (skipped push checks: start the server with VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
    } else {
      const evil = await http(ownerA, "POST", "/api/push/subscribe", pushSub("https://evil.example"));
      const plainHttp = await http(ownerA, "POST", "/api/push/subscribe", pushSub("http://fcm.googleapis.com/fcm/send"));
      const internal = await http(ownerA, "POST", "/api/push/subscribe", pushSub("https://fcm.googleapis.com.evil.example"));
      check("only real push services are accepted as endpoints (no SSRF)", evil.status === 400 && plainHttp.status === 400 && internal.status === 400 && (await prisma.pushSubscription.count({ where: { endpoint: { contains: "evil" } } })) === 0, `${evil.status}/${plainHttp.status}/${internal.status}`);
      const apple = await http(ownerA, "POST", "/api/push/subscribe", pushSub("https://web.push.apple.com", "ios"));
      const mine = await prisma.pushSubscription.findMany({ where: { userId: A.owner.id } });
      check("Apple and Google push endpoints save to the login", probe.status === 200 && apple.status === 200 && mine.length === 2, `${probe.status}/${apple.status}/${mine.length}`);
      const otherRemove = await http(ownerB, "DELETE", "/api/push/devices", { id: mine[0].id });
      const otherUnsub = await http(ownerB, "DELETE", "/api/push/subscribe", { endpoint: mine[0].endpoint });
      check("nobody else can remove your devices", otherRemove.status === 404 && JSON.parse(otherUnsub.text).removed === 0 && (await prisma.pushSubscription.count({ where: { userId: A.owner.id } })) === 2, `${otherRemove.status}`);
      const prefs = await http(ownerA, "PATCH", "/api/push/prefs", { milestones: false, bogus: true, feedback: "yes" });
      const saved = (await prisma.user.findUnique({ where: { id: A.owner.id } }))?.pushPrefs as Record<string, unknown> | null;
      check("notification preferences save booleans for known kinds only", prefs.status === 200 && saved?.milestones === false && !("bogus" in (saved ?? {})) && !("feedback" in (saved ?? {})), JSON.stringify(saved));
      const acct = await http(ownerA, "GET", "/admin/settings/account");
      check("account page shows App & notifications with the device list", acct.status === 200 && acct.text.includes("App &amp; notifications") && acct.text.includes("Notify me about"), `${acct.status}`);
      const mine2 = await http(ownerA, "DELETE", "/api/push/devices", { id: mine[0].id });
      check("you can remove your own device", mine2.status === 200 && (await prisma.pushSubscription.count({ where: { userId: A.owner.id } })) === 1);
      await prisma.pushSubscription.deleteMany({ where: { userId: A.owner.id } });
    }
    const sw = await fetch(`${BASE}/sw.js`);
    const manifest = await fetch(`${BASE}/app/manifest.webmanifest`);
    const mj = await manifest.json().catch(() => ({}));
    check("service worker and app manifest are served", sw.status === 200 && (sw.headers.get("service-worker-allowed") ?? "") === "/" && (await sw.text()).includes("showNotification") && manifest.status === 200 && mj.display === "standalone", `${sw.status}/${manifest.status}`);

    const refOwnPage = await http(ownerA, "GET", "/admin/referrals");
    check("referral page shows the account's link", refOwnPage.status === 200 && refOwnPage.text.includes("/join/"), `${refOwnPage.status}`);
    const refPlat = await http(ownerA, "POST", "/api/platform/referrals");
    check("only the platform owner can run the referral check", refPlat.status === 404, `${refPlat.status}`);
    console.log("\n15b. Walkthrough and press kit");
    const tourAnon = await http(null, "POST", "/api/tour", { done: true });
    const tourOwn = await http(ownerA, "POST", "/api/tour", { done: true });
    const aAfter = await prisma.user.findUnique({ where: { id: A.owner.id } });
    const bAfter = await prisma.user.findUnique({ where: { id: B.owner.id } });
    check("the walkthrough is dismissed per login, and needs one", tourAnon.status === 401 && tourOwn.status === 200 && !!aAfter?.tourDoneAt && !bAfter?.tourDoneAt, `${tourAnon.status}/${tourOwn.status}`);
    const tourAgain = await http(ownerA, "POST", "/api/tour", { done: false });
    check("you can ask for the walkthrough again", tourAgain.status === 200 && !(await prisma.user.findUnique({ where: { id: A.owner.id } }))?.tourDoneAt);
    const epkOwn = await http(ownerA, "GET", `/admin/artists/${(await prisma.artist.findFirst({ where: { organizationId: A.org.id } }))?.id}/epk`);
    const epkCross = await http(ownerB, "GET", `/admin/artists/${(await prisma.artist.findFirst({ where: { organizationId: A.org.id } }))?.id}/epk`);
    check("a press kit is only visible to its own label", epkOwn.status === 200 && epkCross.status === 404, `${epkOwn.status}/${epkCross.status}`);

    const legalAnon = await http(null, "POST", "/api/legal/accept");
    await prisma.user.update({ where: { id: A.owner.id }, data: { termsVersion: "2020-01-01" } });
    const staleDash = await http(ownerA, "GET", "/admin");
    const legalOk = await http(ownerA, "POST", "/api/legal/accept");
    const afterAccept = await prisma.user.findUnique({ where: { id: A.owner.id } });
    const freshDash = await http(ownerA, "GET", "/admin");
    check("an old terms version shows the notice until the login accepts", legalAnon.status === 401 && staleDash.text.includes("updated our Terms") && legalOk.status === 200 && afterAccept?.termsVersion === LEGAL.version && !freshDash.text.includes("updated our Terms"), `${legalAnon.status}/${legalOk.status}`);

    console.log("\n16. Owner signup invites");
    await prisma.authThrottle.deleteMany({}); // sign-ups are 5 per IP per hour
    const invByOwner = await http(ownerA, "POST", "/api/platform/invites", { open: true, maxUses: 5 });
    const invPage = await http(ownerA, "GET", "/platform/access");
    const invAnon = await http(null, "POST", "/api/platform/invites", { open: true });
    check("only the platform owner can make invites or see Access", invByOwner.status === 404 && invAnon.status === 404 && invPage.status !== 200 && (await prisma.signupInvite.count({ where: { createdBy: A.owner.email } })) === 0, `${invByOwner.status}/${invAnon.status}/${invPage.status}`);
    const garbage = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Nope ${RUN}`, email: `nocode-${RUN}@sectest.dev`, password: PW, terms: "yes", inviteCode: "A".repeat(32) });
    check("a made-up invite code doesn't open sign-up", !garbage.location.includes("/admin") && !(await prisma.user.findUnique({ where: { email: `nocode-${RUN}@sectest.dev` } })), garbage.location);
    const platUser2 = adminEmail ? await prisma.user.findUnique({ where: { email: adminEmail } }) : null;
    if (platUser2?.role === "owner") {
      const pa = await login(adminEmail);
      const note = `sec-${RUN}`;
      const bound = `inv-bound-${RUN}@sectest.dev`;
      const mk = await http(pa, "POST", "/api/platform/invites", { emails: `${bound}, ${A.owner.email}`, kind: "artist", expiresInDays: 7, note });
      const mkj = JSON.parse(mk.text) as { created: { url: string; email: string }[]; skipped: { email: string }[] };
      const boundUrl = mkj.created[0]?.url ?? "";
      const code = new URL(boundUrl || "http://x/").searchParams.get("code") ?? "";
      check("owner makes a single-use invite per email; existing accounts are skipped", mk.status === 200 && mkj.created.length === 1 && mkj.created[0].email === bound && mkj.skipped[0]?.email === A.owner.email && code.length === 32, mk.text.slice(0, 160));
      const stored = await prisma.signupInvite.findFirst({ where: { email: bound } });
      const dupe = JSON.parse((await http(pa, "POST", "/api/platform/invites", { emails: bound, note })).text) as { created: unknown[]; skipped: { email: string }[] };
      check("inviting someone who already has an active invite is skipped", dupe.created.length === 0 && dupe.skipped[0]?.email === bound && (await prisma.signupInvite.count({ where: { email: bound } })) === 1);
      check("invite codes are stored hashed and encrypted, never in plain text", !!stored && stored.tokenHash !== code && !stored.tokenEncrypted.includes(code));
      const page = await http(null, "GET", `/signup?code=${code}`);
      check("invite link opens the sign-up form on the Free plan with the email and type locked", page.status === 200 && page.text.includes("invited to droplr.fm") && page.text.includes("Free plan") && page.text.includes(bound) && /readonly/i.test(page.text) && !page.text.includes("I run a label"), `${page.status}`);
      const wrong = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Wrong ${RUN}`, email: `someone-else-${RUN}@sectest.dev`, password: PW, terms: "yes", inviteCode: code });
      check("an email-bound invite doesn't work for another address", wrong.location.includes("different%20email") && !(await prisma.user.findUnique({ where: { email: `someone-else-${RUN}@sectest.dev` } })), wrong.location);
      const jarI: Jar = { cookie: "" };
      const ok = await http(jarI, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Invited ${RUN}`, email: bound, password: PW, terms: "yes", inviteCode: code });
      const invUser = await prisma.user.findUnique({ where: { email: bound }, include: { organization: true } });
      if (invUser) extraOrgs.push(invUser.organizationId);
      const o = invUser?.organization;
      check("invite works while signups are closed (email not in the allowlist)", ok.location.includes("/admin?welcome=1") && !!invUser, `${ok.status} ${ok.location}`);
      check("invited account: type fixed by the invite (form can't override), Free plan, no comp", o?.kind === "artist" && o.plan === "free" && o.compPlan === null && o.signupInviteId === stored?.id, JSON.stringify({ kind: o?.kind, plan: o?.plan }));
      const again = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Again ${RUN}`, email: bound.replace("inv-", "inv2-"), password: PW, terms: "yes", inviteCode: code });
      check("a used invite can't be used again", !again.location.includes("/admin") && !(await prisma.user.findUnique({ where: { email: bound.replace("inv-", "inv2-") } })), again.location);

      const openMk = JSON.parse((await http(pa, "POST", "/api/platform/invites", { open: true, maxUses: 1, note })).text) as { created: { id: string; url: string }[] };
      const openCode = new URL(openMk.created[0].url).searchParams.get("code")!;
      const o1 = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Open1 ${RUN}`, email: `open1-${RUN}@sectest.dev`, password: PW, terms: "yes", inviteCode: openCode });
      const o2 = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Open2 ${RUN}`, email: `open2-${RUN}@sectest.dev`, password: PW, terms: "yes", inviteCode: openCode });
      const u1 = await prisma.user.findUnique({ where: { email: `open1-${RUN}@sectest.dev` }, include: { organization: true } });
      if (u1) extraOrgs.push(u1.organizationId);
      check("open link: works for anyone up to its limit, on the Free plan", o1.location.includes("/admin") && u1?.organization.kind === "label" && u1.organization.plan === "free" && u1.organization.compPlan === null && !o2.location.includes("/admin") && !(await prisma.user.findUnique({ where: { email: `open2-${RUN}@sectest.dev` } })), `${o1.location} / ${o2.location}`);

      const rv = JSON.parse((await http(pa, "POST", "/api/platform/invites", { open: true, maxUses: 5, note })).text) as { created: { id: string; url: string }[] };
      const rvByOwner = await http(ownerA, "POST", `/api/platform/invites/${rv.created[0].id}`, { action: "revoke" });
      const rvOk = await http(pa, "POST", `/api/platform/invites/${rv.created[0].id}`, { action: "revoke" });
      const rvUse = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Rv ${RUN}`, email: `revoked-${RUN}@sectest.dev`, password: PW, terms: "yes", inviteCode: new URL(rv.created[0].url).searchParams.get("code")! });
      check("revoked links stop working; only the platform owner can revoke", rvByOwner.status === 404 && rvOk.status === 200 && !rvUse.location.includes("/admin") && !(await prisma.user.findUnique({ where: { email: `revoked-${RUN}@sectest.dev` } })), `${rvByOwner.status}/${rvOk.status} ${rvUse.location}`);
      const ex = JSON.parse((await http(pa, "POST", "/api/platform/invites", { open: true, maxUses: 5, note })).text) as { created: { id: string; url: string }[] };
      await prisma.signupInvite.update({ where: { id: ex.created[0].id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const exCode = new URL(ex.created[0].url).searchParams.get("code")!;
      const exUse = await http({ cookie: "" }, "POST", "/api/auth/signup", undefined, { kind: "label", orgName: `Ex ${RUN}`, email: `expired-${RUN}@sectest.dev`, password: PW, terms: "yes", inviteCode: exCode });
      const exPage = await http(null, "GET", `/signup?code=${exCode}`);
      check("expired links stop working and say so", !exUse.location.includes("/admin") && !(await prisma.user.findUnique({ where: { email: `expired-${RUN}@sectest.dev` } })) && exPage.text.includes("expired, been used up"), exUse.location);

      await prisma.waitlistFeature.upsert({ where: { email_featureName: { email: `wait-${RUN}@sectest.dev`, featureName: "launch" } }, update: {}, create: { email: `wait-${RUN}@sectest.dev`, featureName: "launch" } });
      const access = await http(pa, "GET", "/platform/access");
      check("Access page lists invites (with who joined) and the waitlist", access.status === 200 && access.text.includes(bound) && access.text.includes(`Invited ${RUN}`) && access.text.includes(`wait-${RUN}@sectest.dev`), `${access.status}`);
      await prisma.waitlistFeature.deleteMany({ where: { email: `wait-${RUN}@sectest.dev` } });
      await prisma.signupInvite.deleteMany({ where: { note } });
    } else {
      console.log("  (skipped platform invite checks: needs PLATFORM_TEST_ADMIN)");
    }
  } finally {
    if (process.env.PLATFORM_TEST_ADMIN) {
      const e = process.env.PLATFORM_TEST_ADMIN.trim().toLowerCase();
      await prisma.user.deleteMany({ where: { email: e, organizationId: { in: [A.org.id, B.org.id] }, role: { not: "owner" } } }).catch(() => {});
    }
    await prisma.authThrottle.deleteMany({}).catch(() => {});
    // Artist rows cascade with their org; the explicit delete keeps that true even if the FK ever changes.
    await prisma.artist.deleteMany({ where: { organizationId: { in: [A.org.id, B.org.id, ...extraOrgs] } } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: [A.org.id, B.org.id, ...extraOrgs] } } });
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
