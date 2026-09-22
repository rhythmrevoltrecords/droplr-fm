import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { completeStep } from "@/lib/downloads";
import { exchangeCode, getSoundCloudCreds, performAction, soundcloudRedirectUri } from "@/lib/soundcloud";
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
    token = (await exchangeCode(creds, code, soundcloudRedirectUri())).access_token;
  } catch {
    return fail("soundcloud-failed");
  }

  const targetId = Number(step.targetId);
  if (!Number.isFinite(targetId) || targetId <= 0) return fail("soundcloud-failed");

  const action = step.action === "like" || step.action === "repost" ? step.action : "follow";
  const done = await performAction(token, action, targetId);
  if (!done) return fail("soundcloud-failed");

  const anonId = state.anon;
  if (!anonId) return fail("error");

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
