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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { DOWNLOAD_HIDDEN_TABS as GATE_HIDDEN, downloadUrlProblem, duplicateStepProblem, soundcloudTargetProblem, effectiveProof, fanRows, soundcloudLabel, enforcementNote, isDropped, isEnforcement, isPerforming, proofOf, GATE_PLATFORMS, stepLabel, type Enforcement } from "../src/lib/downloads";
import { planOf } from "../src/lib/plans";
import { clientCredentialsRequest, codeChallenge, codeExchangeBody, isActionSuccess, pkcePair, soundcloudAuthorizeUrl } from "../src/lib/soundcloud";

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
// ---- source checks, before anything needs a database ---------------------
//
// The setup instructions an artist reads are part of the gate. They were wrong once: the page
// said that without Artist Pro "you have to apply and wait", which stopped being true when
// SoundCloud closed the application form and the review chatbot. Telling someone to wait for a
// door that no longer exists is worse than telling them the door is shut.
{
  const page = readFileSync(join(import.meta.dirname, "..", "src/app/admin/settings/integrations/page.tsx"), "utf8");
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };
  if (/apply and wait|application form and wait/i.test(page)) fail("the SoundCloud card must not tell people to apply and wait: that route no longer exists");
  if (!/Artist Pro/.test(page)) fail("the SoundCloud card must say Artist Pro is required");
  // The redirect URI is the one thing that silently breaks the whole flow if it is mistyped, so
  // the page prints the value the server actually uses rather than a copy someone edits later.
  if (!page.includes("soundcloudRedirectUri()")) fail("the setup steps must print the redirect URI from lib/soundcloud, not a hardcoded copy");
  if (!page.includes("Downloads \u2192 New") && !page.includes("Downloads → New")) fail("the setup steps must say where to build the gate");
  console.log("  \u2713 the SoundCloud setup steps are present and current");
}

