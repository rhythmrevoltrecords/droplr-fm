/**
 * Roster grants: an artist's own droplr account linked to a label's roster row.
 *
 * This is the only feature that deliberately lets one organisation's data reach an account in
 * another, so it gets its own suite and the tests are written from the attacker's side.
 *
 * What this defends:
 *  - the grant is READ-ONLY. A linked artist cannot edit, delete or re-link anything of the
 *    label's, and cannot reach any label route for the label's organisation;
 *  - the grant is NARROW. They see the releases naming them and nothing else — not the label's
 *    other artists, not its other releases, not its fan list, not its aggregate;
 *  - the grant is ONE-WAY. The label gets nothing of the artist's;
 *  - the grant is CONSENTED. A label cannot claim an account; only the invited account can
 *    accept, and a forwarded link is useless to anyone else;
 *  - the grant is REVOCABLE, from either side, and takes effect at once.
 *
 * Local database only. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { randomToken, sha256 } from "../src/lib/crypto";
import { grantedReleaseWhere, grantsFor } from "../src/lib/roster-grant";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try { host = new URL(raw).hostname; } catch { host = raw; }
  if (host.includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run: ${name} points at ${host} (production).`);
    process.exit(1);
  }
}
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
if (/droplr\.fm/.test(BASE)) throw new Error("Refusing to run against droplr.fm");

const RUN = randomBytes(3).toString("hex");
const PW = "correct-horse-battery-" + RUN;
let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { ok ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`${ok ? "  ✓" : "  ✗"} ${n}${!ok && d ? ` (${d})` : ""}`); };

type Jar = { cookie: string };
async function http(jar: Jar | null, method: string, path: string, body?: unknown, form?: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (jar?.cookie) headers.cookie = jar.cookie;
  if (body) headers["content-type"] = "application/json";
  if (form) headers["content-type"] = "application/x-www-form-urlencoded";
  const res = await fetch(`${BASE}${path}`, {
    method, headers, redirect: "manual",
    body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (jar) for (const c of set) {
    const [kv] = c.split(";"); const [k] = kv.split("=");
    jar.cookie = [...jar.cookie.split("; ").filter((x) => x && !x.startsWith(`${k}=`)), kv].join("; ");
  }
  return { status: res.status, location: res.headers.get("location") ?? "", text: await res.text() };
}
async function login(email: string): Promise<Jar> {
  const jar: Jar = { cookie: "" };
  const r = await http(jar, "POST", "/api/auth/login", undefined, { email, password: PW });
  if (!jar.cookie) throw new Error(`login failed for ${email}: ${r.status}`);
  return jar;
}

async function main() {
  const hash = await bcrypt.hash(PW, 10);
  // The label, with two artists and a release each.
  const label = await prisma.organization.create({ data: { name: `Label ${RUN}`, slug: `rl-label-${RUN}`, plan: "label", kind: "label", timezone: "Australia/Brisbane" } });
  const labelOwner = await prisma.user.create({ data: { email: `label-${RUN}@sectest.dev`, passwordHash: hash, role: "owner", organizationId: label.id, emailVerifiedAt: new Date() } });
  // The artist, with their own account and their own release.
  const own = await prisma.organization.create({ data: { name: `Nathan ${RUN}`, slug: `rl-own-${RUN}`, plan: "artist_pro", kind: "artist", timezone: "Australia/Brisbane" } });
  const artistUser = await prisma.user.create({ data: { email: `artist-${RUN}@sectest.dev`, passwordHash: hash, role: "owner", organizationId: own.id, emailVerifiedAt: new Date() } });
  // An unrelated third account, to prove a forwarded invite is useless.
  const outsider = await prisma.organization.create({ data: { name: `Outsider ${RUN}`, slug: `rl-out-${RUN}`, plan: "free", kind: "artist", timezone: "Australia/Brisbane" } });
  const outsiderUser = await prisma.user.create({ data: { email: `outsider-${RUN}@sectest.dev`, passwordHash: hash, role: "owner", organizationId: outsider.id, emailVerifiedAt: new Date() } });

  const mine = await prisma.artist.create({ data: { organizationId: label.id, name: `Nathan ${RUN}`, email: artistUser.email } });
  const other = await prisma.artist.create({ data: { organizationId: label.id, name: `Someone Else ${RUN}` } });
  const mineRelease = await prisma.release.create({ data: { organizationId: label.id, artistProfileId: mine.id, slug: `rl-mine-${RUN}`, title: `Mine ${RUN}`, artistName: "Nathan", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), isPublic: true } });
  const otherRelease = await prisma.release.create({ data: { organizationId: label.id, artistProfileId: other.id, slug: `rl-other-${RUN}`, title: `SECRET OTHER ${RUN}`, artistName: "Someone Else", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), isPublic: true } });
  await prisma.preSave.create({ data: { releaseId: otherRelease.id, platform: "email", email: `labelfan-${RUN}@example.com`, emailConsent: true } });
  const ownRelease = await prisma.release.create({ data: { organizationId: own.id, slug: `rl-ownrel-${RUN}`, title: `My Own ${RUN}`, artistName: "Nathan", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), isPublic: true } });

  try {
    console.log("\n1. Before any link");
    check("no grants yet", (await grantsFor(artistUser.id)).length === 0);
    const artistJar = await login(artistUser.email);
    const before = await http(artistJar, "GET", "/admin");
    check("the artist's dashboard shows their own release", before.text.includes(`My Own ${RUN}`));
    check("and not the label's", !before.text.includes(`Mine ${RUN}`) && !before.text.includes("SECRET OTHER"));

    console.log("\n2. The label cannot claim an account");
    const ownerJar = await login(labelOwner.email);
    const madeUp = await http(ownerJar, "POST", `/api/admin/roster/${mine.id}/link`, { email: `nobody-${RUN}@sectest.dev` });
    check("linking an email with no account is refused", madeUp.status === 409, String(madeUp.status));
    const created = await http(ownerJar, "POST", `/api/admin/roster/${mine.id}/link`, { email: artistUser.email });
    check("a link invitation is created", created.status === 200, String(created.status));
    const linkUrl = created.status === 200 ? ((JSON.parse(created.text) as { link?: string }).link ?? "") : "";
    const token = linkUrl.split("/invite/")[1] ?? "";
    check("it returns a one-time link", !!token);
    const still = await prisma.artist.findUnique({ where: { id: mine.id }, select: { linkedUserId: true } });
    check("nothing is linked until the artist accepts", still?.linkedUserId === null);

    console.log("\n3. A forwarded invitation is useless");
    const outsiderJar = await login(outsiderUser.email);
    const stolen = await http(outsiderJar, "POST", "/api/roster-link", undefined, { token });
    check("a different account can't accept it", stolen.status === 403, String(stolen.status));
    check("still not linked", (await prisma.artist.findUnique({ where: { id: mine.id }, select: { linkedUserId: true } }))?.linkedUserId === null);
    // Next answers a redirect() on a POST with 303 See Other, so assert where it lands rather
    // than which redirect code it chose — the destination is the thing that matters.
    const anon = await http(null, "POST", "/api/roster-link", undefined, { token });
    const bounced = [301, 302, 303, 307, 308].includes(anon.status) && anon.location.includes("/login");
    check("a signed-out visitor is sent to log in, not through", bounced || anon.status === 401, `${anon.status} ${anon.location}`);
    check("and nothing was linked by trying", (await prisma.artist.findUnique({ where: { id: mine.id }, select: { linkedUserId: true } }))?.linkedUserId === null);

    console.log("\n4. The artist accepts");
    const accepted = await http(artistJar, "POST", "/api/roster-link", undefined, { token });
    check("accepting works", accepted.status === 303, String(accepted.status));
    const linked = await prisma.artist.findUnique({ where: { id: mine.id }, select: { linkedUserId: true, linkedAt: true } });
    check("the roster row records the link", linked?.linkedUserId === artistUser.id && !!linked?.linkedAt);
    const rel = await prisma.release.findUnique({ where: { id: mineRelease.id }, select: { artistId: true } });
    check("their release points at them for reading", rel?.artistId === artistUser.id);
    check("the invitation is spent", !!(await prisma.invite.findUnique({ where: { tokenHash: sha256(token) }, select: { acceptedAt: true } }))?.acceptedAt);
    check("replaying the invitation fails", (await http(artistJar, "POST", "/api/roster-link", undefined, { token })).status === 400);

    console.log("\n5. What the artist can now see — and only that");
    const after = await http(artistJar, "GET", "/admin");
    check("the label's release under their name appears", after.text.includes(`Mine ${RUN}`), "granted release missing");
    check("their own release is still there", after.text.includes(`My Own ${RUN}`));
    check("the label's OTHER artist's release does not", !after.text.includes("SECRET OTHER"), "leaked another artist's release");
    check("the label's fan address does not", !after.text.includes(`labelfan-${RUN}`), "leaked the label's fan list");
    const where = grantedReleaseWhere(artistUser.id, await grantsFor(artistUser.id));
    const visible = where ? await prisma.release.findMany({ where, select: { id: true } }) : [];
    check("the grant resolves to exactly one release", visible.length === 1 && visible[0].id === mineRelease.id, `${visible.length}`);

    console.log("\n6. Read-only, everywhere");
    const writes: [string, string, unknown?][] = [
      ["PATCH", `/api/admin/releases/${mineRelease.id}`, { title: "pwned" }],
      ["DELETE", `/api/admin/releases/${mineRelease.id}`],
      ["PUT", `/api/admin/releases/${mineRelease.id}/links`, { links: [] }],
      ["POST", `/api/admin/releases/${mineRelease.id}/report`, { on: true }],
      ["GET", `/api/admin/releases/${mineRelease.id}/export?type=presaves`],
      ["PATCH", `/api/admin/roster/${mine.id}`, { name: "pwned" }],
      ["POST", `/api/admin/roster/${other.id}/link`, { email: `outsider-${RUN}@sectest.dev` }],
      ["GET", `/admin/releases/${mineRelease.id}`],
      ["GET", `/admin/artists/${mine.id}`],
    ];
    for (const [m, p, body] of writes) {
      const r = await http(artistJar, m, p, body);
      const blocked = r.status === 401 || r.status === 403 || r.status === 404 || r.status === 307 || r.status === 302;
      check(`${m} ${p.replace(RUN, "…").split("?")[0]} blocked`, blocked, `got ${r.status}`);
      check(`${m} ${p.replace(RUN, "…").split("?")[0]} leaks nothing`, !r.text.includes("SECRET OTHER") && !r.text.includes(`labelfan-${RUN}`));
    }
    const untouched = await prisma.release.findUnique({ where: { id: mineRelease.id }, select: { title: true } });
    check("the release is unchanged", untouched?.title === `Mine ${RUN}`, untouched?.title);
    const fans = await http(artistJar, "GET", "/admin/fans");
    check("the fans page shows the label's fans to nobody but the label", !fans.text.includes(`labelfan-${RUN}`));

    console.log("\n7. One-way: the label gains nothing");
    const labelHome = await http(ownerJar, "GET", "/admin");
    check("the label can't see the artist's own release", !labelHome.text.includes(`My Own ${RUN}`), "leaked the artist's own work");
    const labelProfile = await http(ownerJar, "GET", `/admin/artists/${mine.id}`);
    check("the roster page shows the link exists", labelProfile.text.includes("Linked"), `status ${labelProfile.status}`);
    check("but not the artist's own releases", !labelProfile.text.includes(`My Own ${RUN}`));

    console.log("\n8. Either side can end it");
    const unlinked = await http(artistJar, "DELETE", "/api/roster-link", { artistProfileId: mine.id });
    check("the artist can unlink", unlinked.status === 200, String(unlinked.status));
    check("access goes immediately", !(await http(artistJar, "GET", "/admin")).text.includes(`Mine ${RUN}`), "still visible after unlinking");
    check("the label keeps the release", !!(await prisma.release.findUnique({ where: { id: mineRelease.id } })));
    check("and it is no longer pointed at them", (await prisma.release.findUnique({ where: { id: mineRelease.id }, select: { artistId: true } }))?.artistId === null);

    // Re-link, then end it from the label's side.
    const again = await http(ownerJar, "POST", `/api/admin/roster/${mine.id}/link`, { email: artistUser.email });
    const token2 = again.status === 200 ? (((JSON.parse(again.text) as { link?: string }).link ?? "").split("/invite/")[1] ?? "") : "";
    await http(artistJar, "POST", "/api/roster-link", undefined, { token: token2 });
    check("re-linking works", (await prisma.artist.findUnique({ where: { id: mine.id }, select: { linkedUserId: true } }))?.linkedUserId === artistUser.id);
    const labelEnds = await http(ownerJar, "DELETE", `/api/admin/roster/${mine.id}/link`);
    check("the label can end it too", labelEnds.status === 200, String(labelEnds.status));
    check("and access goes", !(await http(artistJar, "GET", "/admin")).text.includes(`Mine ${RUN}`));

    console.log("\n9. A link is not a login");
    check("the roster row still has no in-org login", (await prisma.artist.findUnique({ where: { id: mine.id }, select: { userId: true } }))?.userId === null);
    check("the artist's account stays in their own org", (await prisma.user.findUnique({ where: { id: artistUser.id }, select: { organizationId: true } }))?.organizationId === own.id);
  } finally {
    await prisma.release.deleteMany({ where: { slug: { contains: RUN } } });
    await prisma.artist.deleteMany({ where: { OR: [{ organizationId: label.id }, { organizationId: own.id }] } });
    await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: RUN } } });
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
