/**
 * The SoundCloud comment step on a download gate.
 *
 * What this defends:
 *  - the comment is the fan's own words, typed on the gate, never the artist's (SoundCloud's API
 *    Terms allow comments only when "specifically and deliberately initiated by the user");
 *  - an authorise link someone else started can't post anything. The first version carried the
 *    words in the OAuth state, and anyone could mint a state with their own words and post the
 *    link: every fan who approved would comment for them. Now the words sit in an HTTP-only
 *    cookie on droplr.fm set by the fan's own POST, and the state carries only a nonce's hash;
 *  - only droplr.fm's own page can start the POST (Origin). Not a custom domain, even the
 *    account's own: its owner controls what it serves, so a page there could submit their words;
 *  - sets and uncommentable tracks are refused when the gate is saved, and checked again with the
 *    fan's token before anything happens;
 *  - the comment goes last, because it's the only action a retry repeats;
 *  - the words never appear in a URL, the page or a log line.
 *
 * Needs Postgres and a running server, like test-gate. Local database only. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { encrypt, decrypt } from "../src/lib/crypto";
import {
  GATE_PLATFORMS, SC_COMMENT_MAX, SC_COMMENT_SET_PROBLEM, SOUNDCLOUD_ACTION_ORDER, cleanScComment, duplicateStepProblem,
  fanRows, soundcloudGroupOf, soundcloudLabel, soundcloudTargetProblem, stepLabel,
} from "../src/lib/gate-steps";
import { commentRequest, decodeScTarget } from "../src/lib/soundcloud";
import { SCC_COOKIE_PREFIX, commentOriginAllowed, openComment, packContext, sccCookieName, sealComment, servedOnSite, unpackContext } from "../src/lib/sc-comment";
import { unpackState } from "../src/lib/oauth";

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
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8888").replace(/\/$/, "");
const RUN = randomBytes(3).toString("hex");
const WORDS = `This one is unreal ${RUN}`;

let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { ok ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`${ok ? "  ✓" : "  ✗"} ${n}${!ok && d ? ` (${d})` : ""}`); };
const src = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");

async function req(method: string, path: string, opts: { origin?: string | null; cookie?: string; form?: Record<string, string>; host?: string } = {}) {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (test-sc-comment)" };
  if (opts.host) headers["x-forwarded-host"] = opts.host;
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.form) headers["content-type"] = "application/x-www-form-urlencoded";
  const res = await fetch(`${BASE}${path}`, { method, headers, redirect: "manual", body: opts.form ? new URLSearchParams(opts.form).toString() : undefined });
  return { status: res.status, location: res.headers.get("location") ?? "", setCookie: res.headers.getSetCookie?.() ?? [], text: await res.text() };
}
const notice = (loc: string) => { try { return new URL(loc).searchParams.get("notice") ?? new URL(loc).searchParams.get("done"); } catch { return null; } };
const sccOf = (set: string[]) => set.find((c) => c.startsWith(SCC_COOKIE_PREFIX));

async function main() {
  // ---- 1. pure rules ----------------------------------------------------------
  console.log("\n1. The step itself");
  check("SoundCloud offers a comment", GATE_PLATFORMS.soundcloud.actions.includes("comment"));
  check("the comment goes last: it's the only action a retry repeats", SOUNDCLOUD_ACTION_ORDER[SOUNDCLOUD_ACTION_ORDER.length - 1] === "comment");
  check("follow, like, repost and comment together are allowed", duplicateStepProblem(["follow", "like", "repost", "comment"].map((action) => ({ platform: "soundcloud", action }))) === null);
  check("two comment steps are refused", !!duplicateStepProblem([{ platform: "soundcloud", action: "comment" }, { platform: "soundcloud", action: "comment" }]));
  check("all four read as one sentence", soundcloudLabel(["comment", "follow", "repost", "like"], "N") === "Follow N, like, repost and comment on the track on SoundCloud", soundcloudLabel(["comment", "follow", "repost", "like"], "N"));
  check("a comment alone reads right", soundcloudLabel(["comment"], "N") === "Comment on the track on SoundCloud", soundcloudLabel(["comment"], "N"));
  check("follow and comment read right", soundcloudLabel(["follow", "comment"], "N") === "Follow N, comment on the track on SoundCloud", soundcloudLabel(["follow", "comment"], "N"));
  check("the existing labels didn't change", soundcloudLabel(["repost", "follow", "like"], "Nathan Hill") === "Follow Nathan Hill, like and repost the track on SoundCloud" && soundcloudLabel(["like", "repost"], "N") === "Like and repost the track on SoundCloud");
  check("a degraded comment step reads as a comment", stepLabel("soundcloud", "comment", "N") === "Comment on the track on SoundCloud");
  const rows = fanRows([{ id: "f", platform: "soundcloud", action: "follow" }, { id: "c", platform: "soundcloud", action: "comment" }], "enforced");
  check("the comment rides the one SoundCloud connect", rows.length === 1 && rows[0].actions.join() === "follow,comment");
  const g = soundcloudGroupOf([{ platform: "soundcloud", action: "follow", target: "https://soundcloud.com/a" }, { platform: "soundcloud", action: "comment", target: "https://soundcloud.com/a/t" }]);
  check("the card reads a comment's track as the item", g?.item === "https://soundcloud.com/a/t" && g.actions.join() === "follow,comment");

  console.log("\n2. Refused when saving");
  check("a set can't take a comment", soundcloudTargetProblem("comment", "public", "playlist") === SC_COMMENT_SET_PROBLEM);
  check("a track with comments off can't take one", !!soundcloudTargetProblem("comment", "public", "track", false));
  check("a private track can't take one", !!soundcloudTargetProblem("comment", "private", "track", true));
  check("a public, commentable track passes silently", soundcloudTargetProblem("comment", "public", "track", true) === null);
  check("SoundCloud not saying commentable isn't a refusal", soundcloudTargetProblem("comment", "public", "track", undefined) === null);
  check("a like on a set still passes (packs)", soundcloudTargetProblem("like", "public", "playlist", false) === null);
  const steps = src("src/app/api/admin/downloads/steps.ts");
  check("a set link is refused by shape too, so it holds while SoundCloud is paused",
    /if \(s\.action === "comment" && isSoundcloudSetUrl\(parsed\.url\)\) return \{ error: SC_COMMENT_SET_PROBLEM \};/.test(steps) &&
    steps.indexOf("isSoundcloudSetUrl(parsed.url)") < steps.indexOf('soundcloudGateEnforcement() === "enforced"'));

  console.log("\n3. The words");
  check("ordinary words pass through", cleanScComment("  fire  tune \n") === "fire tune");
  check("empty is nothing", cleanScComment("   ") === null && cleanScComment(undefined) === null && cleanScComment(42) === null);
  check("control and bidi characters are dropped", cleanScComment("a\u0000b‮c​d") === "a b c d");
  check(`over ${SC_COMMENT_MAX} characters is refused, not cut`, cleanScComment("x".repeat(SC_COMMENT_MAX + 1)) === null && cleanScComment("x".repeat(SC_COMMENT_MAX)) !== null);
  const req1 = commentRequest("TOK", 123, "hi \"there\"");
  check("the request is SoundCloud's documented shape", req1.url.endsWith("/tracks/123/comments") && req1.init.method === "POST" && JSON.parse(req1.init.body).comment.body === 'hi "there"' && /application\/json/.test(req1.init.headers["Content-Type"]));
  check("the request carries the fan's token, not the app's", req1.init.headers.Authorization === "OAuth TOK");

  console.log("\n4. The binding");
  const s1 = sealComment("rel1", WORDS)!;
  check("sealing gives a cookie and a hash", !!s1 && s1.nh.length === 64 && s1.words === WORDS);
  check("the cookie doesn't carry the words in the clear", !s1.cookie.includes("unreal") && !Buffer.from(s1.cookie, "base64url").toString().includes("unreal"));
  check("the hash isn't the words", !s1.nh.includes(RUN));
  check("the right cookie, release and hash open it", openComment(s1.cookie, "rel1", s1.nh) === WORDS);
  check("another release's state can't", openComment(s1.cookie, "rel2", s1.nh) === null);
  const s2 = sealComment("rel1", "someone else's words")!;
  check("another start's hash can't (a link someone else began)", openComment(s1.cookie, "rel1", s2.nh) === null && openComment(s2.cookie, "rel1", s1.nh) === null);
  check("no hash, no comment", openComment(s1.cookie, "rel1", null) === null);
  check("no cookie, no comment", openComment(undefined, "rel1", s1.nh) === null);
  check("an expired cookie can't", openComment(sealComment("rel1", WORDS, Date.now() - 16 * 60_000)!.cookie, "rel1", s1.nh) === null);
  check("a cookie that isn't ours can't", openComment("garbage", "rel1", s1.nh) === null && openComment(Buffer.from(encrypt(JSON.stringify({ k: "scc", rid: "rel1", n: "x", w: "w", exp: Date.now() + 60_000 }))).toString("base64url"), "rel1", s1.nh) === null);
  check("a context sealed for another purpose can't stand in for a comment", openComment(packContext({ rid: "rel1", anon: "a", ret: SITE }), "rel1", s1.nh) === null);
  const ctx = packContext({ rid: "rel1", anon: "anon-1", ret: `${SITE}/x/y` });
  check("a context opens for its own release", unpackContext(ctx, "rel1")?.anon === "anon-1");
  check("not for another release", unpackContext(ctx, "rel2") === null);
  check("not after it expires", unpackContext(packContext({ rid: "rel1", anon: "a", ret: SITE }, Date.now() - 7 * 3_600_000), "rel1") === null);
  check("a comment cookie can't stand in for a context", unpackContext(s1.cookie, "rel1") === null);
  check("the context hides the visitor id", !ctx.includes("anon-1") && !decrypt(Buffer.from(ctx, "base64url").toString()).includes("rel2"));

  console.log("\n5. Who may start it");
  check("droplr.fm itself", commentOriginAllowed(new URL(SITE).origin));
  check("not a custom domain, not even the account's own", !commentOriginAllowed("https://music.rrr.com"));
  check("not a subdomain", !commentOriginAllowed("https://rrr.droplr.fm") || new URL(SITE).host === "rrr.droplr.fm");
  check("not a lookalike", !commentOriginAllowed(`${new URL(SITE).origin}.evil.example`) && !commentOriginAllowed("https://droplr.fm.evil.example"));
  check("no Origin, or the opaque one, is refused", !commentOriginAllowed(null) && !commentOriginAllowed("null") && !commentOriginAllowed(""));
  check("the page knows when it's on droplr.fm", servedOnSite(new URL(SITE).origin) && !servedOnSite("https://music.rrr.com") && !servedOnSite("garbage"));
  check("one cookie per gate, with a safe name", sccCookieName("ck1-ab_c") === "dfm_scc_ck1abc" && sccCookieName("a") !== sccCookieName("b"));

  console.log("\n6. The routes, read");
  const login = src("src/app/api/gate/soundcloud/login/route.ts");
  const cb = src("src/app/api/gate/soundcloud/callback/route.ts");
  const post = login.slice(login.indexOf("export async function POST"));
  check("the POST checks Origin before it seals or sets anything", post.indexOf("commentOriginAllowed(") > 0 && post.indexOf("commentOriginAllowed(") < post.indexOf("sealComment(") && post.indexOf("commentOriginAllowed(") < post.indexOf("res.cookies.set("));
  check("the state carries the nonce's hash, never the words", /nh: comment\?\.nh \?\? null/.test(post) && !/words/.test(post.slice(post.indexOf("packState("), post.indexOf("packState(") + 400)));
  check("the plain GET refuses a gate with a comment step", /if \(await hasCommentStep\(step\.release\.id\)\) \{\s*return NextResponse\.redirect\(withParam\(back, "notice", "soundcloud-comment-missing"\)/.test(login));
  check("the callback opens the cookie before touching the fan's account", cb.indexOf("openComment(") > 0 && cb.indexOf("openComment(") < cb.indexOf("exchangeCode("));
  check("it checks comments are still on, with the fan's token, before the follow", cb.indexOf("canComment(token") > cb.indexOf("exchangeCode(") && cb.indexOf("canComment(token") < cb.indexOf("performAction(token"));
  check("the comment is posted after everything else", cb.indexOf("postComment(token") > cb.lastIndexOf("performAction(token"));
  check("a comment step is never performed as a follow", /if \(s\.action === "comment"\) continue;/.test(cb) && !/s\.action === "like" \|\| s\.action === "repost" \? s\.action : "follow"/.test(cb));
  check("every way out clears the cookie", /const fail = [\s\S]*?return out\(/.test(cb) && (cb.match(/return NextResponse\.redirect/g) ?? []).length === 0);
  check("a lost cookie says lost, not \"type a comment\"", /return fail\("soundcloud-comment-lost"/.test(cb) && !/return fail\("soundcloud-comment-missing"/.test(cb));
  check("if recording fails after SoundCloud acted, the cookie still goes (no silent second comment)", /try \{\s*await completeStep\([\s\S]*?\} catch \(e\) \{[\s\S]*?return fail\(/.test(cb));
  check("the gate page says what each comment notice means", ["soundcloud-comment-missing", "soundcloud-comment-lost", "soundcloud-comment-closed"].every((k) => src("src/components/public/gate-view.tsx").includes(`"${k}":`)));
  check("joiners survive, so emoji and scripts aren't broken", cleanScComment("🏳️\u200d🌈 می\u200cخواهم") === "🏳️\u200d🌈 می\u200cخواهم");
  check("no log line carries the words", ![login, cb, src("src/lib/soundcloud.ts"), src("src/lib/sc-comment.ts")].some((f) => /console\.(warn|log|error)\([^)]*\bwords\b/.test(f)));

  // ---- 7. against the server ------------------------------------------------------
  console.log("\n7. Against the server");
  const creds = { soundcloudClientIdEncrypted: encrypt(`sc-client-${RUN}`), soundcloudClientSecretEncrypted: encrypt(`sc-secret-${RUN}`), soundcloudAppStatus: "active" };
  const A = await prisma.organization.create({ data: { name: `Scc A ${RUN}`, slug: `scc-a-${RUN}`, plan: "artist_pro", kind: "artist", timezone: "Australia/Brisbane", customDomain: `scc-${RUN}.example.com`, ...creds } });
  const B = await prisma.organization.create({ data: { name: `Scc B ${RUN}`, slug: `scc-b-${RUN}`, plan: "artist", kind: "artist", timezone: "Australia/Brisbane", customDomain: `scc-b-${RUN}.example.com`, ...creds } });
  const orgs = [A.id, B.id];
  try {
    const gate = async (orgId: string, slug: string, actions: string[]) => {
      const r = await prisma.release.create({ data: { organizationId: orgId, kind: "download", slug, title: `Scc ${slug}`, artistName: "A", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), downloadUrl: `https://example.com/${RUN}.zip`, isPublic: true } });
      const s = [];
      for (const [i, action] of actions.entries()) {
        s.push(await prisma.gateStep.create({ data: { releaseId: r.id, position: i, platform: "soundcloud", action, target: action === "follow" ? "https://soundcloud.com/a" : "https://soundcloud.com/a/t", targetId: action === "follow" ? "11" : "22" } }));
      }
      return { r, s };
    };
    const C = await gate(A.id, `scc-c-${RUN}`, ["follow", "comment"]);
    const P = await gate(A.id, `scc-p-${RUN}`, ["follow", "like"]);
    const Bg = await gate(B.id, `scc-bg-${RUN}`, ["follow", "comment"]);
    const step = C.s[0].id;

    // The page: a form posting to droplr.fm, with the sealed context and nothing readable.
    const anon = `scc-anon-${RUN}`;
    const page = await req("GET", `/${A.slug}/${C.r.slug}`, { cookie: `dfm_anon=${anon}` });
    const ctxV = page.text.match(/name="ctx" value="([^"]+)"/)?.[1] ?? "";
    check("a comment gate shows a form that posts to droplr.fm", page.status === 200 && page.text.includes(`action="${SITE}/api/gate/soundcloud/login"`) && /<textarea[^>]*name="comment"[^>]*maxLength="300"|<textarea[^>]*maxLength="300"[^>]*name="comment"/i.test(page.text), `status ${page.status}`);
    check("with a sealed context for this release and this visitor", unpackContext(ctxV, C.r.id)?.anon === anon);
    check("the visitor id isn't readable in the page", !page.text.includes(anon));
    const plainPage = await req("GET", `/${A.slug}/${P.r.slug}`);
    check("a gate without a comment step stays a plain link, with no context", plainPage.status === 200 && plainPage.text.includes("/api/gate/soundcloud/login?step=") && !plainPage.text.includes('name="ctx"'));

    const good = { step, ctx: ctxV, comment: WORDS };
    const origin = new URL(SITE).origin;

    const g1 = await req("GET", `/api/gate/soundcloud/login?step=${step}`);
    check("the plain link on a comment gate sends the fan back to type one", g1.status === 302 && notice(g1.location) === "soundcloud-comment-missing" && !g1.location.includes("soundcloud.com/authorize"), g1.location);

    const noOrigin = await req("POST", "/api/gate/soundcloud/login", { form: good });
    check("no Origin: refused, nothing set", noOrigin.status === 403 && !sccOf(noOrigin.setCookie));
    const evil = await req("POST", "/api/gate/soundcloud/login", { origin: "https://evil.example", form: good });
    check("someone else's site: refused, nothing set", evil.status === 403 && !sccOf(evil.setCookie));
    const otherDomain = await req("POST", "/api/gate/soundcloud/login", { origin: `https://${B.customDomain}`, form: good });
    check("another droplr account's custom domain: refused", otherDomain.status === 403 && !sccOf(otherDomain.setCookie));
    const ownDomain = await req("POST", "/api/gate/soundcloud/login", { origin: `https://${A.customDomain}`, form: good });
    check("the account's own custom domain: refused too (its owner controls what it serves)", ownDomain.status === 403 && !sccOf(ownDomain.setCookie), `${ownDomain.status}`);
    const noCtx = await req("POST", "/api/gate/soundcloud/login", { origin, form: { ...good, ctx: "" } });
    check("no context: sent back, nothing set", noCtx.status === 303 && notice(noCtx.location) === "error" && !sccOf(noCtx.setCookie));

    // On the account's custom domain the comment step is a link to the same gate on droplr.fm: no form, no context.
    await prisma.organization.update({ where: { id: A.id }, data: { customDomainVerifiedAt: new Date(), customDomainLiveAt: new Date() } }).catch(() => {});
    const tenant = await req("GET", `/${C.r.slug}`, { host: A.customDomain!, cookie: `dfm_anon=${anon}` });
    check("on a custom domain the comment step links to droplr.fm instead of showing the form",
      tenant.status === 200 && tenant.text.includes(`href="${SITE}/${A.slug}/${C.r.slug}"`) && !tenant.text.includes('name="ctx"') && !tenant.text.includes('name="comment"'), `status ${tenant.status}`);
    const wrongCtx = await req("POST", "/api/gate/soundcloud/login", { origin, form: { ...good, ctx: packContext({ rid: Bg.r.id, anon: "x", ret: SITE }) } });
    check("a context from another gate is refused", wrongCtx.status === 303 && notice(wrongCtx.location) === "error" && !sccOf(wrongCtx.setCookie));
    const empty = await req("POST", "/api/gate/soundcloud/login", { origin, form: { ...good, comment: "   " } });
    check("no words: sent back to type some, nothing set", empty.status === 303 && notice(empty.location) === "soundcloud-comment-missing" && !sccOf(empty.setCookie));
    const long = await req("POST", "/api/gate/soundcloud/login", { origin, form: { ...good, comment: "x".repeat(SC_COMMENT_MAX + 1) } });
    check("too many words: refused, not cut", long.status === 303 && notice(long.location) === "soundcloud-comment-missing" && !sccOf(long.setCookie));

    const ok = await req("POST", "/api/gate/soundcloud/login", { origin, form: good });
    const cookie = sccOf(ok.setCookie) ?? "";
    const auth = ok.location ? new URL(ok.location) : null;
    const state = auth ? unpackState(auth.searchParams.get("state")) : null;
    check("the fan's own POST goes to SoundCloud with a 303", ok.status === 303 && auth?.host === "secure.soundcloud.com" && auth.pathname === "/authorize", `${ok.status} ${ok.location}`);
    check("and sets the cookie: HTTP-only, Lax, only for these routes, 15 minutes", /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\/api\/gate\/soundcloud/.test(cookie) && /Max-Age=900/.test(cookie), cookie);
    check("the state has the hash and this visitor, and the words are nowhere in the URL", !!state?.nh && state.anon === anon && !ok.location.includes("unreal") && !decodeURIComponent(ok.location).includes(WORDS));
    check("the words aren't readable in the cookie", !cookie.includes("unreal") && !decodeURIComponent(cookie).includes(WORDS));
    check("the return address is the page the fan was on", state?.ret === unpackContext(ctxV, C.r.id)?.ret);

    const plainPost = await req("POST", "/api/gate/soundcloud/login", { origin, form: { step: P.s[0].id, ctx: packContext({ rid: P.r.id, anon, ret: SITE }), comment: WORDS } });
    check("a gate without a comment step sets no cookie, even if words are sent", plainPost.status === 303 && !sccOf(plainPost.setCookie) && !unpackState(new URL(plainPost.location).searchParams.get("state"))?.nh);

    await prisma.organization.update({ where: { id: A.id }, data: { suspendedAt: new Date() } });
    const susp = await req("POST", "/api/gate/soundcloud/login", { origin, form: good });
    check("a suspended account's gate: 404", susp.status === 404 && !sccOf(susp.setCookie));
    await prisma.organization.update({ where: { id: A.id }, data: { suspendedAt: null } });

    // The callback. The cookie is checked before the code is exchanged, so these never reach SoundCloud.
    const stateRaw = auth?.searchParams.get("state") ?? "";
    const jar = cookie.split(";")[0];
    const cb0 = await req("GET", `/api/gate/soundcloud/callback?state=${encodeURIComponent(stateRaw)}&code=fake`);
    check("an approval arriving without the cookie posts nothing", cb0.status === 302 && notice(cb0.location) === "soundcloud-comment-lost", cb0.location);
    const other = await req("POST", "/api/gate/soundcloud/login", { origin, form: { ...good, comment: "other words" } });
    const otherJar = (sccOf(other.setCookie) ?? "").split(";")[0];
    const cb1 = await req("GET", `/api/gate/soundcloud/callback?state=${encodeURIComponent(stateRaw)}&code=fake`, { cookie: otherJar });
    check("this fan's cookie from another start doesn't match someone else's link", cb1.status === 302 && notice(cb1.location) === "soundcloud-comment-lost");
    check("and the callback clears it on the way out", cb1.setCookie.some((c) => c.startsWith(`${sccCookieName(C.r.id)}=;`) && /Max-Age=0/.test(c)), cb1.setCookie.join(" | "));
    const cbCancel = await req("GET", `/api/gate/soundcloud/callback?state=${encodeURIComponent(stateRaw)}`, { cookie: jar });
    check("cancelling on SoundCloud clears it too", notice(cbCancel.location) === "soundcloud-cancelled" && cbCancel.setCookie.some((c) => c.startsWith(`${sccCookieName(C.r.id)}=;`)));
    // Two gates open in one browser: each keeps its own cookie, so the second doesn't wipe the first.
    const okB = await req("POST", "/api/gate/soundcloud/login", { origin, form: { step: Bg.s[0].id, ctx: packContext({ rid: Bg.r.id, anon, ret: SITE }), comment: "b words" } });
    check("a second gate's comment goes in its own cookie", (sccOf(okB.setCookie) ?? "").startsWith(`${sccCookieName(Bg.r.id)}=`) && sccCookieName(Bg.r.id) !== sccCookieName(C.r.id));
    // With the right cookie it goes on to the code exchange, which a fake code and key can't pass:
    // so the answer is anything except "comment missing", which is what proves the binding opened.
    const cb2 = await req("GET", `/api/gate/soundcloud/callback?state=${encodeURIComponent(stateRaw)}&code=fake`, { cookie: jar });
    check("the right cookie gets past the binding (then the fake code fails)", cb2.status === 302 && notice(cb2.location) === "soundcloud-failed", cb2.location);
    const done = await prisma.gateUnlock.count({ where: { releaseId: C.r.id } });
    check("nothing was recorded as done", done === 0);
    check("the comment step's target decodes as a track", decodeScTarget(C.s[1].targetId)?.playlist === false);
  } finally {
    await prisma.gateStep.deleteMany({ where: { release: { organizationId: { in: orgs } } } });
    await prisma.gateUnlock.deleteMany({ where: { release: { organizationId: { in: orgs } } } }).catch(() => {});
    await prisma.release.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1); }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
