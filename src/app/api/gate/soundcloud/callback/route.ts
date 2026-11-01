import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { completeStep } from "@/lib/downloads";
import { canComment, decodeScTarget, exchangeCode, getSoundCloudCreds, performAction, postComment, soundcloudRedirectUri } from "@/lib/soundcloud";
import { SOUNDCLOUD_ACTION_ORDER } from "@/lib/gate-steps";
import { safeReturnUrl, unpackState, withParam } from "@/lib/oauth";
import { SITE_URL } from "@/lib/env";
import { requestMeta } from "@/lib/tracking";
import { SCC_PATH, openComment, sccCookieName } from "@/lib/sc-comment";

export const dynamic = "force-dynamic";

/**
 * The fan came back from SoundCloud. Carry out the action they agreed to, and only mark the step
 * done if SoundCloud says it happened.
 *
 * This is the one gate step droplr can honestly call verified, and the reason is here: the
 * follow, like or repost is performed by droplr with the fan's own token, and a non-2xx means
 * the step stays incomplete. Nothing is recorded on optimism.
 *
 * The access token is used once and never stored. droplr has no reason to keep standing write
 * access to a fan's SoundCloud account, and storing it would make a breach far worse than the
 * email addresses alone.
 *
 * A comment step's words come from the dfm_scc cookie the fan's own browser was given when it
 * posted the form (lib/sc-comment), never from the state. The cookie is cleared on every way out.
 */
export async function GET(req: NextRequest) {
  const state = unpackState(req.nextUrl.searchParams.get("state"));
  const back = await safeReturnUrl(state?.ret, SITE_URL);
  // Every way out of this route that isn't success says why in the function log. On 22 Oct one
  // failed callback left no trace at all, and "I can't tell" cost a round trip.
  const scc = state?.rid ? sccCookieName(state.rid) : null;
  const out = (res: NextResponse) => {
    if (scc && req.cookies.get(scc)) res.cookies.set(scc, "", { path: SCC_PATH, maxAge: 0 });
    return res;
  };
  const fail = (why: string, detail: string) => {
    console.warn(`SoundCloud gate callback: ${why} (${detail})`);
    return out(NextResponse.redirect(withParam(back, "notice", why), 302));
  };

  if (!state?.rid || !state.vid) return fail("error", "state missing, expired or unreadable");
  const code = req.nextUrl.searchParams.get("code");
  // They pressed cancel on SoundCloud's screen. Not an error — just an unfinished step.
  if (!code) return out(NextResponse.redirect(withParam(back, "notice", "soundcloud-cancelled"), 302));
  // A state from before PKCE (or one without a verifier) can't be exchanged: SoundCloud would refuse it.
  if (!state.cv) return fail("soundcloud-failed", "state has no PKCE verifier");

  const step = await prisma.gateStep.findUnique({
    where: { id: state.vid },
    include: { release: { select: { id: true, organizationId: true, kind: true, isPublic: true } } },
  });
  // The multi-tenant check: the step, the release in the state and the org must all agree.
  if (
    !step || step.platform !== "soundcloud" ||
    step.release.id !== state.rid || step.release.organizationId !== state.org ||
    step.release.kind !== "download" || !step.release.isPublic
  ) {
    return fail("error", "step does not match the state");
  }

  const scSteps = await prisma.gateStep.findMany({
    where: { releaseId: step.release.id, platform: "soundcloud" },
    select: { action: true, targetId: true },
  });
  // The words, bound to this fan's browser. A link someone else started carries no cookie (or this
  // fan's cookie with a different nonce), so it ends here, before droplr touches the account.
  const commentStep = scSteps.find((s) => s.action === "comment");
  const words = commentStep ? openComment(req.cookies.get(sccCookieName(step.release.id))?.value, step.release.id, state.nh) : null;
  // Not "type a comment": they did. Either this browser lost it (another browser or the SoundCloud
  // app finished the approval, or 15 minutes passed), or the link wasn't started by them.
  if (commentStep && !words) return fail("soundcloud-comment-lost", "comment cookie missing, expired, or not this browser's");
  const commentTarget = commentStep ? decodeScTarget(commentStep.targetId) : null;
  if (commentStep && (!commentTarget || commentTarget.playlist)) return fail("soundcloud-failed", "comment step has no resolved track id; re-save the gate");

  const creds = await getSoundCloudCreds(step.release.organizationId);
  if (!creds) return fail("soundcloud-unavailable", "no SoundCloud keys for this account");

  let token: string;
  try {
    token = (await exchangeCode(creds, code, soundcloudRedirectUri(), state.cv)).access_token;
  } catch (e) {
    return fail("soundcloud-failed", String(e instanceof Error ? e.message : e));
  }

  // Before acting on the fan's account: if droplr couldn't record the result, it mustn't act.
  const anonId = state.anon;
  if (!anonId) return fail("error", "no visitor id in state");

  // Comments switched off since the gate was saved: say so before doing anything else, rather
  // than following and liking and then failing on the last step.
  if (commentTarget && !(await canComment(token, commentTarget.id))) return fail("soundcloud-comment-closed", "comments are off on that track, or it couldn't be read");

  // Every SoundCloud action on this gate, performed with the one token the fan just granted.
  // Progress is per platform, so the step is only marked done if all of them succeeded; a retry
  // is safe because an action already in place counts as done (isActionSuccess).
  const order = (a: string) => { const i = SOUNDCLOUD_ACTION_ORDER.indexOf(a as never); return i < 0 ? 99 : i; };
  scSteps.sort((a, b) => order(a.action) - order(b.action));
  // A fan whose account already follows SoundCloud's maximum can't be made to follow anyone, and
  // no retry changes that. droplr still does the like and repost, opens the gate, and tells them
  // why the follow didn't happen, instead of locking them out over their own account's limit.
  let followCapped = false;
  for (const s of scSteps) {
    if (s.action === "comment") continue;
    const target = decodeScTarget(s.targetId);
    if (!target) return fail("soundcloud-failed", `${s.action} step has no resolved id; re-save the gate`);
    if (s.action !== "follow" && s.action !== "like" && s.action !== "repost") return fail("soundcloud-failed", `unknown SoundCloud action ${s.action}`);
    const action = s.action;
    const r = await performAction(token, action, target);
    if (r.followCapped) { followCapped = true; continue; }
    if (!r.ok) return fail("soundcloud-failed", `${action} refused, see the line above`);
  }

  // Last, because it's the one action a retry repeats (everything above answers 409 the second time).
  if (commentTarget && words && !(await postComment(token, commentTarget.id, words))) {
    return fail("soundcloud-failed", "comment refused, see the line above");
  }

  const meta = requestMeta(req.headers);
  try {
    await completeStep({
      releaseId: step.release.id,
      anonId,
      platform: "soundcloud",
      country: meta.country,
      timezone: meta.timezone,
    });
  } catch (e) {
    // Everything on SoundCloud happened, droplr just couldn't write it down. Clear the cookie anyway,
    // so a retry needs the fan to type a comment again rather than silently posting a second one.
    return fail("error", `actions done on SoundCloud but recording the step failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (followCapped) console.warn("SoundCloud gate callback: follow skipped, the fan's account is at SoundCloud's follow limit; the rest was done");
  return out(NextResponse.redirect(withParam(back, "done", followCapped ? "soundcloud-follow-capped" : "soundcloud"), 302));
}
