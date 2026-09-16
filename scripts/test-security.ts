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
 * Everything it creates is deleted at the end. Never point it at production.
 */
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { signToken } from "../src/lib/crypto";
import { prisma } from "../src/lib/db";

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
  const owner = await prisma.user.create({ data: { email: `owner-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "owner", organizationId: org.id } });
  const artist = await prisma.user.create({ data: { email: `artist-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "artist", artistName: `Artist ${tag}`, organizationId: org.id } });
  const artist2 = await prisma.user.create({ data: { email: `artist2-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "artist", artistName: `Artist2 ${tag}`, organizationId: org.id } });
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
  const A = await fixtures("a");
  const B = await fixtures("b");
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
        await prisma.user.create({ data: { email: adminEmail, passwordHash: await bcrypt.hash(PW, 10), role: "artist", artistName: "Impostor", organizationId: A.org.id } });
        const impostor = await login(adminEmail);
        const impPlat = await http(impostor, "GET", "/platform");
        const impPatch = await http(impostor, "PATCH", `/api/platform/orgs/${A.org.id}`, { compPlan: "enterprise" });
        check("platform admin email on a non-owner account isn't platform admin", impPatch.status === 404 && impPlat.status !== 200, `api ${impPatch.status}, page ${impPlat.status}`);
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
      const unsubWithPst = await http(null, "GET", `/api/unsubscribe?t=${await signToken({ ps: bFan.id, act: "unsub" }, "1h", "pst")}`);
      const bFanNow = await prisma.preSave.findUnique({ where: { id: bFan.id } });
      check("pst token can't unsubscribe", unsubWithPst.status === 400 && !!bFanNow?.emailConsent, `got ${unsubWithPst.status}`);
    }
  } finally {
    if (process.env.PLATFORM_TEST_ADMIN) {
      const e = process.env.PLATFORM_TEST_ADMIN.trim().toLowerCase();
      await prisma.user.deleteMany({ where: { email: e, organizationId: { in: [A.org.id, B.org.id] }, role: { not: "owner" } } }).catch(() => {});
    }
    await prisma.authThrottle.deleteMany({}).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: [A.org.id, B.org.id] } } });
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
