import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { completeStep } from "@/lib/downloads";
import { exchangeCode, getSoundCloudCreds, performAction, soundcloudRedirectUri } from "@/lib/soundcloud";
import { SOUNDCLOUD_ACTION_ORDER } from "@/lib/gate-steps";
import { safeReturnUrl, unpackState, withParam } from "@/lib/oauth";
import { SITE_URL } from "@/lib/env";
import { requestMeta } from "@/lib/tracking";

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
 */
export async function GET(req: NextRequest) {
  const state = unpackState(req.nextUrl.searchParams.get("state"));
  const back = await safeReturnUrl(state?.ret, SITE_URL);
  const fail = (why: string) => NextResponse.redirect(withParam(back, "notice", why), 302);

  if (!state?.rid || !state.vid) return fail("error");
  const code = req.nextUrl.searchParams.get("code");
  // They pressed cancel on SoundCloud's screen. Not an error — just an unfinished step.
  if (!code) return NextResponse.redirect(withParam(back, "notice", "soundcloud-cancelled"), 302);
  // A state from before PKCE (or one without a verifier) can't be exchanged: SoundCloud would refuse it.
  if (!state.cv) return fail("soundcloud-failed");

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
    return fail("error");
  }

  const creds = await getSoundCloudCreds(step.release.organizationId);
  if (!creds) return fail("soundcloud-unavailable");

  let token: string;
  try {
    token = (await exchangeCode(creds, code, soundcloudRedirectUri(), state.cv)).access_token;
  } catch (e) {
    console.warn(String(e instanceof Error ? e.message : e));
    return fail("soundcloud-failed");
  }

  // Before acting on the fan's account: if droplr couldn't record the result, it mustn't act.
  const anonId = state.anon;
  if (!anonId) return fail("error");

  // Every SoundCloud action on this gate, performed with the one token the fan just granted.
  // Progress is per platform, so the step is only marked done if all of them succeeded; a retry
  // is safe because an action already in place counts as done (isActionSuccess).
  const scSteps = await prisma.gateStep.findMany({
    where: { releaseId: step.release.id, platform: "soundcloud" },
    select: { action: true, targetId: true },
  });
  const order = (a: string) => { const i = SOUNDCLOUD_ACTION_ORDER.indexOf(a as never); return i < 0 ? 99 : i; };
  scSteps.sort((a, b) => order(a.action) - order(b.action));
  for (const s of scSteps) {
    const targetId = Number(s.targetId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      console.warn(`SoundCloud ${s.action} step has no resolved id; re-save the gate`);
      return fail("soundcloud-failed");
    }
    const action = s.action === "like" || s.action === "repost" ? s.action : "follow";
    if (!(await performAction(token, action, targetId))) return fail("soundcloud-failed");
  }

  const meta = requestMeta(req.headers);
  await completeStep({
    releaseId: step.release.id,
    anonId,
    platform: "soundcloud",
    country: meta.country,
    timezone: meta.timezone,
  });

  return NextResponse.redirect(withParam(back, "done", "soundcloud"), 302);
}
