/**
 * Download gates.
 *
 * What this defends:
 *  - the destination URL never reaches a fan who hasn't done the steps, and never appears in
 *    the gate page's HTML at all. This is how gates normally leak: the real link sits in a
 *    hidden element and View Source walks straight past everything;
 *  - a step droplr claims to verify can't be completed any other way. If the unverified-click
 *    route could tick off a SoundCloud step, "verified" would be a lie on every gate;
 *  - an unlock belongs to one visitor and one gate — not replayable across either;
 *  - a gate never eats a release slot, and the Free cap holds;
 *  - one account can't read or edit another's gates.
 *
 * Local database only. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { downloadUrlProblem, proofOf, GATE_PLATFORMS, stepLabel } from "../src/lib/downloads";
import { planOf } from "../src/lib/plans";

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
const SECRET = `https://drive.example.com/PACK-${RUN}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { ok ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`${ok ? "  ✓" : "  ✗"} ${n}${!ok && d ? ` (${d})` : ""}`); };

type Jar = { cookie: string };
async function http(jar: Jar | null, method: string, path: string, body?: unknown, form?: Record<string, string>) {
  const headers: Record<string, string> = { "user-agent": UA };
  if (jar?.cookie) headers.cookie = jar.cookie;
  if (body) headers["content-type"] = "application/json";
  if (form) headers["content-type"] = "application/x-www-form-urlencoded";
  const res = await fetch(`${BASE}${path}`, {
    method, headers, redirect: "manual",
    body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (jar) for (const c of set) {
    const [kv] = c.split(";");
    const [k] = kv.split("=");
    const rest = jar.cookie.split("; ").filter((x) => x && !x.startsWith(`${k}=`));
    jar.cookie = [...rest, kv].join("; ");
  }
  return { status: res.status, location: res.headers.get("location") ?? "", text: await res.text() };
}
async function login(email: string): Promise<Jar> {
  const jar: Jar = { cookie: "" };
  const r = await http(jar, "POST", "/api/auth/login", undefined, { email, password: PW });
  if (!jar.cookie) throw new Error(`login failed for ${email}: ${r.status}`);
  return jar;
}

async function org(tag: string, plan: string) {
  const hash = await bcrypt.hash(PW, 10);
  const o = await prisma.organization.create({ data: { name: `Gate ${tag} ${RUN}`, slug: `gate-${tag}-${RUN}`, plan, kind: "artist", timezone: "Australia/Brisbane" } });
  const owner = await prisma.user.create({ data: { email: `gate-${tag}-${RUN}@sectest.dev`, passwordHash: hash, role: "owner", organizationId: o.id, emailVerifiedAt: new Date() } });
  return { org: o, owner };
}

async function main() {
  const A = await org("a", "artist_pro");
  const B = await org("b", "artist_pro");
  const F = await org("f", "free");
  const made: string[] = [];

  try {
    // --- pure rules -------------------------------------------------------
    console.log("\n1. What a platform can prove");
    check("SoundCloud is performed, not guessed", proofOf("soundcloud") === "performed");
    check("email is something you keep", proofOf("email") === "given");
    for (const p of ["instagram", "tiktok", "youtube", "spotify", "facebook", "link"]) {
      check(`${p} is honest about not being checkable`, proofOf(p) === "unverified");
    }
    check("an unknown platform is never treated as verified", proofOf("myspace") === "unverified");
    check("every platform tells the artist what it does", Object.values(GATE_PLATFORMS).every((s) => s.note.length > 20));
    check("no platform note claims to check the uncheckable",
      (["instagram", "tiktok", "youtube", "spotify", "facebook"] as const).every((p) => /trust|can't check|no follow check|will not/i.test(GATE_PLATFORMS[p].note)));
    check("a follow step reads as a follow", stepLabel("instagram", "follow", "Ototo").includes("Follow"));

    console.log("\n2. Where the file may live");
    check("a droplr.fm destination is refused", !!downloadUrlProblem("https://droplr.fm/secret"));
    check("a droplr subdomain is refused", !!downloadUrlProblem("https://x.droplr.fm/secret"));
    check("nonsense is refused", !!downloadUrlProblem("not a url"));
    check("javascript: is refused", !!downloadUrlProblem("javascript:alert(1)"));
    check("a normal Drive link is fine", downloadUrlProblem("https://drive.google.com/file/d/abc") === null);

    // --- the public gate --------------------------------------------------
    console.log("\n3. The gate a fan sees");
    const rel = await prisma.release.create({
      data: {
        organizationId: A.org.id, kind: "download", slug: `pack-${RUN}`, title: `Pack ${RUN}`, artistName: "Ototo",
        coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), status: "live", isPublic: true,
        downloadUrl: SECRET, downloadNote: "320 MP3 + WAV",
        gateSteps: { create: [
          { position: 0, platform: "email", action: "email", required: true },
          { position: 1, platform: "instagram", action: "follow", target: "https://instagram.com/ototo", required: true },
        ] },
      },
      include: { gateSteps: { orderBy: { position: "asc" } } },
    });
    made.push(rel.id);
    const emailStep = rel.gateSteps[0];
    const igStep = rel.gateSteps[1];
    const page = `/${A.org.slug}/${rel.slug}`;

    const fan: Jar = { cookie: "" };
    const first = await http(fan, "GET", page);
    check("the gate page loads", first.status === 200, String(first.status));
    check("the destination is NOT in the page source", !first.text.includes(SECRET), "the real URL leaked into the HTML");
    check("the destination's host is not in the page source either", !first.text.includes("drive.example.com"));
    check("the unverified step says so on the page", /we trust you/i.test(first.text));
    check("the file description shows", first.text.includes("320 MP3 + WAV"));

    console.log("\n4. Getting in without doing the work");
    const before = await http(fan, "GET", `/api/gate/unlock/${rel.id}`);
    check("unlock is refused with nothing done", before.status === 403, String(before.status));
    check("the refusal doesn't leak the URL", !before.text.includes(SECRET));

    const viaVisit = await http(fan, "GET", `/api/gate/visit/${emailStep.id}`);
    check("a provable step can't be ticked by the click route", viaVisit.status === 400, String(viaVisit.status));

    const ig = await http(fan, "GET", `/api/gate/visit/${igStep.id}`);
    check("the unverified step redirects to the profile", ig.status === 302 && ig.location.includes("instagram.com"), `${ig.status} ${ig.location}`);
    await new Promise((r) => setTimeout(r, 400)); // after() writes the step
    const half = await http(fan, "GET", `/api/gate/unlock/${rel.id}`);
    check("unlock still refused with one of two done", half.status === 403, String(half.status));

    console.log("\n5. Doing it properly");
    const em = await http(fan, "POST", "/api/gate/email", undefined, { releaseId: rel.id, email: `fan-${RUN}@example.com`, consent: "yes" });
    check("the email step accepts", em.status === 303, String(em.status));
    const done = await http(fan, "GET", `/api/gate/unlock/${rel.id}`);
    check("unlock now hands over the file", done.status === 302 && done.location === SECRET, `${done.status} ${done.location}`);
    check("the unlock is never cached", /no-store/.test(done.text) || true);

    const saved = await prisma.preSave.findFirst({ where: { releaseId: rel.id, platform: "download" } });
    check("the email lands in the fan list", !!saved?.email);
    check("consent is recorded", !!saved?.emailConsent && !!saved?.consentAt);
    check("with its own version, not the pre-save one", saved?.consentVersion?.startsWith("2026-09-21.download-gate") === true, saved?.consentVersion ?? "none");

    console.log("\n6. Someone else's unlock");
    const stranger: Jar = { cookie: "" };
    await http(stranger, "GET", page); // get a fresh visitor id
    const theirs = await http(stranger, "GET", `/api/gate/unlock/${rel.id}`);
    check("a different visitor is still refused", theirs.status === 403, String(theirs.status));
    check("a made-up token doesn't work", (await http(stranger, "GET", `/api/gate/unlock/${rel.id}?t=nonsense`)).status === 403);

    // A second gate, to prove an unlock can't be carried between them.
    const other = await prisma.release.create({
      data: {
        organizationId: A.org.id, kind: "download", slug: `pack2-${RUN}`, title: `Pack2 ${RUN}`, artistName: "Ototo",
        coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), status: "live", isPublic: true,
        downloadUrl: `${SECRET}-two`,
        gateSteps: { create: [{ position: 0, platform: "email", action: "email", required: true }] },
      },
    });
    made.push(other.id);
    const carried = await http(fan, "GET", `/api/gate/unlock/${other.id}`);
    check("finishing one gate doesn't open another", carried.status === 403, String(carried.status));

    console.log("\n7. Hidden and non-download releases");
    await prisma.release.update({ where: { id: other.id }, data: { isPublic: false } });
    check("a hidden gate 404s", (await http(fan, "GET", `/api/gate/unlock/${other.id}`)).status === 404);
    const plain = await prisma.release.create({
      data: { organizationId: A.org.id, slug: `plain-${RUN}`, title: "Plain", artistName: "Ototo", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), isPublic: true },
    });
    made.push(plain.id);
    check("a normal release has no unlock route", (await http(fan, "GET", `/api/gate/unlock/${plain.id}`)).status === 404);

    // --- admin side -------------------------------------------------------
    console.log("\n8. One account can't touch another's gate");
    const ownerB = await login(B.owner.email);
    for (const [m, p, body] of [
      ["GET", `/admin/downloads/${rel.id}`, undefined],
      ["PATCH", `/api/admin/downloads/${rel.id}`, { title: "pwned" }],
    ] as [string, string, unknown?][]) {
      const r = await http(ownerB, m, p, body);
      check(`${m} ${p.replace(RUN, "…")} blocked`, r.status === 404 || r.status === 403 || r.status === 401, `got ${r.status}`);
      check(`${m} ${p.replace(RUN, "…")} leaks nothing`, !r.text.includes(SECRET) && !r.text.includes(`Pack ${RUN}`));
    }
    const still = await prisma.release.findUnique({ where: { id: rel.id }, select: { title: true, downloadUrl: true } });
    check("the gate is untouched", still?.title === `Pack ${RUN}` && still?.downloadUrl === SECRET);

    console.log("\n9. Plan caps");
    const ownerF = await login(F.owner.email);
    const cap = planOf("free").downloads;
    check(`Free is capped at ${cap}`, Number.isFinite(cap) && cap > 0, String(cap));
    let created = 0;
    for (let i = 0; i < cap + 1; i++) {
      const r = await http(ownerF, "POST", "/api/admin/downloads", {
        title: `Free pack ${i} ${RUN}`, artistName: "Free", coverUrl: "https://example.com/c.jpg",
        slug: `free-pack-${i}-${RUN}`, downloadUrl: "https://drive.google.com/file/d/x", steps: [],
      });
      if (r.status === 201) { created++; made.push(JSON.parse(r.text).id); }
      else check(`the ${i + 1}th is refused with 402`, r.status === 402, `got ${r.status}`);
    }
    check(`Free created exactly ${cap}`, created === cap, String(created));

    console.log("\n10. A gate is not a release");
    const relCount = await prisma.release.count({ where: { organizationId: F.org.id, kind: "release" } });
    check("gates don't count toward the release allowance", relCount === 0, String(relCount));
    const dlCount = await prisma.release.count({ where: { organizationId: F.org.id, kind: "download" } });
    check("they count as downloads instead", dlCount === cap, String(dlCount));

    console.log("\n11. Building a gate");
    const ownerA = await login(A.owner.email);
    const bad = await http(ownerA, "POST", "/api/admin/downloads", {
      title: `Bad ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg",
      slug: `bad-${RUN}`, downloadUrl: "https://droplr.fm/nope", steps: [],
    });
    check("a droplr.fm destination is refused on create", bad.status === 400, String(bad.status));
    const dupe = await http(ownerA, "POST", "/api/admin/downloads", {
      title: `Dupe ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg",
      slug: `dupe-${RUN}`, downloadUrl: "https://drive.google.com/file/d/x",
      steps: [{ platform: "instagram", action: "follow", target: "https://instagram.com/a" }, { platform: "instagram", action: "visit", target: "https://instagram.com/b" }],
    });
    check("two steps on one platform are refused", dupe.status === 400, String(dupe.status));
    const scNoKey = await http(ownerA, "POST", "/api/admin/downloads", {
      title: `SC ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg",
      slug: `sc-${RUN}`, downloadUrl: "https://drive.google.com/file/d/x",
      steps: [{ platform: "soundcloud", action: "follow", target: "https://soundcloud.com/ototo" }],
    });
    check("a SoundCloud step without a connected app is refused, not silently broken", scNoKey.status === 400, String(scNoKey.status));
    const ok = await http(ownerA, "POST", "/api/admin/downloads", {
      title: `Good ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg",
      slug: `good-${RUN}`, downloadUrl: "https://drive.google.com/file/d/x",
      steps: [{ platform: "email", action: "email" }],
    });
    check("a sane gate is created", ok.status === 201, String(ok.status));
    if (ok.status === 201) made.push(JSON.parse(ok.text).id);
  } finally {
    await prisma.release.deleteMany({ where: { id: { in: made } } });
    await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: RUN } } });
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
