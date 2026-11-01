import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSoundCloudCreds, pkcePair, soundcloudAuthorizeUrl, soundcloudRedirectUri } from "@/lib/soundcloud";
import { packState, releasePageUrl, requestOrigin, safeReturnUrl, withParam } from "@/lib/oauth";
import { SITE_URL, soundcloudGateEnforcement } from "@/lib/env";
import { ANON_COOKIE } from "@/lib/tracking";
import { commentOriginAllowed, sccCookieName, sccCookieOptions, sealComment, unpackContext } from "@/lib/sc-comment";

export const dynamic = "force-dynamic";

async function loadStep(stepId: string) {
  const step = await prisma.gateStep.findUnique({
    where: { id: stepId },
    include: { release: { include: { organization: true } } },
  });
  if (!step || step.platform !== "soundcloud" || step.release.kind !== "download" || !step.release.isPublic || step.release.organization.suspendedAt) return null;
  return step;
}

const hasCommentStep = async (releaseId: string) =>
  !!(await prisma.gateStep.findFirst({
    where: { releaseId, platform: "soundcloud", action: "comment" },
    select: { id: true },
  }));

/**
 * Start the SoundCloud step: send the fan to authorise, carrying which gate step they're on.
 *
 * State is the existing encrypted, self-expiring blob — no server-side state table, and it can't
 * be edited by the fan, which matters because what comes back decides whether a "performed"
 * step gets marked done.
 */
export async function GET(req: NextRequest) {
  const step = await loadStep(req.nextUrl.searchParams.get("step") ?? "");
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const back = await safeReturnUrl(
    releasePageUrl(req, step.release.organization, step.release.slug),
    `${SITE_URL}/${step.release.organization.slug}/${step.release.slug}`,
  );

  // Degraded: the gate page is already offering this step as a plain visit, so a stale or
  // hand-typed /login link must not start an authorisation droplr won't act on. Sending them back
  // with the same notice the page shows for an unavailable step keeps one explanation, not two.
  if (soundcloudGateEnforcement() !== "enforced") {
    return NextResponse.redirect(withParam(back, "notice", "soundcloud-unavailable"), 302);
  }

  // A gate with a comment step needs the fan's words, which only the form on the page sends (POST
  // below). A plain link, an old bookmark or a page from before the comment tick lands here.
  if (await hasCommentStep(step.release.id)) {
    return NextResponse.redirect(withParam(back, "notice", "soundcloud-comment-missing"), 302);
  }

  const creds = await getSoundCloudCreds(step.release.organizationId);
  // No key connected and no platform fallback: say so instead of bouncing them to a broken
  // SoundCloud error page. The gate page also hides the step in this state.
  if (!creds) return NextResponse.redirect(withParam(back, "notice", "soundcloud-unavailable"), 302);

  const { host } = requestOrigin(req);
  const pkce = pkcePair();
  const state = packState({
    rid: step.release.id,
    org: step.release.organizationId,
    vid: step.id,
    anon: req.cookies.get(ANON_COOKIE)?.value ?? undefined,
    ret: back,
    ru: host,
    cv: pkce.verifier,
  });
  return NextResponse.redirect(soundcloudAuthorizeUrl(creds, soundcloudRedirectUri(), state, pkce.challenge), 302);
}

/**
 * The same start, for a gate with a comment step: the form on the gate page posts the fan's words
 * here, from droplr.fm's own page only (lib/sc-comment explains why). The words go into an HTTP-only cookie on
 * this host; the state carries only the hash of a nonce, so an authorise link started by anyone
 * else posts nothing.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const step = await loadStep(String(form?.get("step") ?? ""));
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const org = step.release.organization;

  // Before anything is set or sent: only droplr.fm's own page may start this.
  if (!commentOriginAllowed(req.headers.get("origin"))) {
    console.warn("SoundCloud comment start refused: Origin is not droplr.fm");
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const fallback = `${SITE_URL}/${org.slug}/${step.release.slug}`;
  const ctx = unpackContext(String(form?.get("ctx") ?? ""), step.release.id);
  const back = await safeReturnUrl(ctx?.ret, fallback);
  const away = (notice: string) => NextResponse.redirect(withParam(back, "notice", notice), 303);

  if (!ctx) return away("error");
  if (soundcloudGateEnforcement() !== "enforced") return away("soundcloud-unavailable");
  // Without a visitor id the step can't be recorded, and droplr doesn't act on a fan's account
  // for a result it can't keep.
  if (!ctx.anon) return away("error");

  const wantsComment = await hasCommentStep(step.release.id);
  const comment = wantsComment ? sealComment(step.release.id, form?.get("comment")) : null;
  if (wantsComment && !comment) return away("soundcloud-comment-missing");

  const creds = await getSoundCloudCreds(step.release.organizationId);
  if (!creds) return away("soundcloud-unavailable");

  const { host } = requestOrigin(req);
  const pkce = pkcePair();
  const state = packState({
    rid: step.release.id,
    org: step.release.organizationId,
    vid: step.id,
    anon: ctx.anon,
    ret: back,
    ru: host,
    cv: pkce.verifier,
    nh: comment?.nh ?? null,
  });
  // 303: the browser follows with a GET, which is what SoundCloud's authorise page expects.
  const res = NextResponse.redirect(soundcloudAuthorizeUrl(creds, soundcloudRedirectUri(), state, pkce.challenge), 303);
  if (comment) res.cookies.set(sccCookieName(step.release.id), comment.cookie, sccCookieOptions(new URL(SITE_URL).protocol === "https:"));
  return res;
}