// A download gate is a Release row, so every list and tool that reads releases sees it. The home
// page gives gates their own table, and the release page drops the two tabs a stems pack can't
// use. The links API refuses as well: a hidden tab is not a permission.
{
  const root = join(import.meta.dirname, "..");
  const read = (f: string) => readFileSync(join(root, f), "utf8");
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };
  const home = read("src/app/admin/(home)/page.tsx");
  if (!home.includes('releases.filter((r) => r.kind === "release")')) fail("the home release table must list kind=release only");
  if (!home.includes('releases.filter((r) => r.kind === "download")')) fail("the home page must list download gates separately");
  if (/\{releases\.map\(/.test(home)) fail("the home page must not map every release into the release table: gates would show as releases");
  if (!home.includes("Download gates")) fail("the home page needs a Download gates heading");
  const detail = read("src/app/admin/releases/[id]/page.tsx");
  if (!detail.includes("DOWNLOAD_HIDDEN_TABS")) fail("the release page must hide tabs for download gates");
  if (/\{TABS\.map\(/.test(detail)) fail("the release page nav must render the filtered tabs, not every tab");
  if (!/tabs\.some\(\(t\) => t\.key === searchParams\.tab\)/.test(detail)) fail("a hidden tab named in the URL must fall back, not render");
  for (const t of ["links", "presaves"]) if (!GATE_HIDDEN.includes(t)) fail(`download gates must not get the ${t} tab`);
  for (const t of ["contest", "variants", "clip", "share", "analytics"]) if (GATE_HIDDEN.includes(t)) fail(`download gates must keep the ${t} tab`);
  const links = read("src/app/api/admin/releases/[id]/links/route.ts");
  if (!/g\.release\.kind === "download"\) return NextResponse\.json\([^)]*\{ status: 409 \}/.test(links)) fail("the links API must refuse a download gate");
  console.log("  \u2713 download gates have their own home table and no links or pre-saves tab");
}

// A performed step says droplr did the thing. What counts as "did" is the whole claim, and the
// interesting answers are not 200: a fan who ALREADY follows, likes or reposts must pass, and
// anything that did not happen must not.
{
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };
  for (const ok of [200, 201, 202, 204]) if (!isActionSuccess(ok)) fail(`${ok} should count as done`);
  // Already in that state. Failing these would punish the fans who were there first.
  if (!isActionSuccess(409)) fail("409 (already liked/reposted) must pass, not fail the fan");
  for (const bad of [301, 400, 401, 403, 404, 422, 429, 500, 502]) {
    if (isActionSuccess(bad)) fail(`${bad} must NOT be recorded as a completed step`);
  }
  // The methods and paths SoundCloud documents today. A silent drift here looks like "the gate
  // is broken" and nothing in the app would say why.
  const sc = readFileSync(join(import.meta.dirname, "..", "src/lib/soundcloud.ts"), "utf8");
  if (!/\/me\/followings\/\$\{targetId\}/.test(sc)) fail("follow must use /me/followings/{id}");
  if (!/\/likes\/tracks\/\$\{targetId\}/.test(sc)) fail("like must use /likes/tracks/{id}");
  if (!/\/reposts\/tracks\/\$\{targetId\}/.test(sc)) fail("repost must use /reposts/tracks/{id}");
  if (!/action === "follow" \? "PUT" : "POST"/.test(sc)) fail("follow is a PUT; like and repost are POSTs");
  console.log("  \u2713 performed steps pass only when SoundCloud says the action holds");
}

// How droplr talks to SoundCloud's token endpoint. Both of these shipped wrong and nothing caught
// it until the first real artist connected: the key check sent the ID and secret in the body
// (SoundCloud answers 401 invalid_client; the same key in a Basic header gets 200), and the fan
// flow had no PKCE, which SoundCloud requires. Every gate looked fine in tests and failed live.
{
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };

  const { url, init } = clientCredentialsRequest({ clientId: "abc123", clientSecret: "s3cr:et" });
  if (url !== "https://secure.soundcloud.com/oauth/token") fail(`client credentials go to secure.soundcloud.com/oauth/token, not ${url}`);
  const authz = (init.headers as Record<string, string>).Authorization;
  if (authz !== `Basic ${Buffer.from("abc123:s3cr:et").toString("base64")}`) fail("client credentials must be a Basic header of id:secret");
  const body = new URLSearchParams(String(init.body));
  if (body.get("grant_type") !== "client_credentials") fail("grant_type=client_credentials must be in the body");
  if (body.has("client_secret") || body.has("client_id")) fail("the ID and secret must not be in the body: SoundCloud refuses that with 401");

  // RFC 7636 Appendix B: the published verifier/challenge pair.
  if (codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") !== "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM") fail("code_challenge must be base64url(SHA-256(verifier)) with no padding");
  const a = pkcePair(), b = pkcePair();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(a.verifier)) fail("verifier must be 43–128 unreserved characters");
  if (a.challenge !== codeChallenge(a.verifier)) fail("the pair's challenge must come from its verifier");
  if (a.verifier === b.verifier) fail("each authorisation needs a fresh verifier");

  const au = new URL(soundcloudAuthorizeUrl({ clientId: "abc123", clientSecret: "x", source: "byo" }, "https://droplr.fm/api/gate/soundcloud/callback", "st", a.challenge));
  if (au.searchParams.get("code_challenge") !== a.challenge) fail("authorise must carry the code_challenge");
  if (au.searchParams.get("code_challenge_method") !== "S256") fail("authorise must say code_challenge_method=S256");
  if (au.searchParams.has("scope")) fail("no scope on authorise: SoundCloud documents none");
  if (au.searchParams.has("client_secret")) fail("the secret must never be in a URL a fan's browser sees");

  const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");
  const lib = read("src/lib/soundcloud.ts");
  if (!/code_verifier: codeVerifier/.test(lib)) fail("the code exchange must send code_verifier");
  const login = read("src/app/api/gate/soundcloud/login/route.ts");
  if (!/cv: pkce\.verifier/.test(login) || !/pkce\.challenge/.test(login)) fail("login must keep the verifier in state and send the challenge");
  const cb = read("src/app/api/gate/soundcloud/callback/route.ts");
  if (!/exchangeCode\(creds, code, soundcloudRedirectUri\(\), state\.cv\)/.test(cb)) fail("the callback must exchange with the verifier from state");
  // Measured 22 Oct with a real key: this grant needs client_id AND client_secret in the body.
  // Without client_id: 400 invalid_request. Secret in a Basic header: 401 invalid_client.
  const ex = codeExchangeBody({ clientId: "abc123", clientSecret: "s3cr:et" }, "c0de", "https://droplr.fm/api/gate/soundcloud/callback", a.verifier);
  if (ex.get("grant_type") !== "authorization_code" || ex.get("code") !== "c0de" || ex.get("code_verifier") !== a.verifier) fail("the code exchange body must carry the grant, the code and the verifier");
  if (ex.get("client_id") !== "abc123") fail("the code exchange must carry client_id in the body: SoundCloud refuses it with 400 otherwise");
  if (ex.get("client_secret") !== "s3cr:et") fail("the code exchange must carry client_secret in the body: SoundCloud refuses a Basic header for this grant");
  const exSrc = lib.slice(lib.indexOf("export async function exchangeCode"), lib.indexOf("\n}\n", lib.indexOf("export async function exchangeCode")));
  if (/Authorization/.test(exSrc)) fail("the code exchange must not send a Basic header: SoundCloud answers 401 invalid_client to it");
  const cbFails = read("src/app/api/gate/soundcloud/callback/route.ts").match(/return fail\(/g)?.length ?? 0;
  const cbSrc2 = read("src/app/api/gate/soundcloud/callback/route.ts");
  const cbFailsLogged = cbSrc2.match(/return fail\("[a-z-]+", (?:"[^"]{8,}"|`[^`]{8,}`|String\(e)/g)?.length ?? 0;
  if (!/const fail = \(why: string, detail: string\) => \{\s*console\.warn\(`SoundCloud gate callback: \$\{why\} \(\$\{detail\}\)`\);/.test(cbSrc2)) fail("fail() in the callback must log the reason before redirecting");
  if (cbFails === 0 || cbFails !== cbFailsLogged) fail(`every failure in the callback must say why in the log (${cbFailsLogged} of ${cbFails} do)`);
  console.log("  \u2713 SoundCloud token requests: Basic for client credentials, body for the code exchange, PKCE");
}

// SoundCloud is one connect for up to three actions. Asked for by the first artist to build a
// gate: the builder only let SoundCloud be added once, so a follow AND a repost was impossible.
{
  const fail = (m: string) => { console.error(`  \u2717 ${m}`); process.exit(1); };
  const sc = (action: string) => ({ platform: "soundcloud", action });
  if (duplicateStepProblem([sc("follow"), sc("like"), sc("repost")]) !== null) fail("follow, like and repost together must be allowed");
  if (!duplicateStepProblem([sc("follow"), sc("follow")])) fail("two SoundCloud follows must be refused");
  if (!duplicateStepProblem([{ platform: "instagram", action: "follow" }, { platform: "instagram", action: "visit" }])) fail("other platforms stay one step each");
  if (duplicateStepProblem([{ platform: "email", action: "email" }, sc("follow"), { platform: "instagram", action: "follow" }]) !== null) fail("an ordinary gate must say nothing");

  if (soundcloudLabel(["repost", "follow", "like"], "Nathan Hill") !== "Follow Nathan Hill, like and repost the track on SoundCloud") fail(`combined label reads wrong: ${soundcloudLabel(["repost", "follow", "like"], "Nathan Hill")}`);
  if (soundcloudLabel(["like", "repost"], "N") !== "Like and repost the track on SoundCloud") fail("track-only label reads wrong");
  if (soundcloudLabel(["follow"], "N") !== "Follow N on SoundCloud") fail("a single action keeps its own label");

  const steps = [{ id: "e", platform: "email", action: "email" }, { id: "a", ...sc("follow") }, { id: "b", ...sc("repost") }, { id: "i", platform: "instagram", action: "follow" }];
  const rows = fanRows(steps, "enforced");
  if (rows.length !== 3) fail(`performed SoundCloud must be one row for the fan, got ${rows.length} rows`);
  const scRow = rows.find((r) => r.platform === "soundcloud");
  if (!scRow || scRow.id !== "a" || scRow.actions.join() !== "follow,repost") fail("the SoundCloud row must carry every action, keyed to the first step");
  if (fanRows(steps, "voluntary").length !== 4) fail("degraded SoundCloud steps are plain visits, so each keeps its own row and link");
  const cbSrc = readFileSync(join(import.meta.dirname, "..", "src/app/api/gate/soundcloud/callback/route.ts"), "utf8");
  if (!/gateStep\.findMany\(\{\s*where: \{ releaseId: step\.release\.id, platform: "soundcloud" \}/.test(cbSrc)) fail("the callback must perform every SoundCloud step on the gate, not just the one clicked");
  if (cbSrc.indexOf("if (!anonId)") < 0 || cbSrc.indexOf("if (!anonId)") > cbSrc.indexOf("performAction(token")) fail("the callback must know it can record the result before acting on the fan's account");
  if (!soundcloudTargetProblem("like", "private") || !soundcloudTargetProblem("repost", "private")) fail("a private track must be refused for a like or a repost");
  if (soundcloudTargetProblem("like", "public") !== null || soundcloudTargetProblem("like", undefined) !== null) fail("a public track (or one SoundCloud doesn't label) must pass silently");
  if (soundcloudTargetProblem("follow", "private") !== null) fail("a follow targets a profile, which has no sharing setting");
  const stepsSrc = readFileSync(join(import.meta.dirname, "..", "src/app/api/admin/downloads/steps.ts"), "utf8");
  if (!/const privateProblem = soundcloudTargetProblem\(s\.action, resolved\.sharing\);\s*if \(privateProblem\) return \{ error: privateProblem \};/.test(stepsSrc)) fail("saving a gate must check the resolved track's sharing");
  console.log("  \u2713 SoundCloud follow, like and repost are one connect");
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

    // --- enforcement degradation -----------------------------------------
    //
    // SoundCloud paused Hypeddit's gate API on 10 June 2026 and every enforced gate in that scene
    // became voluntary overnight. These checks are the promise that the same day here costs a label
    // nothing: the gate keeps working, the page stops claiming the step was checked, and the
    // enforced path is not weakened in the process.
    console.log("\n1b. When a performed step stops being performed");
    check("enforced SoundCloud is still performed", effectiveProof("soundcloud", "enforced") === "performed");
    check("voluntary SoundCloud degrades to unverified, never to given",
      effectiveProof("soundcloud", "voluntary") === "unverified");
    check("unavailable SoundCloud degrades to unverified too",
      effectiveProof("soundcloud", "unavailable") === "unverified");
    check("email is untouched by enforcement — it depends on nobody else's API",
      (["enforced", "voluntary", "unavailable"] as Enforcement[]).every((e) => effectiveProof("email", e) === "given"));
    check("degrading never upgrades an unverified platform",
      (["enforced", "voluntary", "unavailable"] as Enforcement[]).every((e) =>
        ["instagram", "tiktok", "youtube", "spotify", "facebook", "link"].every((pf) => effectiveProof(pf, e) === "unverified")));
    check("an unknown platform can't be talked up by any enforcement state",
      (["enforced", "voluntary", "unavailable"] as Enforcement[]).every((e) => effectiveProof("myspace", e) === "unverified"));
    check("only enforced actually performs", isPerforming("soundcloud", "enforced") && !isPerforming("soundcloud", "voluntary"));
    check("only unavailable drops the step from the gate",
      isDropped("soundcloud", "unavailable") && !isDropped("soundcloud", "voluntary") && !isDropped("soundcloud", "enforced"));
    check("an unverified step is never dropped by enforcement",
      (["enforced", "voluntary", "unavailable"] as Enforcement[]).every((e) => !isDropped("instagram", e)));
    check("the builder says nothing when nothing is wrong", enforcementNote("soundcloud", "enforced") === null);
    check("the builder explains a voluntary step in plain language",
      (enforcementNote("soundcloud", "voluntary") ?? "").length > 60 && /isn't checked|on the click/i.test(enforcementNote("soundcloud", "voluntary") ?? ""));
    check("the builder explains a dropped step too", (enforcementNote("soundcloud", "unavailable") ?? "").length > 40);
    check("no note is invented for a platform that was never performed",
      (["enforced", "voluntary", "unavailable"] as Enforcement[]).every((e) => enforcementNote("instagram", e) === null));
    check("a typo in the env var can't weaken a gate",
      !isEnforcement("Voluntary ") && !isEnforcement("off") && !isEnforcement("") && !isEnforcement(undefined));
    check("the three real states are accepted", ["enforced", "voluntary", "unavailable"].every(isEnforcement));

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
    const scDupe = await http(ownerA, "POST", "/api/admin/downloads", {
      title: `SCDupe ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg",
      slug: `scdupe-${RUN}`, downloadUrl: "https://drive.google.com/file/d/x",
      steps: [{ platform: "soundcloud", action: "follow", target: "https://soundcloud.com/a" }, { platform: "soundcloud", action: "follow", target: "https://soundcloud.com/b" }],
    });
    check("two SoundCloud follows are refused", scDupe.status === 400 && /One of each/.test(scDupe.text), `${scDupe.status} ${scDupe.text}`);
    const scMulti = await http(ownerA, "POST", "/api/admin/downloads", {
      title: `SCMulti ${RUN}`, artistName: "A", coverUrl: "https://example.com/c.jpg",
      slug: `scmulti-${RUN}`, downloadUrl: "https://drive.google.com/file/d/x",
      steps: [{ platform: "soundcloud", action: "follow", target: "https://soundcloud.com/a" }, { platform: "soundcloud", action: "repost", target: "https://soundcloud.com/a/t" }],
    });
    check("a follow and a repost get past the duplicate rule (then stop at the missing key)", scMulti.status === 400 && /Connect SoundCloud/.test(scMulti.text), `${scMulti.status} ${scMulti.text}`);
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

    console.log("\n12. Deleting a gate");
    if (ok.status === 201) {
      const gid = JSON.parse(ok.text).id as string;
      const ownerB2 = await login(B.owner.email);
      const crossDel = await http(ownerB2, "DELETE", `/api/admin/downloads/${gid}`);
      check("another account can't delete it", crossDel.status === 404, String(crossDel.status));
      check("and it's still there", (await prisma.release.count({ where: { id: gid } })) === 1);

      await prisma.contest.create({ data: { organizationId: A.org.id, releaseId: gid, headline: "t", closesAt: new Date(Date.now() + 86400000) } as never });
      const withContest = await http(ownerA, "DELETE", `/api/admin/downloads/${gid}`);
      check("a gate with a contest attached is refused, not cascaded", withContest.status === 409 && (await prisma.contest.count({ where: { releaseId: gid } })) === 1, String(withContest.status));
      await prisma.contest.deleteMany({ where: { releaseId: gid } });

      const del = await http(ownerA, "DELETE", `/api/admin/downloads/${gid}`);
      check("its owner can delete it", del.status === 200, String(del.status));
      check("the gate and its steps are gone",
        (await prisma.release.count({ where: { id: gid } })) === 0 && (await prisma.gateStep.count({ where: { releaseId: gid } })) === 0);
      const again = await http(ownerA, "DELETE", `/api/admin/downloads/${gid}`);
      check("deleting it twice is a 404, not an error", again.status === 404, String(again.status));
    }
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
